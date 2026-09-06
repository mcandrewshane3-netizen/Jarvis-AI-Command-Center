import { describe, expect, it } from "vitest";
import {
  CapitalGovernor,
  CapitalSurvivalEngine,
  CapitalSurvivalScore,
  MarketRegimeEngine,
  PaperStrategyLab,
  StrategyPerformanceTracker,
  TradeQualityEngine,
  TradingJournal,
  validateStrategyDefinition,
  validateStrategyTransition,
} from "./engines";

describe("strategy validation", () => {
  it("requires concrete research and risk rules", () => {
    expect(() => validateStrategyDefinition({
      id: "trend-1", name: "Trend", version: "1", status: "DRAFT", family: "TREND_FOLLOWING",
      assetUniverse: ["SPY"], timeframe: "1d", entryRules: ["20-day breakout"],
      exitRules: ["10-day low"], riskRules: [], requiredData: ["close"],
      allowedRegimes: ["BULL_TREND"], performanceMetrics: {}, validationStage: "IDEA",
    })).toThrow(/riskRules/);
  });

  it("allows only sequential validation and never live validation", () => {
    expect(validateStrategyTransition("IDEA", "BACKTEST").allowed).toBe(true);
    expect(validateStrategyTransition("IDEA", "PAPER")).toMatchObject({ allowed: false });
    expect(validateStrategyTransition("PAPER", "LIMITED_LIVE")).toMatchObject({
      allowed: false, reason: "LIVE_VALIDATION_NOT_AUTHORIZED",
    });
    expect(validateStrategyTransition("PAPER", "LIMITED_LIVE", { authorizeLiveValidation: true }).allowed).toBe(true);
  });
});

describe("market regime intelligence", () => {
  const engine = new MarketRegimeEngine();
  it("returns UNKNOWN rather than guessing with missing inputs", () => {
    expect(engine.classify({ priceReturn: 0.1 })).toEqual({
      regime: "UNKNOWN",
      status: "DATA_REQUIRED",
      missingInputs: ["trendStrength", "realizedVolatility"],
    });
  });
  it("classifies complete inputs deterministically", () => {
    expect(engine.classify({ priceReturn: 0.08, trendStrength: 0.4, realizedVolatility: 0.2 }).regime)
      .toBe("BULL_TREND");
  });
});

describe("trade quality", () => {
  it("does not score incomplete objective inputs", () => {
    expect(new TradeQualityEngine().evaluate({ setupQuality: 80 }).score).toBeNull();
  });
  it("normalizes configurable weights to a bounded score", () => {
    const result = new TradeQualityEngine({
      setupQuality: 2, liquidity: 1, riskReward: 1, regimeAlignment: 0,
    }).evaluate({ setupQuality: 100, liquidity: 0, riskReward: 100, regimeAlignment: 20 });
    expect(result).toMatchObject({ status: "SCORED", score: 75 });
  });
  it("rejects out-of-range inputs rather than manufacturing a score", () => {
    expect(() => new TradeQualityEngine().evaluate({
      setupQuality: 101, liquidity: 50, riskReward: 50, regimeAlignment: 50,
    })).toThrow(/between 0 and 100/);
  });
});

describe("capital survival", () => {
  const engine = new CapitalSurvivalEngine();
  it("reduces posture on losses and never increases it because of loss pressure", () => {
    expect(engine.evaluate({
      currentPosture: "NORMAL", dailyPnlPercent: -0.02, drawdownPercent: 0.06,
    })).toMatchObject({ accepted: true, posture: "REDUCED" });
    expect(engine.evaluate({
      currentPosture: "DEFENSIVE", dailyPnlPercent: -0.01, drawdownPercent: 0.05,
      requestedPosture: "NORMAL",
    })).toMatchObject({ accepted: false, posture: "DEFENSIVE", reason: "RISK_INCREASE_REJECTED" });
  });
  it("scores complete objective capital facts and requires missing facts", () => {
    const score = new CapitalSurvivalScore();
    expect(score.evaluate({ currentEquity: 100 }).status).toBe("DATA_REQUIRED");
    expect(score.evaluate({
      startingEquity: 100_000, currentEquity: 100_000, peakEquity: 100_000,
      dailyPnlPercent: 0, cashReservePercent: 0.2,
    })).toMatchObject({ status: "SCORED", score: 100, state: "STRONG" });
  });
  it("rejects revenge-risk requests explicitly", () => {
    expect(engine.evaluate({
      currentPosture: "REDUCED", dailyPnlPercent: -0.02, drawdownPercent: 0.06,
      requestedPosture: "NORMAL", requestReason: "Double down to win it back",
    })).toMatchObject({ accepted: false, reason: "REVENGE_RISK_REJECTED" });
  });
});

