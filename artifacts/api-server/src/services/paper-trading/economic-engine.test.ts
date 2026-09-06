import { describe, expect, it } from "vitest";
import {
  AutonomousPaperTradingService, CapitalGovernor, CapitalSurvivalEngine, ExitEngine,
  LiveReadinessEvaluator, PaperBroker, PaperPortfolio, PositionManager,
  StrategyPerformanceTracker, TradingJournal,
  type CapitalGovernorLimits, type PaperPosition,
} from "./index.js";

const now = "2026-01-02T15:00:00.000Z";
const limits: CapitalGovernorLimits = {
  allocations: { STOCK: 0.6, ETF: 0.6, CRYPTO: 0.25 },
  minimumCashReservePercent: 0.1, maxGrossExposurePercent: 0.8,
  maxPositionPercent: 0.25, maxStrategyPercent: 0.4,
  maxCorrelatedExposurePercent: 0.4, maxDrawdownPercent: 0.2,
  maxLosingStreak: 4, protectedProfitPercent: 0.5,
};

function position(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    symbol: "XYZ", assetClass: "STOCK", strategyId: "momentum",
    strategyVersion: "1", quantity: 10, averageEntryPrice: 100,
    currentPrice: 105, openedAt: now, highestPrice: 110, entryFees: 0,
    entrySlippage: 0, ...overrides,
  };
}

describe("PaperBroker lifecycle and accounting", () => {
  it("keeps PAPER labeling and supports partial/full fills and limit lifecycle", () => {
    const broker = new PaperBroker({
      feeRate: 0.001, minimumFee: 0,
      spreadBps: { STOCK: 2, ETF: 1, CRYPTO: 10 },
      slippageBps: { STOCK: 3, ETF: 2, CRYPTO: 15 },
    });
    const order = broker.submit({
      symbol: "AAPL", assetClass: "STOCK", strategyId: "s1", strategyVersion: "1",
      side: "BUY", quantity: 10, orderType: "LIMIT", limitPrice: 101, submittedAt: now,
    });
    expect(order.mode).toBe("PAPER");
    expect(broker.fill(order.id, 102, 10, now).status).toBe("PENDING");
    const partial = broker.fill(order.id, 100, 4, now);
    expect(partial.status).toBe("PARTIALLY_FILLED");
    expect(partial.filledQuantity).toBe(4);
    const full = broker.fill(order.id, 100, 10, now);
    expect(full.status).toBe("FILLED");
    expect(full.fills).toHaveLength(2);
    expect(full.fills.every((fill) => fill.mode === "PAPER" && fill.fee > 0 &&
      fill.spreadCost > 0 && fill.slippageCost > 0)).toBe(true);
  });

  it("calculates costs, gross/net P&L, exposure, and drawdown", () => {
    const costs = {
      feeRate: 0.001, minimumFee: 0,
      spreadBps: { STOCK: 0, ETF: 0, CRYPTO: 0 },
      slippageBps: { STOCK: 0, ETF: 0, CRYPTO: 0 },
    };
    const broker = new PaperBroker(costs);
    const portfolio = new PaperPortfolio("user-1", 10_000);
    const buy = broker.submit({
      symbol: "SPY", assetClass: "ETF", strategyId: "trend", strategyVersion: "1",
      side: "BUY", quantity: 10, orderType: "MARKET", submittedAt: now,
    });
    portfolio.applyBuy(broker.fill(buy.id, 100, 10, now));
    expect(portfolio.snapshot().etfExposure).toBe(1000);
    portfolio.mark("SPY", 90);
    expect(portfolio.snapshot().currentDrawdown).toBeCloseTo(101 / 10_000);
    const sell = broker.submit({
      symbol: "SPY", assetClass: "ETF", strategyId: "trend", strategyVersion: "1",
      side: "SELL", quantity: 10, orderType: "MARKET", submittedAt: now,
    });
    const trade = portfolio.applySell(broker.fill(sell.id, 110, 10, now), "TARGET");
    expect(trade.grossPnl).toBe(100);
    expect(trade.fees).toBeCloseTo(2.1);
    expect(trade.netPnl).toBeCloseTo(97.9);
    expect(portfolio.snapshot().realizedPnL).toBeCloseTo(97.9);
  });
});

