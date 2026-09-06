import { describe, expect, it } from "vitest";
import type { MarketBar } from "./types";
import {
  createExecutableStrategy, INITIAL_STRATEGIES, StrategyRegistry,
} from "./strategies";
import {
  AIResearchValueTracker, DailyLearningReview, JarvisLearningEngine,
  NoTradeQualityEvaluator, StrategyHealthService,
} from "./learning";

const bars = (count: number, change = 1): MarketBar[] => Array.from({ length: count }, (_, index) => {
  const close = 100 + index * change;
  return {
    timestamp: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    open: close, high: close + 1, low: close - 1, close, volume: 1_000 + index * 10,
  };
});

describe("Economic Engine II executable strategies", () => {
  it("provides complete, versioned and deterministic strategies for all six families", () => {
    const families = ["MOMENTUM", "BREAKOUT", "TREND_FOLLOWING", "MEAN_REVERSION", "SWING", "RELATIVE_STRENGTH"];
    for (const family of families) {
      const definition = INITIAL_STRATEGIES.find((item) => item.family === family)!;
      expect(definition.version).toBe("2.0.0");
      expect(definition.requiredData.length).toBeGreaterThan(0);
      expect(Object.keys(definition.parameters).length).toBeGreaterThan(0);
      const options = family === "RELATIVE_STRENGTH" ? { benchmarkBars: bars(80, 0.1) } : {};
      const strategy = createExecutableStrategy(definition, options);
      const history = bars(60);
      expect(strategy.shouldEnter(history)).toBe(strategy.shouldEnter(structuredClone(history)));
      expect(strategy.positionSize(100_000, 100)).toBeGreaterThan(0);
      expect(typeof strategy.shouldExit(history, { entryPrice: 100, entryTime: history[50].timestamp })).toBe("boolean");
    }
  });

  it("does not inspect future asset or benchmark bars", () => {
    const definition = INITIAL_STRATEGIES.find((item) => item.family === "RELATIVE_STRENGTH")!;
    const history = bars(31, 1);
    const knownBenchmark = bars(31, 0.1);
    const future = bars(10, 100).map((bar, index) => ({
      ...bar, timestamp: new Date(Date.UTC(2025, 2, index + 1)).toISOString(),
    }));
    const a = createExecutableStrategy(definition, { benchmarkBars: knownBenchmark });
    const b = createExecutableStrategy(definition, { benchmarkBars: [...knownBenchmark, ...future] });
    expect(a.shouldEnter(history)).toBe(b.shouldEnter(history));
  });

  it("ranks crypto cross-sectionally instead of treating relative strength as absolute momentum", () => {
    const definition = INITIAL_STRATEGIES.find((item) => item.family === "RELATIVE_STRENGTH")!;
    expect(definition.assetClasses).toContain("CRYPTO");
    const target = bars(31, 1);
    const weakPeer = bars(31, 0.1);
    const strongerPeer = bars(31, 2);
    const topRanked = createExecutableStrategy(definition, {
      relativeStrengthSymbol: "BTC",
      relativeStrengthUniverse: [{ symbol: "ETH", bars: weakPeer }, { symbol: "SOL", bars: weakPeer }],
    });
    const notTopRanked = createExecutableStrategy(definition, {
      relativeStrengthSymbol: "BTC",
      relativeStrengthUniverse: [{ symbol: "ETH", bars: weakPeer }, { symbol: "SOL", bars: strongerPeer }],
    });
    expect(topRanked.shouldEnter(target)).toBe(true);
    expect(notTopRanked.shouldEnter(target)).toBe(false);
    const futureOnlyStrength = [...weakPeer, ...bars(3, 100).map((bar, index) => ({
      ...bar, timestamp: new Date(Date.UTC(2025, 3, index + 1)).toISOString(), close: 1_000_000,
    }))];
    expect(createExecutableStrategy(definition, {
      relativeStrengthUniverse: [{ symbol: "ETH", bars: weakPeer }, { symbol: "SOL", bars: futureOnlyStrength }],
    }).shouldEnter(target)).toBe(true);
  });
});

describe("controlled learning safety and lifecycle", () => {
  it("does not overreact to one loss", () => {
    const output = new JarvisLearningEngine().analyze({
      strategyId: "momentum", strategyVersion: "2.0.0", recentOutcomes: [-100],
    });
    expect(output.observations[0].code).toBe("INSUFFICIENT_SAMPLE");
    expect(output.hypotheses).toEqual([]);
    expect(output.proposals).toEqual([]);
    expect(new StrategyHealthService().evaluate({
      tradeCount: 1, expectancy: -100, profitFactor: 0, maxDrawdown: 0.01,
    }).status).toBe("INSUFFICIENT_SAMPLE");
  });

  it("cannot skip validation or activation lifecycle and an LLM cannot promote", () => {
    const registry = new StrategyRegistry();
    expect(() => registry.transitionValidation("momentum", "2.0.0", "PAPER")).toThrow("SEQUENTIAL");
    expect(() => registry.setActivation("momentum", "2.0.0", "ACTIVE", "LLM")).toThrow("LLM_CANNOT");
    expect(() => registry.setActivation("momentum", "2.0.0", "ACTIVE", "CONTROLLED_REVIEW")).toThrow("INVALID_ACTIVATION");
    registry.setActivation("momentum", "2.0.0", "WATCH", "CONTROLLED_REVIEW");
    registry.setActivation("momentum", "2.0.0", "ACTIVE", "CONTROLLED_REVIEW");
    expect(registry.get("momentum", "2.0.0").activationState).toBe("ACTIVE");
  });

  it("emits frozen artifacts and has no mutation-capable dependencies", () => {
    const engine = new JarvisLearningEngine();
    expect(Object.keys(engine)).toEqual([]);
    const output = engine.analyze({
      strategyId: "momentum", strategyVersion: "2.0.0",
      recentOutcomes: Array.from({ length: 30 }, () => -1),
    });
    expect(output.proposals[0]).toMatchObject({ requiresControlledReview: true, action: "RUN_EXPERIMENT" });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.proposals)).toBe(true);
  });

  it("reviews no-trades and AI research value from supplied outcomes only", () => {
    const noTrades = [{ id: "n1", reason: "LOW_QUALITY", hypotheticalReturn: -5, maximumAdverseExcursion: 8 }];
    expect(new NoTradeQualityEvaluator().evaluate(noTrades)).toMatchObject({
      avoidedLossRate: 1, avoidedLossValue: 5,
    });
    expect(new AIResearchValueTracker().evaluate([{
      id: "r1", cost: 1, baselineOutcome: -2, researchedOutcome: 0,
    }])).toMatchObject({ incrementalValue: 2, netValue: 1, status: "INSUFFICIENT_SAMPLE" });
    const learning = new JarvisLearningEngine().analyze({
      strategyId: "s", strategyVersion: "1.0.0", recentOutcomes: [],
    });
    expect(new DailyLearningReview().build({
      date: "2026-01-01", learning, noTradeOutcomes: noTrades,
    }).cadence).toBe("DAILY");
  });
});