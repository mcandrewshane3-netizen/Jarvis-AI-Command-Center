import { describe, expect, it, vi } from "vitest";
import { BacktestEngine, type BacktestStrategy } from "./backtest";
import { MarketDataQualityService } from "./market-data-quality";
import { MarketRegimeEngine } from "./market-regime";
import { OpportunityScanner } from "./opportunity-scanner";
import { AIResearchGate, modelAgreement, synthesizeResearch } from "./research";
import { activateCatalystNews, INITIAL_STRATEGIES, transitionStrategy } from "./strategies";
import { TradeQualityEngine } from "./trade-quality";
import { TradingUniverse } from "./universe";
import { TWELVE_DATA_SECRET_NAME, TwelveDataProvider } from "./twelve-data-provider";
import type { MarketBar, TradableAsset } from "./types";

const asset: TradableAsset = {
  symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "ETF", exchange: "NYSE",
  currency: "USD", quoteCurrency: null, tradingHoursType: "EXCHANGE_SESSION",
  fractionalSupport: "UNKNOWN",
  liquidityData: { averageDailyVolume: 80_000_000, averageDailyDollarVolume: 40_000_000_000, spreadBps: 1 },
  providerMetadata: {},
};

const bars = (count: number, start = 100): MarketBar[] => Array.from({ length: count }, (_, index) => {
  const close = start + index * 2;
  return {
    timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: close - 1, high: close + 2, low: close - 2, close, volume: 1_000_000 + index * 100_000,
  };
});

describe("normalized market data and Twelve Data adapter", () => {
  it("reports the exact required secret and makes no request when unconfigured", async () => {
    const fetcher = vi.fn();
    const provider = new TwelveDataProvider({ fetch: fetcher as never });
    expect(await provider.getProviderHealth()).toMatchObject({
      configured: false, status: "NOT_CONFIGURED", requiredSecret: "TWELVE_DATA_API_KEY",
    });
    expect(TWELVE_DATA_SECRET_NAME).toBe("TWELVE_DATA_API_KEY");
    await expect(provider.getQuote(asset)).rejects.toThrow("TWELVE_DATA_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("parses authentic-shaped official REST responses using injected fetch", async () => {
    const fetcher = vi.fn(async (input: URL) => {
      expect(input.hostname).toBe("api.twelvedata.com");
      expect(input.searchParams.get("apikey")).toBe("test-key");
      return {
        ok: true, status: 200,
        json: async () => input.pathname.endsWith("/quote")
          ? { close: "501.25", bid: "501.2", ask: "501.3", volume: "1000", timestamp: 1767225600 }
          : { values: [
            { datetime: "2026-01-02", open: "101", high: "103", low: "100", close: "102", volume: "12" },
            { datetime: "2026-01-01", open: "100", high: "102", low: "99", close: "101", volume: "10" },
          ] },
      };
    });
    const provider = new TwelveDataProvider({
      apiKey: "test-key", fetch: fetcher as never, now: () => new Date("2026-01-02T00:01:00Z"),
    });
    expect((await provider.getQuote(asset)).price).toBe(501.25);
    const result = await provider.getBars(asset, "1day", 2);
    expect(result.bars.map((bar) => bar.close)).toEqual([101, 102]);
    expect(result.asset.assetClass).toBe("ETF");
  });

  it("surfaces provider errors and never fabricates data", async () => {
    const provider = new TwelveDataProvider({
      apiKey: "key",
      fetch: (async () => ({ ok: true, status: 200, json: async () => ({ status: "error", message: "rate limit" }) })) as never,
    });
    await expect(provider.getBars(asset, "1day")).rejects.toThrow("rate limit");
  });
});

describe("freshness and universe liquidity", () => {
  const quality = new MarketDataQualityService();
  it("classifies current, delayed, stale, unavailable, and explicit history", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(quality.classify("2026-01-01T11:59:00Z", "STOCK", now)).toBe("LIVE_OR_CURRENT");
    expect(quality.classify("2026-01-01T11:50:00Z", "STOCK", now)).toBe("DELAYED");
    expect(quality.classify("2025-12-30T00:00:00Z", "STOCK", now)).toBe("STALE");
    expect(quality.classify(undefined, "CRYPTO", now)).toBe("UNAVAILABLE");
    expect(quality.classify("2020-01-01", "ETF", now, true)).toBe("HISTORICAL");
    expect(quality.isUsableForCurrentStrategy("STALE")).toBe(false);
  });

  it("makes each inclusion decision inspectable and excludes unknown liquidity", () => {
    const universe = new TradingUniverse({
      id: "liquid", name: "Liquid ETFs", assetClasses: ["ETF"],
      liquidity: { minimumAverageDailyVolume: 1_000_000, minimumAverageDailyDollarVolume: 100_000_000, maximumSpreadBps: 10 },
    });
    const unknown = { ...asset, symbol: "NEW", liquidityData: null };
    const illiquid = { ...asset, symbol: "THIN", liquidityData: { averageDailyVolume: 10, averageDailyDollarVolume: 100, spreadBps: 50 } };
    expect(universe.members([asset, unknown, illiquid])).toEqual([asset]);
    expect(universe.inspect([unknown])[0]).toMatchObject({ included: false, reasons: ["LIQUIDITY_DATA_REQUIRED"] });
    expect(universe.inspect([illiquid])[0].reasons).toEqual(["VOLUME_TOO_LOW", "DOLLAR_VOLUME_TOO_LOW", "SPREAD_TOO_WIDE"]);
  });
});