describe("risk, exits, and revenge prevention", () => {
  it("never increases risk after losses and explicitly rejects revenge language", () => {
    const governor = new CapitalGovernor(limits);
    const portfolio = new PaperPortfolio("user", 10_000).snapshot();
    const normal = governor.evaluate(portfolio, {
      assetClass: "STOCK", symbol: "A", strategyId: "s", proposedNotional: 1000,
      symbolExposure: 0, correlatedExposure: 0, losingStreak: 0,
    });
    const losses = governor.evaluate(portfolio, {
      assetClass: "STOCK", symbol: "A", strategyId: "s", proposedNotional: 1000,
      symbolExposure: 0, correlatedExposure: 0, losingStreak: 3,
    });
    const revenge = governor.evaluate(portfolio, {
      assetClass: "STOCK", symbol: "A", strategyId: "s", proposedNotional: 1000,
      symbolExposure: 0, correlatedExposure: 0, losingStreak: 1,
      requestReason: "Double the next position to make it back",
    });
    expect(losses.riskMultiplier).toBeLessThanOrEqual(normal.riskMultiplier);
    expect(revenge).toMatchObject({ approved: false, riskMultiplier: 0,
      reason: "REVENGE_TRADING_REJECTED" });
  });

  it("becomes conservative as drawdown and losing streak worsen", () => {
    const engine = new CapitalSurvivalEngine();
    const healthy = engine.evaluate({ equity: 10_000, highWaterMark: 10_000,
      currentDrawdown: 0, maxDrawdown: 0, recentExpectancy: 10,
      profitFactor: 1.5, losingStreak: 0, grossExposurePercent: 0.3 });
    const stressed = engine.evaluate({ equity: 8_000, highWaterMark: 10_000,
      currentDrawdown: 0.2, maxDrawdown: 0.2, recentExpectancy: -20,
      profitFactor: 0.6, losingStreak: 5, grossExposurePercent: 0.9 });
    expect(stressed.score).toBeLessThan(healthy.score);
    expect(stressed.riskMultiplier).toBeLessThan(healthy.riskMultiplier);
  });

  it.each([
    [{ currentPrice: 94, stopPrice: 95 }, "STOP"],
    [{ currentPrice: 111, targetPrice: 110 }, "TARGET"],
    [{ currentPrice: 98, highestPrice: 110, trailingStopPercent: 0.1 }, "TRAIL"],
    [{ invalidated: true }, "INVALIDATION"],
    [{ regimeChanged: true }, "REGIME_CHANGE"],
    [{ signalStrength: 0.1 }, "SIGNAL_DETERIORATION"],
  ] as const)("records exit trigger %j as %s", (change, reason) => {
    expect(new ExitEngine().evaluate(position(change), { now }).reason).toBe(reason);
  });

  it("supports time, governor and manual exits, with deterministic priority", () => {
    const engine = new ExitEngine();
    expect(engine.evaluate(position({ openedAt: "2026-01-01T00:00:00Z", maxHoldingMs: 1000 }),
      { now }).reason).toBe("TIME_EXIT");
    expect(engine.evaluate(position(), { now, capitalGovernorExit: true }).reason)
      .toBe("CAPITAL_GOVERNOR");
    expect(engine.evaluate(position({ stopPrice: 200 }), { now, manualClose: true }).reason)
      .toBe("MANUAL_PAPER_CLOSE");
    expect(new PositionManager().monitor([position()], { XYZ: { now } })[0].shouldExit).toBe(false);
  });
});

describe("performance, autonomous cycle, and immutable live boundary", () => {
  it("keeps leaderboard validation stages separate", () => {
    const tracker = new StrategyPerformanceTracker(1);
    tracker.record({ id: "b", strategyId: "s", strategyVersion: "1", assetClass: "STOCK",
      regime: "UP", stage: "BACKTEST", pnl: 100, returnPercent: 0.1, fees: 1, slippage: 1 });
    tracker.record({ id: "p", strategyId: "s", strategyVersion: "1", assetClass: "STOCK",
      regime: "UP", stage: "PAPER", pnl: -10, returnPercent: -0.01, fees: 1, slippage: 1 });
    expect(tracker.leaderboard("BACKTEST")[0].netPnl).toBe(100);
    expect(tracker.leaderboard("PAPER")[0].netPnl).toBe(-10);
  });

  it("treats NO_TRADE as a successful first-class cycle outcome", async () => {
    const service = new AutonomousPaperTradingService(
      { refresh() {}, scan: () => [{ symbol: "X", assetClass: "STOCK" as const,
        referencePrice: 10, strategyId: "s", strategyVersion: "1", score: 50, dataTimestamp: now }] },
      { evaluate: () => ({ accepted: false, reason: "LOW_QUALITY" }) },
      { shouldResearch: () => false, analyze: () => ({ accepted: true, summary: "" }) },
      { evaluate: () => ({ approved: true, quantity: 1 }) },
      new CapitalGovernor(limits), new PaperBroker(), new PaperPortfolio("u", 10_000),
    );
    await expect(service.runCycle()).resolves.toMatchObject({
      mode: "PAPER", outcome: "NO_TRADE", candidatesEvaluated: 1,
      candidatesRejected: 1, tradesTaken: 0, noTradeDecisions: 1,
    });
    expect(() => service.submitLive()).toThrow("LIVE_TRADING_DISABLED");
  });

  it("can report readiness but can never enable live execution", () => {
    const evaluator = new LiveReadinessEvaluator();
    const result = evaluator.evaluate({
      sampleSize: 200, netExpectancy: 10, profitFactor: 2, maxDrawdown: 0.05,
      outOfSampleTrades: 50, paperTrades: 100, regimeCount: 4,
      slippageSensitivity: 0.1, strategyConcentration: 0.4,
      dataQuality: 0.99, ruleViolations: 0, systemReliability: 0.99,
    });
    expect(result).toMatchObject({
      status: "ELIGIBLE_FOR_LIMITED_LIVE_REVIEW",
      liveTradingEnabled: false, canExecuteLive: false,
    });
    expect(() => evaluator.enableLiveTrading()).toThrow("CANNOT_BE_ENABLED");
  });

  it("rejects hidden reasoning from the journal", () => {
    const journal = new TradingJournal();
    expect(() => journal.record({
      id: "j", mode: "PAPER", tradeId: "t", symbol: "X", assetClass: "STOCK",
      strategyId: "s", strategyVersion: "1", regime: "UP", entry: 1, exit: 2,
      positionSize: 1, risk: 1, tradeQuality: 90, modelAgreement: "AGREE",
      researchSummary: "structured", entryReason: "signal", exitReason: "TARGET",
      grossPnl: 1, fees: 0, slippage: 0, netPnl: 1, ruleViolations: [],
      lessonSummary: "followed rules", recordedAt: now, reasoning: "secret",
    })).toThrow("Hidden reasoning");
  });
});