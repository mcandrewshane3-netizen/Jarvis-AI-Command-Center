import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  autonomousPaperRuns,
  db,
  strategyDecisionOutcomes,
  users,
} from "@workspace/db";
import type {
  MarketBar,
  MarketDataProvider,
  TradableAsset,
} from "../services/market-intelligence";

type MockRequest = {
  headers: Record<string, string | string[] | undefined>;
  testAuth?: { userId: string; sessionClaims: { sub: string } };
};

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: MockRequest, _res: unknown, next: () => void) => {
    const authorization = req.headers.authorization;
    const token = typeof authorization === "string"
      ? authorization.match(/^Bearer (.+)$/i)?.[1]
      : undefined;
    if (token) req.testAuth = { userId: token, sessionClaims: { sub: token } };
    next();
  },
  getAuth: (req: MockRequest) => req.testAuth ?? { userId: null, sessionClaims: null },
}));

const currentTimestamp = new Date().toISOString();

function canonicalAsset(pair: string): TradableAsset {
  const symbol = pair.replace(/\/USD$/i, "");
  return {
    symbol,
    name: `${symbol}/USD`,
    assetClass: "CRYPTO",
    exchange: null,
    currency: symbol,
    quoteCurrency: "USD",
    tradingHoursType: "TWENTY_FOUR_SEVEN",
    fractionalSupport: "UNKNOWN",
    liquidityData: null,
    providerMetadata: {},
  };
}

const bars: MarketBar[] = Array.from({ length: 200 }, (_, index) => ({
  timestamp: new Date(Date.parse(currentTimestamp) - (199 - index) * 60 * 60_000).toISOString(),
  open: 100,
  high: 100.5,
  low: 99.5,
  close: 100,
  volume: 10_000,
}));

const provider: MarketDataProvider = {
  async getProviderHealth() {
    return { provider: "TWELVE_DATA", configured: true, status: "HEALTHY" };
  },
  async getAssetMetadata(symbol) {
    return canonicalAsset(symbol);
  },
  async getQuote(asset) {
    return {
      provider: "TWELVE_DATA",
      retrievedAt: currentTimestamp,
      marketTimestamp: currentTimestamp,
      freshness: "LIVE_OR_CURRENT",
      asset,
      price: 100,
      bid: null,
      ask: null,
      bidAskStatus: "BID_ASK_UNAVAILABLE",
      volume: 10_000,
    };
  },
  async getBars(asset, interval) {
    return {
      provider: "TWELVE_DATA",
      retrievedAt: currentTimestamp,
      marketTimestamp: currentTimestamp,
      freshness: "LIVE_OR_CURRENT",
      asset,
      interval,
      bars,
    };
  },
  async getHistoricalBars() { throw new Error("not used"); },
  async getMarketStatus() { throw new Error("not used"); },
  async getSupportedAssets() { return []; },
};

const unavailableAiProvider = {
  status: () => ({ configured: false }),
};

describe("JARVIS market conversation authenticated HTTP boundaries", () => {
  const clerkUserA = `jarvis-market-a-${randomUUID()}`;
  const clerkUserB = `jarvis-market-b-${randomUUID()}`;
  let server: Server;
  let base: string;
  let setEconomicRuntime: (overrides: Record<string, unknown> | null) => void;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TWELVE_DATA_API_KEY", "configured-in-test");
    ({ setEconomicEngineRuntimeForTests: setEconomicRuntime } = await import("./economic-engine"));
    setEconomicRuntime({
      marketDataProvider: () => provider,
      openAIProvider: () => unavailableAiProvider,
      grokProvider: () => unavailableAiProvider,
    });
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const port = (server.address() as AddressInfo).port;
    process.env.PORT = String(port);
    base = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.delete(users).where(eq(users.clerkUserId, clerkUserA));
    await db.delete(users).where(eq(users.clerkUserId, clerkUserB));
    setEconomicRuntime(null);
    vi.unstubAllEnvs();
  });

  async function request(
    path: string,
    user: string,
    options: { method?: string; body?: Record<string, unknown> } = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${user}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      text: await response.text(),
    };
  }

  async function createConversation(user: string) {
    const response = await request("/conversations", user, {
      method: "POST",
      body: { title: "Market conversation", domain: "MARKETS" },
    });
    expect(response.status).toBe(201);
    return (JSON.parse(response.text) as { id: string }).id;
  }

  it("forwards authenticated identity to the sole PAPER lifecycle and preserves user isolation", async () => {
    const conversationA = await createConversation(clerkUserA);
    await createConversation(clerkUserB);
    expect((await request("/economic-engine/paper/portfolio", clerkUserA, {
      method: "POST",
      body: { startingCapitalCents: 100_000 },
    })).status).toBe(201);

    const response = await request(
      `/conversations/${conversationA}/messages/stream`,
      clerkUserA,
      {
        method: "POST",
        body: { content: "What looks like the best paper-trade opportunity right now?" },
      },
    );

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("text/event-stream");
    expect(response.text).toContain("Authoritative PAPER cycle outcome: NO_TRADE");
    expect(response.text).toContain("PAPER ONLY. Live trading remains disabled.");
    expect(response.text).toContain("\"providers\":[]");

    const [localA] = await db.select().from(users)
      .where(eq(users.clerkUserId, clerkUserA)).limit(1);
    const [localB] = await db.select().from(users)
      .where(eq(users.clerkUserId, clerkUserB)).limit(1);
    const runsA = await db.select().from(autonomousPaperRuns)
      .where(eq(autonomousPaperRuns.userId, localA.id));
    const runsB = await db.select().from(autonomousPaperRuns)
      .where(eq(autonomousPaperRuns.userId, localB.id));
    expect(runsA).toHaveLength(1);
    expect(runsA[0]).toMatchObject({ outcome: "NO_TRADE", tradesTaken: 0 });
    expect(runsB).toHaveLength(0);
  });

  it("returns only the authenticated user's symbol-specific rejection evidence", async () => {
    const [localA] = await db.select().from(users)
      .where(eq(users.clerkUserId, clerkUserA)).limit(1);
    const [localB] = await db.select().from(users)
      .where(eq(users.clerkUserId, clerkUserB)).limit(1);
    await db.insert(strategyDecisionOutcomes).values([
      {
        userId: localA.id,
        strategyId: "user-a-strategy",
        strategyVersion: "1.0.0",
        symbol: "BTC/USD",
        assetClass: "CRYPTO",
        decision: "NO_TRADE",
        reasonCode: "USER_A_BTC_REASON",
        rationale: { mode: "PAPER" },
      },
      {
        userId: localB.id,
        strategyId: "user-b-strategy",
        strategyVersion: "1.0.0",
        symbol: "BTC/USD",
        assetClass: "CRYPTO",
        decision: "NO_TRADE",
        reasonCode: "USER_B_PRIVATE_REASON",
        rationale: { mode: "PAPER" },
      },
      {
        userId: localA.id,
        strategyId: "user-a-eth-strategy",
        strategyVersion: "1.0.0",
        symbol: "ETH/USD",
        assetClass: "CRYPTO",
        decision: "NO_TRADE",
        reasonCode: "USER_A_ETH_REASON",
        rationale: { mode: "PAPER" },
      },
    ]);
    const conversationA = await createConversation(clerkUserA);

    const response = await request(
      `/conversations/${conversationA}/messages/stream`,
      clerkUserA,
      { method: "POST", body: { content: "Why did you reject BTC?" } },
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain("USER_A_BTC_REASON");
    expect(response.text).not.toContain("USER_B_PRIVATE_REASON");
    expect(response.text).not.toContain("USER_A_ETH_REASON");
  });
});