describe("objective scanner", () => {
  it("calculates deterministic features and structured evidence before candidacy", () => {
    const scanner = new OpportunityScanner({ lookback: 20, minimumBars: 21, minimumScore: 40 });
    const candidate = scanner.scan(asset, bars(21), bars(21, 100));
    expect(candidate.status).toBe("CANDIDATE");
    expect(candidate.features.rateOfChange).toBeCloseTo(0.4);
    expect(candidate.features.relativeStrength).toBeCloseTo(0);
    expect(candidate.evidence).toHaveLength(4);
    expect(candidate.score).toBeGreaterThanOrEqual(40);
  });

  it("returns NO_TRADE rather than manufacturing evidence with too little history", () => {
    expect(new OpportunityScanner().scan(asset, bars(5))).toMatchObject({
      status: "NO_TRADE", reason: "INSUFFICIENT_HISTORY", score: 0,
    });
  });

  it("rejects non-chronological input", () => {
    expect(() => new OpportunityScanner().scan(asset, bars(21).reverse())).toThrow(/chronological/);
  });
});

describe("strategies and objective regimes", () => {
  it("defines all requested families and ETF-only sector rotation", () => {
    expect(INITIAL_STRATEGIES.map((strategy) => strategy.family)).toEqual([
      "MOMENTUM", "BREAKOUT", "TREND_FOLLOWING", "MEAN_REVERSION", "SWING",
      "RELATIVE_STRENGTH", "SECTOR_ROTATION", "CATALYST_NEWS",
    ]);
    expect(INITIAL_STRATEGIES.find((strategy) => strategy.family === "SECTOR_ROTATION")?.assetClasses).toEqual(["ETF"]);
    expect(INITIAL_STRATEGIES.every((strategy) =>
      strategy.entryRules.length && strategy.exitRules.length && strategy.invalidationRules.length && strategy.riskRules.length,
    )).toBe(true);
  });

  it("keeps catalyst news inactive without a reliable input and guards lifecycle stages", () => {
    const catalyst = INITIAL_STRATEGIES.find((strategy) => strategy.family === "CATALYST_NEWS")!;
    expect(catalyst).toMatchObject({ status: "INACTIVE", inactiveReason: "RELIABLE_CURRENT_NEWS_NOT_CONFIGURED" });
    expect(() => activateCatalystNews(catalyst, false)).toThrow(/RELIABLE_CURRENT_NEWS_REQUIRED/);
    expect(activateCatalystNews(catalyst, true).status).toBe("DRAFT");
    expect(() => transitionStrategy(INITIAL_STRATEGIES[0], "PAPER")).toThrow(/SEQUENTIAL/);
    expect(transitionStrategy(INITIAL_STRATEGIES[0], "BACKTEST").validationStage).toBe("BACKTEST");
    const paper = { ...INITIAL_STRATEGIES[0], validationStage: "PAPER" as const };
    expect(() => transitionStrategy(paper, "LIMITED_LIVE")).toThrow(/NOT_AUTHORIZED/);
  });

  it("returns all UNKNOWN dimensions when required regime facts are missing", () => {
    const engine = new MarketRegimeEngine();
    expect(engine.classify({ priceReturn: 0.1 })).toEqual({
      status: "DATA_REQUIRED",
      dimensions: { trend: "UNKNOWN", volatility: "UNKNOWN", risk: "UNKNOWN" },
      missingInputs: ["trendStrength", "realizedVolatility", "relativeRiskAssetReturn"],
    });
    expect(engine.classify({
      priceReturn: 0.1, trendStrength: 0.4, realizedVolatility: 0.45, relativeRiskAssetReturn: -0.03,
    })).toMatchObject({ status: "CLASSIFIED", dimensions: {
      trend: "TRENDING_UP", volatility: "HIGH_VOLATILITY", risk: "RISK_OFF",
    } });
  });
});

