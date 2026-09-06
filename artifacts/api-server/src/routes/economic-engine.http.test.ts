import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db, learningReviews, paperExecutions, paperPortfolios, paperPositions,
  strategyDecisionOutcomes, strategyPerformances, users,
} from "@workspace/db";

type MockRequest = { headers: Record<string, string | string[] | undefined>; testAuth?: { userId: string; sessionClaims: { sub: string } } };
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: MockRequest, _res: unknown, next: () => void) => {
    const id = req.headers["x-test-user"];
    if (typeof id === "string") req.testAuth = { userId: id, sessionClaims: { sub: id } };
    next();
  },
  getAuth: (req: MockRequest) => req.testAuth ?? { userId: null, sessionClaims: null },
}));

describe("economic engine HTTP boundaries", () => {
  const a = `economic-http-a-${randomUUID()}`;
  const b = `economic-http-b-${randomUUID()}`;
  const c = `economic-http-c-${randomUUID()}`;
  const d = `economic-http-d-${randomUUID()}`;
  const e = `economic-http-e-${randomUUID()}`;
  let server: Server, base: string;
  let setRuntime: (overrides: Record<string, unknown> | null) => void;
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    ({ setEconomicEngineRuntimeForTests: setRuntime } = await import("./economic-engine"));
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.delete(users).where(eq(users.clerkUserId, a));
    await db.delete(users).where(eq(users.clerkUserId, b));
    await db.delete(users).where(eq(users.clerkUserId, c));
    await db.delete(users).where(eq(users.clerkUserId, d));
    await db.delete(users).where(eq(users.clerkUserId, e));
    setRuntime(null);
    vi.unstubAllEnvs();
  });
  async function request(path: string, options: { user?: string; method?: string; body?: Record<string, unknown> } = {}) {
    const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: {
      ...(options.user ? { "x-test-user": options.user } : {}), ...(options.body ? { "content-type": "application/json" } : {}),
    }, body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, body: response.status === 204 ? {} : await response.json() as Record<string, unknown> };
  }
  it("rejects unauthenticated requests and reports unconfigured provider without network use", async () => {
    expect((await request("/economic-engine/economics")).status).toBe(401);
    const status = await request("/economic-engine/market-lab/status", { user: a });
    expect((status.body.providers as Array<Record<string, unknown>>)[0]).toMatchObject({ configured: false, status: "NOT_CONFIGURED" });
    expect((await request("/economic-engine/status", { user: a })).body).toMatchObject({
      mode: "PAPER_ONLY", liveTradingEnabled: false, brokerageExecution: false,
    });
  });
  it("isolates users, ignores forged userId, and excludes paper economics from real result", async () => {
    const forged = randomUUID();
    const real = await request("/economic-engine/economics", { user: a, method: "POST", body: {
      userId: forged, scope: "REAL", category: "REPLIT_DEVELOPMENT_COST", amountCents: 100,
      description: "development", occurredAt: "2026-01-01T00:00:00.000Z",
    } });
    expect(real.status).toBe(201); expect(real.body.userId).not.toBe(forged);
    await request("/economic-engine/economics", { user: a, method: "POST", body: {
      scope: "PAPER", category: "PAPER_TRADING_PNL", amountCents: 99999, description: "simulation", occurredAt: "2026-01-02T00:00:00.000Z",
    } });
    expect((await request("/economic-engine/economics", { user: b })).body).toEqual([]);
    const summary = await request("/economic-engine/economics/summary", { user: a });
    expect(summary.body.netEconomicResultCents).toBe(-100);
    expect(summary.body.paperPerformanceCents).toBe(99999);
  });
  it("requires explicit capital and keeps live execution disabled", async () => {
    expect((await request("/economic-engine/paper/portfolio", { user: b, method: "POST", body: {} })).status).toBe(400);
    const portfolio = await request("/economic-engine/paper/portfolio", { user: b, method: "POST", body: { startingCapitalCents: 100000, userId: randomUUID() } });
    expect(portfolio.status).toBe(201);
    expect((await request("/economic-engine/paper/autonomous-cycle", { user: b, method: "POST" })).status).toBe(409);
    const readiness = await request("/economic-engine/paper/strategies/live-readiness", { user: b });
    expect(readiness.body.liveTradingEnabled).toBe(false);
  });
  it("persists a configured-data PAPER fill, mark, exit, and serialized re-entry", async () => {
    const now = Date.now();
    const bars = Array.from({ length: 200 }, (_, index) => {
      const cycle = Math.floor(index / 6) * 0.5;
      const phase = [0, 1, 2, 3, 4, -4][index % 6] ?? 0;
      const close = 100 + cycle + phase + (index === 199 ? 15 : 0);
      return {
        timestamp: new Date(now - (199 - index) * 60 * 60_000).toISOString(),
        open: close - 0.2,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: index === 199 ? 3_000_000 : 1_000_000,
      };
    });
    let quotePrice = bars.at(-1)!.close;
    let scanBarrier: {
      arrived: number;
      wait: Promise<void>;
      release: () => void;
    } | null = null;
    const asset = {
      symbol: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      assetClass: "ETF",
      exchange: "NYSE",
      currency: "USD",
      quoteCurrency: null,
      tradingHoursType: "EXCHANGE_SESSION",
      fractionalSupport: "UNKNOWN",
      liquidityData: null,
      providerMetadata: {},
    };
    const marketDataProvider = {
      getProviderHealth: async () => ({
        provider: "TWELVE_DATA_TEST",
        configured: true,
        status: "HEALTHY",
      }),
      getAssetMetadata: async () => {
        const barrier = scanBarrier;
        if (barrier) {
          barrier.arrived += 1;
          if (barrier.arrived === 2) barrier.release();
          await barrier.wait;
        }
        return asset;
      },
      getBars: async () => ({
        provider: "TWELVE_DATA_TEST",
        retrievedAt: new Date().toISOString(),
        marketTimestamp: bars.at(-1)!.timestamp,
        freshness: "LIVE_OR_CURRENT",
        asset,
        interval: "1h",
        bars,
      }),
      getQuote: async () => ({
        provider: "TWELVE_DATA_TEST",
        retrievedAt: new Date().toISOString(),
        marketTimestamp: new Date().toISOString(),
        freshness: "LIVE_OR_CURRENT",
        asset,
        price: quotePrice,
        bid: quotePrice - 0.01,
        ask: quotePrice + 0.01,
        bidAskStatus: "AVAILABLE",
        volume: 3_000_000,
      }),
    };
    const aiProvider = {
      status: () => ({ configured: true }),
      completeStructured: async () => ({
        value: { direction: "BULLISH", confidence: 0.95, evidence: ["mocked objective fixture"] },
      }),
    };
    setRuntime({
      marketDataProvider: () => marketDataProvider,
      openAIProvider: () => aiProvider,
      grokProvider: () => aiProvider,
    });
    await request("/economic-engine/paper/portfolio", {
      user: c,
      method: "POST",
      body: { startingCapitalCents: 10_000_000 },
    });

    const entered = await request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" });
    expect(entered.status).toBe(201);
    expect((entered.body.result as Record<string, unknown>).tradesTaken).toBe(1);
    const afterEntry = await request("/economic-engine/paper/portfolio", { user: c });
    expect((afterEntry.body.positions as unknown[])).toHaveLength(1);
    const [localUser] = await db.select().from(users).where(eq(users.clerkUserId, c)).limit(1);
    const [portfolioRow] = await db.select().from(paperPortfolios)
      .where(eq(paperPortfolios.userId, localUser.id)).limit(1);
    const persistedStrategies = await db.select().from(strategyPerformances)
      .where(eq(strategyPerformances.userId, localUser.id));
    expect(new Set(persistedStrategies.map((row) => row.strategyId)).size).toBe(6);
    expect(persistedStrategies.some((row) => row.strategyId === "relative-strength")).toBe(true);
    expect(persistedStrategies.every((row) =>
      row.symbol === "SPY" && row.timeframe === "1h" && row.evaluationStage === "OOS",
    )).toBe(true);
    const initialReviews = await db.select().from(learningReviews)
      .where(eq(learningReviews.userId, localUser.id));
    expect(initialReviews.some((row) => row.cadence === "DAILY")).toBe(true);
    const weeklyReview = initialReviews.find((row) => row.cadence === "WEEKLY");
    expect(weeklyReview).toBeDefined();
    expect((weeklyReview!.review.strategies as unknown[])).toHaveLength(6);
    const weeklyReviewsResponse = await request("/economic-engine/paper/learning/WEEKLY", { user: c });
    expect(weeklyReviewsResponse.status).toBe(200);
    expect((weeklyReviewsResponse.body.reviews as unknown[])).toHaveLength(1);
    await db.insert(paperPositions).values({
      portfolioId: portfolioRow.id,
      userId: localUser.id,
      symbol: "QQQ",
      assetClass: "ETF",
      strategyId: "momentum-v1",
      strategyVersion: "1.0.0",
      status: "OPEN",
      quantity: 2,
      averageEntryCents: Math.round(quotePrice * 100),
      currentPriceCents: Math.round(quotePrice * 100),
      targetCents: Math.round(quotePrice * 110),
      openedAt: new Date(),
      metadata: { highestPrice: quotePrice },
    });

    const held = await request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" });
    expect(held.status).toBe(201);
    expect((held.body.summary as Record<string, unknown>).reason).toBe("OPEN_POSITIONS_HELD");
    const afterMarks = await request("/economic-engine/paper/portfolio", { user: c });
    const markedPositions = afterMarks.body.positions as Array<Record<string, unknown>>;
    expect(markedPositions).toHaveLength(2);
    expect(markedPositions.every((position) => position.currentPriceCents === Math.round(quotePrice * 100))).toBe(true);
    const markedMarketValue = markedPositions.reduce(
      (sum, position) => sum + Number(position.currentPriceCents) * Number(position.quantity),
      0,
    );
    expect(afterMarks.body.equityCents).toBe(Number(afterMarks.body.cashCents) + markedMarketValue);

    quotePrice *= 1.5;
    const exited = await request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" });
    expect(exited.status).toBe(201);
    expect((exited.body.summary as Record<string, unknown>).reason).toBe("POSITIONS_EXITED");
    const review = await request("/economic-engine/paper/review", { user: c });
    expect(review.body.trades).toBe(2);
    expect(typeof review.body.netPnl).toBe("number");
    const completedTradeDecisions = await db.select().from(strategyDecisionOutcomes).where(and(
      eq(strategyDecisionOutcomes.userId, localUser.id),
      eq(strategyDecisionOutcomes.decision, "TRADE"),
    ));
    expect(completedTradeDecisions.some((decision) =>
      decision.outcomeAt !== null && decision.outcome?.status === "CLOSED" &&
      typeof decision.outcome.netPnlCents === "number",
    )).toBe(true);

    quotePrice = bars.at(-1)!.close;
    const beforeRace = await request("/economic-engine/paper/portfolio", { user: c });
    let releaseBarrier = () => {};
    const barrierWait = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    scanBarrier = { arrived: 0, wait: barrierWait, release: releaseBarrier };
    const concurrent = await Promise.all([
      request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" }),
      request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" }),
    ]);
    scanBarrier = null;
    expect(concurrent.map((result) => result.status).sort()).toEqual([201, 409]);
    const afterRace = await request("/economic-engine/paper/portfolio", { user: c });
    expect((afterRace.body.positions as unknown[])).toHaveLength(1);
    expect(afterRace.body.cycleVersion).toBe(Number(beforeRace.body.cycleVersion) + 1);

    const incompleteExecutableQuoteProvider = {
      ...marketDataProvider,
      getQuote: async () => ({
        ...await marketDataProvider.getQuote(),
        bid: null,
        ask: null,
        bidAskStatus: "BID_ASK_UNAVAILABLE",
      }),
    };
    setRuntime({
      marketDataProvider: () => incompleteExecutableQuoteProvider,
      openAIProvider: () => aiProvider,
      grokProvider: () => aiProvider,
    });
    quotePrice *= 1.5;
    const unavailableMarks = await request("/economic-engine/paper/autonomous-cycle", { user: c, method: "POST" });
    expect(unavailableMarks.status).toBe(201);
    expect((unavailableMarks.body.summary as Record<string, unknown>).reason)
      .toBe("POSITIONS_EXITED");
    const afterUnavailableMarks = await request("/economic-engine/paper/portfolio", { user: c });
    expect(afterUnavailableMarks.body.cycleVersion).toBe(Number(afterRace.body.cycleVersion) + 1);
    expect((afterUnavailableMarks.body.positions as unknown[])).toHaveLength(0);
    const executions = await db.select().from(paperExecutions)
      .where(eq(paperExecutions.userId, localUser.id));
    expect(executions.some((execution) =>
      execution.orderIntent.providerBidAskStatus === "BID_ASK_UNAVAILABLE" &&
      execution.orderIntent.paperExecutionCost === "MODELED" &&
      typeof execution.orderIntent.executionSpreadBps === "number",
    )).toBe(true);

    quotePrice = bars.at(-1)!.close;
    await request("/economic-engine/paper/portfolio", {
      user: e,
      method: "POST",
      body: { startingCapitalCents: 10_000_000 },
    });
    const modeledEntry = await request("/economic-engine/paper/autonomous-cycle", { user: e, method: "POST" });
    expect(modeledEntry.status).toBe(201);
    expect((modeledEntry.body.result as Record<string, unknown>).tradesTaken).toBe(1);
    const [modeledEntryUser] = await db.select().from(users).where(eq(users.clerkUserId, e)).limit(1);
    const modeledEntryExecutions = await db.select().from(paperExecutions)
      .where(eq(paperExecutions.userId, modeledEntryUser.id));
    expect(modeledEntryExecutions).toHaveLength(1);
    expect(modeledEntryExecutions[0].orderIntent).toMatchObject({
      providerBidAskStatus: "BID_ASK_UNAVAILABLE",
      paperExecutionCost: "MODELED",
      executionSpreadBps: 1,
    });

    const bearishProvider = {
      ...aiProvider,
      completeStructured: async () => ({
        value: { direction: "BEARISH", confidence: 0.95, evidence: ["mocked adversarial fixture"] },
      }),
    };
    setRuntime({
      marketDataProvider: () => marketDataProvider,
      openAIProvider: () => aiProvider,
      grokProvider: () => bearishProvider,
    });
    await request("/economic-engine/paper/portfolio", {
      user: d,
      method: "POST",
      body: { startingCapitalCents: 10_000_000 },
    });
    const disagreed = await request("/economic-engine/paper/autonomous-cycle", { user: d, method: "POST" });
    expect(disagreed.status).toBe(201);
    expect((disagreed.body.result as Record<string, unknown>).tradesTaken).toBe(0);
    const afterDisagreement = await request("/economic-engine/paper/portfolio", { user: d });
    expect((afterDisagreement.body.positions as unknown[])).toHaveLength(0);

    const neutralProvider = {
      ...aiProvider,
      completeStructured: async () => ({
        value: { direction: "NEUTRAL", confidence: 0.95, evidence: ["mocked neutral fixture"] },
      }),
    };
    setRuntime({
      marketDataProvider: () => marketDataProvider,
      openAIProvider: () => aiProvider,
      grokProvider: () => neutralProvider,
    });
    const mixed = await request("/economic-engine/paper/autonomous-cycle", { user: d, method: "POST" });
    expect(mixed.status).toBe(201);
    expect((mixed.body.result as Record<string, unknown>).tradesTaken).toBe(0);
    const afterMixed = await request("/economic-engine/paper/portfolio", { user: d });
    expect((afterMixed.body.positions as unknown[])).toHaveLength(0);
    setRuntime(null);
  });
});