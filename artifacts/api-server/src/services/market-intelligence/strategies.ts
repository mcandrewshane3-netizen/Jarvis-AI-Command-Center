import type { AssetClass } from "./types";
import type { BacktestStrategy } from "./backtest";
import type { MarketBar } from "./types";

export type StrategyFamily =
  | "MOMENTUM" | "BREAKOUT" | "TREND_FOLLOWING" | "MEAN_REVERSION" | "SWING"
  | "RELATIVE_STRENGTH" | "SECTOR_ROTATION" | "CATALYST_NEWS";
export type ValidationStage = "IDEA" | "BACKTEST" | "OUT_OF_SAMPLE" | "PAPER" | "LIMITED_LIVE" | "SCALED" | "PAUSED" | "RETIRED";
export type StrategyStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "PAUSED" | "RETIRED";
export type StrategyActivationState = "ACTIVE" | "WATCH" | "PAUSED" | "RETIRED" | "CHALLENGER";
export type ExecutableStrategyFamily = Exclude<StrategyFamily, "SECTOR_ROTATION" | "CATALYST_NEWS">;

export interface StrategyDefinition {
  id: string;
  name: string;
  version: string;
  family: StrategyFamily;
  assetClasses: readonly AssetClass[];
  timeframe: string;
  requiredData: readonly string[];
  entryRules: readonly string[];
  exitRules: readonly string[];
  invalidationRules: readonly string[];
  riskRules: readonly string[];
  allowedRegimes: readonly string[];
  parameters: Readonly<Record<string, number>>;
  validationStage: ValidationStage;
  status: StrategyStatus;
  inactiveReason?: string;
}