describe("AI research gating and adversarial model policy", () => {
  const qualifying = {
    cacheKey: "SPY:v1", candidateQuality: 80, tradeSignificance: 60, dataCompleteness: 1,
    strategySupport: 0.9, freshness: "LIVE_OR_CURRENT" as const, estimatedCostUsd: 0.02,
    informationVersion: "v1",
  };
  it("gates on freshness/cost and reuses only fresh unchanged research", () => {
    const gate = new AIResearchGate<{ summary: string }>();
    expect(gate.evaluate({ ...qualifying, freshness: "STALE" })).toMatchObject({ action: "SKIP", reason: "DATA_NOT_FRESH" });
    expect(gate.evaluate({ ...qualifying, estimatedCostUsd: 1 })).toMatchObject({ action: "SKIP", reason: "COST_LIMIT" });
    expect(gate.evaluate(qualifying, new Date("2026-01-01T00:00:00Z")).action).toBe("ANALYZE");
    gate.put("SPY:v1", { summary: "structured" }, "v1", new Date("2026-01-01T00:00:00Z"));
    expect(gate.evaluate(qualifying, new Date("2026-01-01T00:10:00Z"))).toMatchObject({
      action: "REUSE_CACHE", cached: { summary: "structured" },
    });
    expect(gate.evaluate({ ...qualifying, informationVersion: "v2" }, new Date("2026-01-01T00:10:00Z")).action).toBe("ANALYZE");
  });

  it("does not average strong independent disagreement away", () => {
    const bull = { direction: "BULLISH" as const, confidence: 0.9, evidenceCount: 3 };
    const bear = { direction: "BEARISH" as const, confidence: 0.8, evidenceCount: 2 };
    expect(modelAgreement(bull, bear)).toBe("STRONG_DISAGREEMENT");
    expect(synthesizeResearch(
      { thesis: "Bull", evidence: ["trend"], confidence: 0.8 },
      { counterThesis: "Bear", evidence: ["valuation"], confidence: 0.7 },
      bull, bear,
    )).toMatchObject({ decision: "NO_TRADE", maximumRiskMultiplier: 0 });
    expect(modelAgreement(null, bear)).toBe("INSUFFICIENT_INFORMATION");
  });
});

describe("deterministic trade quality", () => {
  const complete = {
    strategyEvidence: 90, historicalExpectancy: 80, outOfSampleEvidence: 80, regimeFit: 90,
    liquidity: 100, volatilitySuitability: 80, riskReward: 90, signalStrength: 85,
    catalystQuality: 50, portfolioDiversification: 80, drawdownSafety: 90, executionQuality: 90,
    modelAgreement: "STRONG_AGREEMENT" as const,
  };
  it("requires all essential inputs and recognizes NO_TRADE as valid", () => {
    expect(new TradeQualityEngine().evaluate({ strategyEvidence: 100 })).toMatchObject({
      status: "INSUFFICIENT_DATA", score: null, decision: "NO_TRADE",
    });
    const scored = new TradeQualityEngine().evaluate(complete);
    expect(scored.status).toBe("SCORED");
    expect(scored.score).toBeGreaterThan(70);
    expect(scored.decision).toBe("TRADE_ELIGIBLE");
    expect(new TradeQualityEngine().evaluate({ ...complete, modelAgreement: "STRONG_DISAGREEMENT" }))
      .toMatchObject({ status: "SCORED", score: 0, decision: "NO_TRADE" });
  });
});

describe("chronological no-lookahead backtest", () => {
  it("executes signals only at the next bar and models fees/slippage", () => {
    const observations: Array<{ latestKnown: string; executionExpected: string }> = [];
    const data = bars(10);
    const strategy: BacktestStrategy = {
      id: "timing",
      shouldEnter(history) {
        if (history.length === 2 || history.length === 6) {
          observations.push({ latestKnown: history.at(-1)!.timestamp, executionExpected: data[history.length].timestamp });
          return true;
        }
        return false;
      },
      shouldExit(history) { return history.length === 4 || history.length === 8; },
      positionSize() { return 10; },
    };
    const result = new BacktestEngine({
      startingCapital: 10_000, feePerOrder: 1, feeRate: 0.001, slippageBps: 10,
      trainFraction: 0.6, minimumTrades: 3,
    }).run(data, strategy);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].entryTime).toBe(data[2].timestamp);
    expect(Date.parse(observations[0].latestKnown)).toBeLessThan(Date.parse(observations[0].executionExpected));
    expect(result.all.estimatedFees).toBeGreaterThan(0);
    expect(result.all.estimatedSlippage).toBeGreaterThan(0);
    expect(result.all.netReturn).toBeLessThan(result.all.grossReturn);
    expect(result.all.sampleStatus).toBe("INSUFFICIENT_SAMPLE");
    expect(result.train.tradeCount).toBe(1);
    expect(result.outOfSample.tradeCount).toBe(1);
  });

  it("rejects unsorted data and invalid strategy sizing", () => {
    const strategy: BacktestStrategy = {
      id: "bad", shouldEnter: () => true, shouldExit: () => false, positionSize: () => -1,
    };
    expect(() => new BacktestEngine().run(bars(4).reverse(), strategy)).toThrow(/chronological/);
    expect(() => new BacktestEngine().run(bars(4), strategy)).toThrow(/position size/);
  });
});