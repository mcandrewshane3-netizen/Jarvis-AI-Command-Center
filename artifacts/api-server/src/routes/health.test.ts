import { describe, expect, it } from "vitest";
import type { ProviderStatus } from "../services/ai/provider";
import { getReadinessSnapshot } from "./health";

const configuredOpenAI: ProviderStatus = {
  id: "openai",
  name: "OpenAI",
  configured: true,
  available: false,
  health: "DEGRADED",
  reason: "RUNTIME_HEALTH_NOT_VERIFIED",
  capabilities: [],
};

const unavailableGrok: ProviderStatus = {
  id: "grok",
  name: "Grok",
  configured: false,
  available: false,
  health: "NOT_CONFIGURED",
  reason: "NOT_CONFIGURED",
  capabilities: [],
};

describe("dependency-aware readiness", () => {
  it("reports ready when the database responds and at least one AI provider is configured", async () => {
    const snapshot = await getReadinessSnapshot({
      pingDatabase: async () => ({ rows: [{ one: 1 }] }),
      getProviders: async () => [configuredOpenAI, unavailableGrok],
      now: () => new Date("2026-09-07T16:00:00.000Z"),
    });

    expect(snapshot).toEqual({
      status: "ok",
      checks: {
        database: "ok",
        aiProvider: "configured",
        configuredProviderCount: 1,
      },
      timestamp: "2026-09-07T16:00:00.000Z",
    });
  });

  it("fails readiness when the database is unavailable", async () => {
    const snapshot = await getReadinessSnapshot({
      pingDatabase: async () => { throw new Error("db down"); },
      getProviders: async () => [configuredOpenAI],
    });

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.checks.database).toBe("unavailable");
    expect(snapshot.checks.aiProvider).toBe("configured");
  });

  it("fails readiness when no callable AI provider is configured", async () => {
    const snapshot = await getReadinessSnapshot({
      pingDatabase: async () => undefined,
      getProviders: async () => [unavailableGrok],
    });

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.checks.database).toBe("ok");
    expect(snapshot.checks.aiProvider).toBe("unavailable");
    expect(snapshot.checks.configuredProviderCount).toBe(0);
  });

  it("bounds slow dependency checks instead of hanging readiness forever", async () => {
    const never = new Promise<never>(() => undefined);
    const startedAt = Date.now();
    const snapshot = await getReadinessSnapshot({
      pingDatabase: () => never,
      getProviders: async () => [configuredOpenAI],
      timeoutMs: 5,
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.checks.database).toBe("unavailable");
  });
});