const commonRisk = ["Risk 1% of current cash to initial stop", "Gross position notional is capped at 20% of current cash"];
const definitions: StrategyDefinition[] = [
  {
    id: "momentum", name: "MOMENTUM", version: "2.0.0", family: "MOMENTUM",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:60"],
    entryRules: ["20-bar close return >= 8%", "Close above 20-bar SMA", "Volume >= 20-bar average"],
    exitRules: ["20-bar return <= 0%", "Close below 10-bar SMA", "8% stop, 16% target, or 20-bar time exit"],
    invalidationRules: ["Momentum or short trend is no longer positive"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "RISK_ON"], parameters: { lookback: 20, minimumReturn: 0.08, stopPercent: 0.08, targetPercent: 0.16, maxHoldingBars: 20 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "breakout", name: "BREAKOUT", version: "2.0.0", family: "BREAKOUT",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:21"],
    entryRules: ["Close exceeds the preceding 20-bar high", "Volume >= 1.5x preceding 20-bar average"],
    exitRules: ["Close below 10-bar low", "7% stop, 14% target, or 20-bar time exit"],
    invalidationRules: ["Price closes back inside the short breakout range"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "HIGH_VOLATILITY"], parameters: { lookback: 20, volumeMultiple: 1.5, stopPercent: 0.07, targetPercent: 0.14, maxHoldingBars: 20 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "trend-following", name: "TREND FOLLOWING", version: "2.0.0", family: "TREND_FOLLOWING",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:50"],
    entryRules: ["20-bar SMA above 50-bar SMA", "Close above 20-bar SMA"],
    exitRules: ["20-bar SMA crosses at or below 50-bar SMA", "10% stop, 20% target, or 60-bar time exit"],
    invalidationRules: ["Medium trend is no longer above long trend"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "TRENDING_DOWN"], parameters: { fastLookback: 20, slowLookback: 50, stopPercent: 0.1, targetPercent: 0.2, maxHoldingBars: 60 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "mean-reversion", name: "MEAN REVERSION", version: "2.0.0", family: "MEAN_REVERSION",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:21"],
    entryRules: ["Close z-score against preceding 20 closes <= -2"],
    exitRules: ["Close returns to preceding 20-bar mean", "6% stop, 9% target, or 10-bar time exit"],
    invalidationRules: ["Price continues beyond the fixed initial stop"], riskRules: commonRisk,
    allowedRegimes: ["RANGE_BOUND", "LOW_VOLATILITY"], parameters: { lookback: 20, entryZScore: -2, stopPercent: 0.06, targetPercent: 0.09, maxHoldingBars: 10 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "swing", name: "SWING", version: "2.0.0", family: "SWING",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:31"],
    entryRules: ["10-bar SMA above 30-bar SMA", "Prior close at or below 10-bar SMA", "Latest close exceeds prior high"],
    exitRules: ["Close below 10-bar SMA", "5% stop, 10% target, or 12-bar time exit"],
    invalidationRules: ["Short swing trend fails"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "NORMAL_VOLATILITY"], parameters: { fastLookback: 10, slowLookback: 30, stopPercent: 0.05, targetPercent: 0.1, maxHoldingBars: 12 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "relative-strength", name: "RELATIVE STRENGTH", version: "2.0.0", family: "RELATIVE_STRENGTH",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV:21", "CROSS_SECTIONAL_OHLCV:21"],
    entryRules: ["20-bar return ranks in the top 20% of a timestamp-aligned bounded universe"],
    exitRules: ["Cross-sectional rank falls below the 50th percentile", "8% stop, 16% target, or 20-bar time exit"],
    invalidationRules: ["Asset no longer has above-median cross-sectional relative strength"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "RISK_ON"], parameters: { lookback: 20, entryRankPercentile: 0.8, exitRankPercentile: 0.5, stopPercent: 0.08, targetPercent: 0.16, maxHoldingBars: 20 },
    validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "sector-rotation", name: "SECTOR ROTATION", version: "1.0.0", family: "SECTOR_ROTATION",
    assetClasses: ["ETF"], timeframe: "1d", requiredData: ["OHLCV", "ETF_BENCHMARKS"],
    entryRules: ["Objective family signal must be present at bar close"], exitRules: ["Exit on objective invalidation, stop, target, or time limit"],
    invalidationRules: ["Signal no longer satisfies deterministic family criteria"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "RISK_ON"], parameters: {}, validationStage: "IDEA", status: "DRAFT",
  },
  {
    id: "catalyst-news", name: "CATALYST NEWS", version: "1.0.0", family: "CATALYST_NEWS",
    assetClasses: ["STOCK", "ETF", "CRYPTO"], timeframe: "1d", requiredData: ["OHLCV", "RELIABLE_CURRENT_NEWS"],
    entryRules: ["Objective family signal must be present at bar close"], exitRules: ["Exit on objective invalidation, stop, target, or time limit"],
    invalidationRules: ["Signal no longer satisfies deterministic family criteria"], riskRules: commonRisk,
    allowedRegimes: ["TRENDING_UP", "RISK_ON"], parameters: {}, validationStage: "IDEA", status: "INACTIVE",
    inactiveReason: "RELIABLE_CURRENT_NEWS_NOT_CONFIGURED",
  },
];
export const INITIAL_STRATEGIES: readonly StrategyDefinition[] = Object.freeze(definitions.map(freezeDefinition));

const NEXT: Record<ValidationStage, readonly ValidationStage[]> = {
  IDEA: ["BACKTEST", "RETIRED"], BACKTEST: ["OUT_OF_SAMPLE", "PAUSED", "RETIRED"],
  OUT_OF_SAMPLE: ["PAPER", "PAUSED", "RETIRED"], PAPER: ["LIMITED_LIVE", "PAUSED", "RETIRED"],
  LIMITED_LIVE: ["SCALED", "PAUSED", "RETIRED"], SCALED: ["PAUSED", "RETIRED"],
  PAUSED: ["BACKTEST", "RETIRED"], RETIRED: [],
};

export function transitionStrategy(
  strategy: StrategyDefinition, target: ValidationStage, options: { liveAuthorized?: boolean } = {},
): StrategyDefinition {
  if ((target === "LIMITED_LIVE" || target === "SCALED") && !options.liveAuthorized) {
    throw new Error("LIVE_VALIDATION_NOT_AUTHORIZED");
  }
  if (!NEXT[strategy.validationStage].includes(target)) throw new Error("VALIDATION_STAGES_MUST_BE_SEQUENTIAL");
  return { ...strategy, validationStage: target, status: target === "RETIRED" ? "RETIRED" : target === "PAUSED" ? "PAUSED" : strategy.status };
}

export function activateCatalystNews(strategy: StrategyDefinition, reliableNewsConfigured: boolean): StrategyDefinition {
  if (strategy.family !== "CATALYST_NEWS") throw new Error("Strategy is not CATALYST_NEWS");
  if (!reliableNewsConfigured) throw new Error("RELIABLE_CURRENT_NEWS_REQUIRED");
  return { ...strategy, status: "DRAFT", inactiveReason: undefined };
}

export interface ExecutableStrategyOptions {
  /** Legacy two-member comparison; use relativeStrengthUniverse for a cross-sectional signal. */
  benchmarkBars?: readonly MarketBar[];
  /**
   * Peers are a fixed, caller-supplied universe. Bars later than the signal bar
   * are discarded before ranking, so this input cannot introduce look-ahead.
   */
  relativeStrengthUniverse?: readonly RelativeStrengthUniverseMember[];
  relativeStrengthSymbol?: string;
}
export interface RelativeStrengthUniverseMember { symbol: string; bars: readonly MarketBar[]; }

/** Creates a long-only strategy whose decisions use only the supplied closed-bar prefix. */
export function createExecutableStrategy(
  definition: StrategyDefinition,
  options: ExecutableStrategyOptions = {},
): BacktestStrategy {
  if (definition.family === "SECTOR_ROTATION" || definition.family === "CATALYST_NEWS") {
    throw new Error(`STRATEGY_NOT_EXECUTABLE:${definition.family}`);
  }
  if (definition.family === "RELATIVE_STRENGTH" && !options.benchmarkBars && !options.relativeStrengthUniverse) {
    throw new Error("CROSS_SECTIONAL_OHLCV_REQUIRED");
  }
  const p = definition.parameters;
  const signal = (history: readonly MarketBar[]): boolean => entrySignal(definition.family as ExecutableStrategyFamily, history, p, options);
  const executable: BacktestStrategy = {
    id: `${definition.id}@${definition.version}`,
    shouldEnter: signal,
    shouldExit(history: readonly MarketBar[], position: Readonly<{ entryPrice: number; entryTime: string }>) {
      if (!history.length) return false;
      const last = history.at(-1)!;
      const stop = p.stopPercent!, target = p.targetPercent!, maximum = p.maxHoldingBars!;
      const held = history.filter((bar) => Date.parse(bar.timestamp) >= Date.parse(position.entryTime)).length;
      if (last.close <= position.entryPrice * (1 - stop) || last.close >= position.entryPrice * (1 + target) || held >= maximum) return true;
      return invalidated(definition.family as ExecutableStrategyFamily, history, p, options);
    },
    positionSize(cash: number, nextOpen: number) {
      const riskQuantity = cash * 0.01 / (nextOpen * p.stopPercent!);
      return Math.max(0, Math.min(riskQuantity, cash * 0.2 / nextOpen));
    },
  };
  return Object.freeze(executable);
}

export class StrategyRegistry {
  private readonly records = new Map<string, { definition: StrategyDefinition; activationState: StrategyActivationState }>();
  constructor(strategies: readonly StrategyDefinition[] = INITIAL_STRATEGIES) {
    for (const strategy of strategies) this.register(strategy);
  }
  register(strategy: StrategyDefinition, activationState: StrategyActivationState = "CHALLENGER"): void {
    validateDefinition(strategy);
    const key = `${strategy.id}@${strategy.version}`;
    if (this.records.has(key)) throw new Error("DUPLICATE_STRATEGY_VERSION");
    this.records.set(key, { definition: freezeDefinition(strategy), activationState });
  }
  get(id: string, version?: string): Readonly<{ definition: StrategyDefinition; activationState: StrategyActivationState }> {
    const matches = [...this.records.values()].filter((record) => record.definition.id === id && (!version || record.definition.version === version));
    if (matches.length !== 1) throw new Error(matches.length ? "STRATEGY_VERSION_REQUIRED" : "STRATEGY_NOT_FOUND");
    return structuredClone(matches[0]);
  }
  list(): ReadonlyArray<Readonly<{ definition: StrategyDefinition; activationState: StrategyActivationState }>> {
    return structuredClone([...this.records.values()]);
  }
  transitionValidation(id: string, version: string, target: ValidationStage, options: { liveAuthorized?: boolean } = {}): void {
    const key = `${id}@${version}`, record = this.records.get(key);
    if (!record) throw new Error("STRATEGY_NOT_FOUND");
    record.definition = freezeDefinition(transitionStrategy(record.definition, target, options));
  }
  setActivation(id: string, version: string, target: StrategyActivationState, authorization: "CONTROLLED_REVIEW" | "LLM"): void {
    if (authorization !== "CONTROLLED_REVIEW") throw new Error("LLM_CANNOT_CHANGE_STRATEGY_STATE");
    const record = this.records.get(`${id}@${version}`);
    if (!record) throw new Error("STRATEGY_NOT_FOUND");
    const allowed: Record<StrategyActivationState, readonly StrategyActivationState[]> = {
      CHALLENGER: ["WATCH", "PAUSED", "RETIRED"], WATCH: ["ACTIVE", "PAUSED", "RETIRED"],
      ACTIVE: ["WATCH", "PAUSED", "RETIRED"], PAUSED: ["WATCH", "RETIRED"], RETIRED: [],
    };
    if (!allowed[record.activationState].includes(target)) throw new Error("INVALID_ACTIVATION_TRANSITION");
    record.activationState = target;
  }
}

function entrySignal(family: ExecutableStrategyFamily, h: readonly MarketBar[], p: Readonly<Record<string, number>>, options: ExecutableStrategyOptions): boolean {
  const last = h.at(-1);
  if (!last) return false;
  if (family === "MOMENTUM") return h.length >= p.lookback! + 1 && rate(h, p.lookback!) >= p.minimumReturn! &&
    last.close > sma(h, p.lookback!) && last.volume >= average(h.slice(-p.lookback!).map((b) => b.volume));
  if (family === "BREAKOUT") {
    if (h.length < p.lookback! + 1) return false;
    const prior = h.slice(-p.lookback! - 1, -1);
    return last.close > Math.max(...prior.map((b) => b.high)) && last.volume >= average(prior.map((b) => b.volume)) * p.volumeMultiple!;
  }
  if (family === "TREND_FOLLOWING") return h.length >= p.slowLookback! && sma(h, p.fastLookback!) > sma(h, p.slowLookback!) && last.close > sma(h, p.fastLookback!);
  if (family === "MEAN_REVERSION") {
    if (h.length < p.lookback! + 1) return false;
    const prior = h.slice(-p.lookback! - 1, -1).map((b) => b.close), mean = average(prior);
    const sd = Math.sqrt(average(prior.map((value) => (value - mean) ** 2)));
    return sd > 0 && (last.close - mean) / sd <= p.entryZScore!;
  }
  if (family === "SWING") {
    if (h.length < p.slowLookback! + 1) return false;
    const prior = h.at(-2)!;
    return sma(h, p.fastLookback!) > sma(h, p.slowLookback!) &&
      prior.close <= sma(h.slice(0, -1), p.fastLookback!) && last.close > prior.high;
  }
  return h.length >= p.lookback! + 1 && relativeStrengthPercentile(h, p.lookback!, options) >= p.entryRankPercentile!;
}

function invalidated(family: ExecutableStrategyFamily, h: readonly MarketBar[], p: Readonly<Record<string, number>>, options: ExecutableStrategyOptions): boolean {
  const last = h.at(-1)!;
  if (family === "MOMENTUM") return h.length >= p.lookback! + 1 && (rate(h, p.lookback!) <= 0 || last.close < sma(h, 10));
  if (family === "BREAKOUT") return h.length >= 11 && last.close < Math.min(...h.slice(-11, -1).map((b) => b.low));
  if (family === "TREND_FOLLOWING") return h.length >= p.slowLookback! && sma(h, p.fastLookback!) <= sma(h, p.slowLookback!);
  if (family === "MEAN_REVERSION") return h.length >= p.lookback! + 1 && last.close >= average(h.slice(-p.lookback! - 1, -1).map((b) => b.close));
  if (family === "SWING") return h.length >= p.fastLookback! && last.close < sma(h, p.fastLookback!);
  return h.length >= p.lookback! + 1 && relativeStrengthPercentile(h, p.lookback!, options) < p.exitRankPercentile!;
}

/** Rank only returns known at the asset signal close. Best return has percentile 1. */
function relativeStrengthPercentile(history: readonly MarketBar[], lookback: number, options: ExecutableStrategyOptions): number {
  const start = history.at(-lookback - 1), end = history.at(-1);
  if (!start || !end || start.close <= 0 || end.close <= 0) return -Infinity;
  const cutoff = Date.parse(end.timestamp);
  if (!Number.isFinite(cutoff)) return -Infinity;
  const peers = options.relativeStrengthUniverse ??
    (options.benchmarkBars ? [{ symbol: "__benchmark__", bars: options.benchmarkBars }] : []);
  const returns = [end.close / start.close - 1];
  for (const peer of peers) {
    if (options.relativeStrengthSymbol && peer.symbol === options.relativeStrengthSymbol) continue;
    const prices = new Map<string, number>();
    for (const bar of peer.bars) {
      const timestamp = Date.parse(bar.timestamp);
      if (!Number.isFinite(timestamp) || timestamp > cutoff || !Number.isFinite(bar.close) || bar.close <= 0) continue;
      prices.set(bar.timestamp, bar.close);
    }
    const peerStart = prices.get(start.timestamp), peerEnd = prices.get(end.timestamp);
    if (peerStart !== undefined && peerEnd !== undefined) returns.push(peerEnd / peerStart - 1);
  }
  // A relative ranking is undefined without at least one aligned peer.
  if (returns.length < 2) return -Infinity;
  const own = returns[0];
  return returns.filter((value) => value <= own).length / returns.length;
}
const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const sma = (history: readonly MarketBar[], lookback: number): number => average(history.slice(-lookback).map((bar) => bar.close));
const rate = (history: readonly MarketBar[], lookback: number): number => history.at(-1)!.close / history.at(-lookback - 1)!.close - 1;

function validateDefinition(strategy: StrategyDefinition): void {
  if (!strategy.id || !strategy.version || !strategy.requiredData.length || !strategy.entryRules.length ||
      !strategy.exitRules.length || !strategy.invalidationRules.length || !strategy.riskRules.length ||
      !strategy.allowedRegimes.length || !/^\d+\.\d+\.\d+$/.test(strategy.version)) throw new Error("INVALID_STRATEGY_DEFINITION");
  if (Object.values(strategy.parameters).some((value) => !Number.isFinite(value))) throw new Error("INVALID_STRATEGY_PARAMETERS");
}
function freezeDefinition(strategy: StrategyDefinition): StrategyDefinition {
  validateDefinition(strategy);
  return Object.freeze({ ...strategy, assetClasses: Object.freeze([...strategy.assetClasses]),
    requiredData: Object.freeze([...strategy.requiredData]), entryRules: Object.freeze([...strategy.entryRules]),
    exitRules: Object.freeze([...strategy.exitRules]), invalidationRules: Object.freeze([...strategy.invalidationRules]),
    riskRules: Object.freeze([...strategy.riskRules]), allowedRegimes: Object.freeze([...strategy.allowedRegimes]),
    parameters: Object.freeze({ ...strategy.parameters }) });
}