import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, specialistRecords, users } from "@workspace/db";

type MockRequest = {
  headers: Record<string, string | string[] | undefined>;
  testAuth?: { userId: string; sessionClaims: { sub: string } };
};

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () =>
    (req: MockRequest, _res: unknown, next: () => void) => {
      const header = req.headers["x-test-user"];
      const userId = Array.isArray(header) ? header[0] : header;
      if (userId) req.testAuth = { userId, sessionClaims: { sub: userId } };
      next();
    },
  getAuth: (req: MockRequest) => req.testAuth ?? { userId: null, sessionClaims: null },
}));

type JsonResponse = {
  status: number;
  body: Record<string, unknown> | unknown[];
};

describe("specialist HTTP authentication and ownership", () => {
  const clerkUserA = `specialist-http-a-${randomUUID()}`;
  const clerkUserB = `specialist-http-b-${randomUUID()}`;
  const forgedUserId = randomUUID();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.delete(users).where(eq(users.clerkUserId, clerkUserA));
    await db.delete(users).where(eq(users.clerkUserId, clerkUserB));
    vi.unstubAllEnvs();
  });

  async function request(
    path: string,
    options: { user?: string; method?: string; body?: Record<string, unknown> } = {},
  ): Promise<JsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.user ? { "x-test-user": options.user } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return {
      status: response.status,
      body: response.status === 204 ? {} : await response.json() as Record<string, unknown>,
    };
  }

  const recordCases = [
    ["FINANCE", "FINANCIAL_ACCOUNT", {
      name: "Isolation cash",
      type: "CASH",
      currency: "USD",
      balanceCents: 12_345,
      balanceAsOf: "2026-01-15",
    }],
    ["RESEARCH", "RESEARCH_RESULT", { query: "deterministic research", findings: ["one"] }],
    ["CAREER", "CAREER_PROFILE", { headline: "Engineer", skills: ["TypeScript"] }],
    ["WORK", "WORK_PROJECT", { name: "Isolation project", status: "ACTIVE" }],
    ["BUSINESS", "BUSINESS_TASK", { description: "Validate isolation", status: "PLANNED" }],
    ["SOFTWARE", "REQUIREMENT", { description: "Enforce ownership", priority: "MUST" }],
    ["MARKETS", "STRATEGY_DEFINITION", {
      id: "isolation-strategy",
      name: "Paper isolation",
      version: "1.0",
      status: "DRAFT",
      family: "MOMENTUM",
      assetUniverse: ["SPY"],
      timeframe: "1D",
      entryRules: ["Close above moving average"],
      exitRules: ["Close below moving average"],
      riskRules: ["Paper only"],
      requiredData: ["daily close"],
      allowedRegimes: ["BULL_TREND"],
      performanceMetrics: {},
      validationStage: "IDEA",
    }],
  ] as const;

  it.each([...recordCases.map(([domain]) => domain), "GENERAL"])(
    "rejects unauthenticated %s reads",
    async (domain) => {
      const response = await request(`/specialists/${domain}/records`);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
    },
  );

  it("rejects unauthenticated action-plan mutations", async () => {
    const response = await request("/action-plans", {
      method: "POST",
      body: { goal: "Must authenticate", steps: [{ description: "Do work" }] },
    });
    expect(response.status).toBe(401);
  });

  it.each(recordCases)(
    "isolates %s reads and mutations and ignores forged ownership",
    async (domain, recordType, validData) => {
      const created = await request(`/specialists/${domain}/records`, {
        user: clerkUserA,
        method: "POST",
        body: {
          userId: forgedUserId,
          recordType,
          title: `${domain} owner record`,
          data: { ...validData, userId: forgedUserId },
        },
      });
      expect(created.status).toBe(201);
      const record = created.body as Record<string, unknown>;
      const id = record.id as string;
      expect(record.userId).not.toBe(forgedUserId);

      const otherRead = await request(`/specialists/${domain}/records`, { user: clerkUserB });
      expect(otherRead.status).toBe(200);
      expect(otherRead.body).toEqual([]);

      const otherPatch = await request(`/specialists/${domain}/records/${id}`, {
        user: clerkUserB,
        method: "PATCH",
        body: { userId: forgedUserId, title: "stolen", data: validData },
      });
      expect(otherPatch.status).toBe(404);

      const otherDelete = await request(`/specialists/${domain}/records/${id}`, {
        user: clerkUserB,
        method: "DELETE",
        body: { userId: forgedUserId },
      });
      expect(otherDelete.status).toBe(404);

      const ownerRead = await request(`/specialists/${domain}/records`, { user: clerkUserA });
      expect(ownerRead.status).toBe(200);
      expect(ownerRead.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, title: `${domain} owner record` }),
      ]));
    },
  );

  it("isolates GENERAL action plans and ignores forged ownership", async () => {
    const created = await request("/action-plans", {
      user: clerkUserA,
      method: "POST",
      body: {
        userId: forgedUserId,
        goal: "Keep plans private",
        steps: [{
          userId: forgedUserId,
          specialist: "GENERAL",
          description: "Verify plan ownership",
          impact: "HIGH",
          requiresUser: true,
          requiresTool: false,
        }],
      },
    });
    expect(created.status).toBe(201);
    const record = created.body as Record<string, unknown>;
    const id = record.id as string;
    const stepId = ((record.data as { steps: Array<{ id: string }> }).steps[0]).id;
    expect(record.userId).not.toBe(forgedUserId);

    const otherRead = await request("/specialists/GENERAL/records", { user: clerkUserB });
    expect(otherRead.body).toEqual([]);
    const otherPatch = await request(`/action-plans/${id}/steps/${stepId}`, {
      user: clerkUserB,
      method: "PATCH",
      body: { userId: forgedUserId, status: "READY" },
    });
    expect(otherPatch.status).toBe(404);
    const otherDelete = await request(`/specialists/GENERAL/records/${id}`, {
      user: clerkUserB,
      method: "DELETE",
      body: { userId: forgedUserId },
    });
    expect(otherDelete.status).toBe(404);

    const [owner] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserA));
    const stored = await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.id, id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.userId).toBe(owner.id);
  });
});