describe("capital governor", () => {
  const governor = new CapitalGovernor({
    maxGrossExposurePercent: 0.6,
    maxSymbolConcentrationPercent: 0.2,
    maxDrawdownPercent: 0.15,
  });
  it("rejects order intent beneath deterministic portfolio-level limits", () => {
    const decision = governor.evaluate({
      equity: 100_000, currentGrossExposure: 40_000, currentSymbolExposure: 15_000,
      proposedNotional: 10_000, drawdownPercent: 0.04,
    });
    expect(decision.approved).toBe(false);
    expect(decision.checks.find((check) => check.rule === "CONCENTRATION")?.passed).toBe(false);
  });
  it("halts new intent at the drawdown limit", () => {
    expect(governor.evaluate({
      equity: 100_000, currentGrossExposure: 10_000, currentSymbolExposure: 0,
      proposedNotional: 1_000, drawdownPercent: 0.15,
    }).approved).toBe(false);
  });
});

describe("paper outcomes and journal", () => {
  it("computes actual outcomes and labels a small sample", () => {
    const tracker = new StrategyPerformanceTracker(3);
    tracker.recordOutcome({
      strategyId: "s1", tradeId: "t1", openedAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-02T00:00:00Z", pnl: 100, returnPercent: 0.01, mode: "PAPER",
    });
    tracker.recordOutcome({
      strategyId: "s1", tradeId: "t2", openedAt: "2026-01-03T00:00:00Z",
      closedAt: "2026-01-04T00:00:00Z", pnl: -40, returnPercent: -0.004, mode: "PAPER",
    });
    expect(tracker.summarize("s1")).toMatchObject({
      sampleSize: 2, totalPnl: 60, winRate: 0.5, expectancy: 30,
      profitFactor: 2.5, maxDrawdown: 40, statisticallyMature: false,
      status: "RETEST",
    });
    expect(tracker.summarize("s1").caveat).toContain("Small sample");
  });
  it("rejects non-paper outcomes", () => {
    const tracker = new StrategyPerformanceTracker();
    expect(() => tracker.recordOutcome({
      strategyId: "s", tradeId: "t", openedAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-02T00:00:00Z", pnl: 1, returnPercent: 0.1, mode: "LIVE" as "PAPER",
    })).toThrow(/paper/);
  });
  it("stores only safe structured journal fields", () => {
    const journal = new TradingJournal();
    expect(() => journal.record({
      id: "j1", strategyId: "s", recordedAt: "2026-01-01T00:00:00Z", symbol: "SPY",
      event: "REVIEW", facts: ["Closed above average"], decision: "Observe",
      chainOfThought: "private hidden reasoning",
    })).toThrow(/Chain-of-thought/);
    const saved = journal.record({
      id: "j2", strategyId: "s", recordedAt: "2026-01-01T00:00:00Z", symbol: "SPY",
      event: "HYPOTHESIS", facts: ["Volume expanded"], decision: "Paper test only",
      arbitrary: "discard me",
    });
    expect(saved).not.toHaveProperty("arbitrary");
  });
});

describe("paper strategy lab", () => {
  it("requires authentic market history", () => {
    expect(new PaperStrategyLab().evaluate([])).toEqual({
      status: "DATA_REQUIRED", reason: "MARKET_HISTORY_REQUIRED", metrics: null,
    });
  });
  it("evaluates supplied history deterministically", () => {
    const result = new PaperStrategyLab().evaluate([
      { timestamp: "2026-01-01T00:00:00Z", close: 100 },
      { timestamp: "2026-01-02T00:00:00Z", close: 120 },
      { timestamp: "2026-01-03T00:00:00Z", close: 90 },
    ]);
    expect(result).toMatchObject({ status: "EVALUATED", metrics: { observations: 3 } });
    if (result.status === "EVALUATED") {
      expect(result.metrics.totalReturn).toBeCloseTo(-0.1);
      expect(result.metrics.maxDrawdownPercent).toBe(0.25);
    }
  });
});