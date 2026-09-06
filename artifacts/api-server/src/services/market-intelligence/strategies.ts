import type { AssetClass } from "./types";

export type StrategyFamily =
  | "MOMENTUM" | "BREAKOUT" | "TREND_FOLLOWING" | "MEAN_REVERSION" | "SWING"
  | "RELATIVE_STRENGTH" | "SECTOR_ROTATION" | "CATALYST_NEWS";
export type ValidationStage = "IDEA" | "BACKTEST" | "OUT_OF_SAMPLE" | "PAPER" | "LIMITED_LIVE" | "SCALED" | "PAUSED" | "RETIRED";
export type StrategyStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "PAUSED" | "RETIRED";

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
  validationStage: ValidationStage;
  status: StrategyStatus;
  inactiveReason?: string;
}

const families: Array<[StrategyFamily, AssetClass[]]> = [
  ["MOMENTUM", ["STOCK", "ETF", "CRYPTO"]], ["BREAKOUT", ["STOCK", "ETF", "CRYPTO"]],
  ["TREND_FOLLOWING", ["STOCK", "ETF", "CRYPTO"]], ["MEAN_REVERSION", ["STOCK", "ETF", "CRYPTO"]],
  ["SWING", ["STOCK", "ETF", "CRYPTO"]], ["RELATIVE_STRENGTH", ["STOCK", "ETF"]],
  ["SECTOR_ROTATION", ["ETF"]], ["CATALYST_NEWS", ["STOCK", "ETF", "CRYPTO"]],
];

export const INITIAL_STRATEGIES: readonly StrategyDefinition[] = families.map(([family, assetClasses]) => ({
  id: family.toLowerCase().replaceAll("_", "-"), name: family.replaceAll("_", " "), version: "1.0.0",
  family, assetClasses, timeframe: "1d", requiredData: family === "CATALYST_NEWS"
    ? ["OHLCV", "RELIABLE_CURRENT_NEWS"] : family === "SECTOR_ROTATION" ? ["OHLCV", "ETF_BENCHMARKS"] : ["OHLCV"],
  entryRules: ["Objective family signal must be present at bar close"],
  exitRules: ["Exit on objective invalidation, stop, target, or time limit"],
  invalidationRules: ["Signal no longer satisfies deterministic family criteria"],
  riskRules: ["Position risk is bounded before entry"],
  allowedRegimes: family === "MEAN_REVERSION" ? ["RANGE_BOUND", "LOW_VOLATILITY"] : ["TRENDING_UP", "RISK_ON"],
  validationStage: "IDEA",
  status: family === "CATALYST_NEWS" ? "INACTIVE" : "DRAFT",
  ...(family === "CATALYST_NEWS" ? { inactiveReason: "RELIABLE_CURRENT_NEWS_NOT_CONFIGURED" } : {}),
}));

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