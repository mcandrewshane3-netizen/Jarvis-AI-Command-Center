/**
 * Deterministic market-research components.  This module deliberately has no
 * broker, order-submission, or live-execution dependency.
 */

export type StrategyValidationStage =
  | "IDEA"
  | "BACKTEST"
  | "OUT_OF_SAMPLE"
  | "PAPER"
  | "LIMITED_LIVE"
  | "SCALED"
  | "PAUSED"
  | "RETIRED";

export type StrategyFamily =
  | "MOMENTUM"
  | "BREAKOUT"
  | "TREND_FOLLOWING"
  | "MEAN_REVERSION"
  | "CATALYST_NEWS"
  | "SWING"
  | "RELATIVE_STRENGTH"
  | "VOLATILITY";

export type StrategyStatus = "DRAFT" | "ACTIVE" | "WATCH" | "REDUCE" | "PAUSE" | "RETEST" | "RETIRE";

export interface StrategyDefinition {
  id: string;
  name: string;
  version: string;
  status: StrategyStatus;
  family: StrategyFamily;
  assetUniverse: readonly string[];
  timeframe: string;
  entryRules: readonly string[];
  exitRules: readonly string[];
  riskRules: readonly string[];
  requiredData: readonly string[];
  allowedRegimes: readonly MarketRegime[];
  performanceMetrics: Record<string, number>;
  validationStage: StrategyValidationStage;
}

const NEXT_STAGES: Record<StrategyValidationStage, readonly StrategyValidationStage[]> = {
  IDEA: ["BACKTEST", "RETIRED"],
  BACKTEST: ["OUT_OF_SAMPLE", "PAUSED", "RETIRED"],
  OUT_OF_SAMPLE: ["PAPER", "PAUSED", "RETIRED"],
  PAPER: ["LIMITED_LIVE", "PAUSED", "RETIRED"],
  LIMITED_LIVE: ["SCALED", "PAUSED", "RETIRED"],
  SCALED: ["PAUSED", "RETIRED"],
  PAUSED: ["BACKTEST", "RETIRED"],
  RETIRED: [],
};

export type StrategyTransitionDecision =
  | { allowed: true; from: StrategyValidationStage; to: StrategyValidationStage }
  | { allowed: false; from: StrategyValidationStage; requested: unknown; reason: string };

export function validateStrategyDefinition(value: unknown): StrategyDefinition {
  if (!value || typeof value !== "object") throw new Error("Strategy definition must be an object");
  const candidate = value as Partial<StrategyDefinition>;
  const requiredText: Array<keyof Pick<StrategyDefinition, "id" | "name" | "version" | "timeframe">> = [
    "id", "name", "version", "timeframe",
  ];
  for (const field of requiredText) {
    if (typeof candidate[field] !== "string" || candidate[field]!.trim().length === 0) {
      throw new Error(`${field} is required`);
    }
  }
  for (const field of ["assetUniverse", "entryRules", "exitRules", "riskRules", "requiredData", "allowedRegimes"] as const) {
    if (!Array.isArray(candidate[field]) || candidate[field]!.length === 0 ||
        candidate[field]!.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      throw new Error(`${field} must contain at least one non-empty rule`);
    }
  }
  if (!isStrategyStage(candidate.validationStage)) throw new Error("Invalid strategy validation stage");
  if (!isStrategyFamily(candidate.family)) throw new Error("Invalid strategy family");
  if (!isStrategyStatus(candidate.status)) throw new Error("Invalid strategy status");
  if (!candidate.performanceMetrics || typeof candidate.performanceMetrics !== "object" ||
      Object.values(candidate.performanceMetrics).some((metric) => !Number.isFinite(metric))) {
    throw new Error("performanceMetrics must be finite numeric values");
  }
  return {
    id: candidate.id!.trim(),
    name: candidate.name!.trim(),
    version: candidate.version!.trim(),
    status: candidate.status,
    family: candidate.family,
    assetUniverse: [...candidate.assetUniverse!],
    timeframe: candidate.timeframe!.trim(),
    entryRules: [...candidate.entryRules!],
    exitRules: [...candidate.exitRules!],
    riskRules: [...candidate.riskRules!],
    requiredData: [...candidate.requiredData!],
    allowedRegimes: [...candidate.allowedRegimes!],
    performanceMetrics: { ...candidate.performanceMetrics },
    validationStage: candidate.validationStage,
  };
}

export function isStrategyStage(value: unknown): value is StrategyValidationStage {
  return typeof value === "string" && Object.hasOwn(NEXT_STAGES, value);
}

export function isStrategyFamily(value: unknown): value is StrategyFamily {
  return typeof value === "string" && [
    "MOMENTUM", "BREAKOUT", "TREND_FOLLOWING", "MEAN_REVERSION", "CATALYST_NEWS",
    "SWING", "RELATIVE_STRENGTH", "VOLATILITY",
  ].includes(value);
}

export function isStrategyStatus(value: unknown): value is StrategyStatus {
  return typeof value === "string" && ["DRAFT", "ACTIVE", "WATCH", "REDUCE", "PAUSE", "RETEST", "RETIRE"].includes(value);
}

export function validateStrategyTransition(
  from: StrategyValidationStage,
  requested: unknown,
  policy: { authorizeLiveValidation?: boolean } = {},
): StrategyTransitionDecision {
  if (!isStrategyStage(from)) {
    return { allowed: false, from, requested, reason: "INVALID_CURRENT_STAGE" };
  }
  if (!isStrategyStage(requested)) {
    return {
      allowed: false,
      from,
      requested,
      reason: typeof requested === "string" && requested.toUpperCase().includes("LIVE")
        ? "LIVE_VALIDATION_NOT_SUPPORTED"
        : "INVALID_TARGET_STAGE",
    };
  }
  if ((requested === "LIMITED_LIVE" || requested === "SCALED") && !policy.authorizeLiveValidation) {
    return { allowed: false, from, requested, reason: "LIVE_VALIDATION_NOT_AUTHORIZED" };
  }
  if (!NEXT_STAGES[from].includes(requested)) {
    return { allowed: false, from, requested, reason: "VALIDATION_STAGES_MUST_BE_SEQUENTIAL" };
  }
  return { allowed: true, from, to: requested };
}

export type MarketRegime = "BULL_TREND" | "BEAR_TREND" | "RANGE" | "HIGH_VOLATILITY" | "UNKNOWN";

export interface MarketRegimeInput {
  priceReturn: number;
  trendStrength: number;
  realizedVolatility: number;
}

export interface MarketRegimeResult {
  regime: MarketRegime;
  status: "OK" | "DATA_REQUIRED";
  missingInputs: Array<keyof MarketRegimeInput>;
}

export class MarketRegimeEngine {
  classify(input: Partial<MarketRegimeInput> | null | undefined): MarketRegimeResult {
    const fields: Array<keyof MarketRegimeInput> = ["priceReturn", "trendStrength", "realizedVolatility"];
    const missingInputs = fields.filter((field) => !Number.isFinite(input?.[field]));
    if (missingInputs.length > 0) return { regime: "UNKNOWN", status: "DATA_REQUIRED", missingInputs };
    const { priceReturn, trendStrength, realizedVolatility } = input as MarketRegimeInput;
    if (realizedVolatility < 0 || trendStrength < 0) {
      return { regime: "UNKNOWN", status: "DATA_REQUIRED", missingInputs: [] };
    }
    if (realizedVolatility >= 0.4) return { regime: "HIGH_VOLATILITY", status: "OK", missingInputs: [] };
    if (trendStrength >= 0.25 && priceReturn > 0) return { regime: "BULL_TREND", status: "OK", missingInputs: [] };
    if (trendStrength >= 0.25 && priceReturn < 0) return { regime: "BEAR_TREND", status: "OK", missingInputs: [] };
    return { regime: "RANGE", status: "OK", missingInputs: [] };
  }
}

export interface TradeQualityInputs {
  setupQuality: number;
  liquidity: number;
  riskReward: number;
  regimeAlignment: number;
}

export type TradeQualityWeights = Record<keyof TradeQualityInputs, number>;

export type TradeQualityResult =
  | { status: "SCORED"; score: number; missingInputs: [] }
  | { status: "DATA_REQUIRED"; score: null; missingInputs: Array<keyof TradeQualityInputs> };

const DEFAULT_QUALITY_WEIGHTS: TradeQualityWeights = {
  setupQuality: 0.35,
  liquidity: 0.2,
  riskReward: 0.3,
  regimeAlignment: 0.15,
};

export class TradeQualityEngine {
  private readonly weights: TradeQualityWeights;

  constructor(weights: Partial<TradeQualityWeights> = DEFAULT_QUALITY_WEIGHTS) {
    this.weights = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };
    const values = Object.values(this.weights);
    if (values.some((weight) => !Number.isFinite(weight) || weight < 0) ||
        values.reduce((sum, weight) => sum + weight, 0) <= 0) {
      throw new Error("Trade-quality weights must be finite, non-negative, and have a positive sum");
    }
  }

  evaluate(input: Partial<TradeQualityInputs> | null | undefined): TradeQualityResult {
    const fields = Object.keys(DEFAULT_QUALITY_WEIGHTS) as Array<keyof TradeQualityInputs>;
    const missingInputs = fields.filter((field) => !Number.isFinite(input?.[field]));
    if (missingInputs.length > 0) return { status: "DATA_REQUIRED", score: null, missingInputs };
    if (fields.some((field) => input![field]! < 0 || input![field]! > 100)) {
      throw new Error("Trade-quality inputs must be between 0 and 100");
    }
    const weightTotal = fields.reduce((sum, field) => sum + this.weights[field], 0);
    const weighted = fields.reduce((sum, field) => sum + input![field]! * this.weights[field], 0);
    const score = Math.round((weighted / weightTotal) * 100) / 100;
    return { status: "SCORED", score: Math.max(0, Math.min(100, score)), missingInputs: [] };
  }
}

export type RiskPosture = "HALTED" | "DEFENSIVE" | "REDUCED" | "NORMAL";

export interface CapitalSurvivalInput {
  currentPosture: RiskPosture;
  dailyPnlPercent: number;
  drawdownPercent: number;
  requestedPosture?: RiskPosture;
  requestReason?: string;
}

export interface CapitalSurvivalResult {
  accepted: boolean;
  posture: RiskPosture;
  reason: "UNCHANGED" | "LOSS_LIMIT" | "DRAWDOWN_LIMIT" | "REVENGE_RISK_REJECTED" | "RISK_INCREASE_REJECTED";
}

const POSTURE_RANK: Record<RiskPosture, number> = { HALTED: 0, DEFENSIVE: 1, REDUCED: 2, NORMAL: 3 };

export class CapitalSurvivalEngine {
  evaluate(input: CapitalSurvivalInput): CapitalSurvivalResult {
    if (!Number.isFinite(input.dailyPnlPercent) || !Number.isFinite(input.drawdownPercent) ||
        input.drawdownPercent < 0 || !Object.hasOwn(POSTURE_RANK, input.currentPosture)) {
      throw new Error("Valid capital-survival inputs are required");
    }
    const revenge = /\b(revenge|win it back|recover losses?|double down|chase losses?)\b/i.test(input.requestReason ?? "");
    if (revenge) {
      return { accepted: false, posture: input.currentPosture, reason: "REVENGE_RISK_REJECTED" };
    }
    let limit: RiskPosture = "NORMAL";
    let reason: CapitalSurvivalResult["reason"] = "UNCHANGED";
    if (input.drawdownPercent >= 0.2 || input.dailyPnlPercent <= -0.05) {
      limit = "HALTED";
      reason = input.drawdownPercent >= 0.2 ? "DRAWDOWN_LIMIT" : "LOSS_LIMIT";
    } else if (input.drawdownPercent >= 0.1 || input.dailyPnlPercent <= -0.03) {
      limit = "DEFENSIVE";
      reason = input.drawdownPercent >= 0.1 ? "DRAWDOWN_LIMIT" : "LOSS_LIMIT";
    } else if (input.drawdownPercent >= 0.05 || input.dailyPnlPercent <= -0.01) {
      limit = "REDUCED";
      reason = input.drawdownPercent >= 0.05 ? "DRAWDOWN_LIMIT" : "LOSS_LIMIT";
    }
    const bounded = POSTURE_RANK[limit] < POSTURE_RANK[input.currentPosture] ? limit : input.currentPosture;
    if (input.requestedPosture && POSTURE_RANK[input.requestedPosture] > POSTURE_RANK[bounded]) {
      return { accepted: false, posture: bounded, reason: "RISK_INCREASE_REJECTED" };
    }
    const posture = input.requestedPosture &&
      POSTURE_RANK[input.requestedPosture] <= POSTURE_RANK[bounded] ? input.requestedPosture : bounded;
    return { accepted: true, posture, reason: posture === input.currentPosture ? "UNCHANGED" : reason };
  }
}

export type CapitalSurvivalState =
  | "STRONG"
  | "HEALTHY"
  | "CAUTION"
  | "DEFENSIVE"
  | "CAPITAL_PRESERVATION"
  | "SURVIVAL";

export interface CapitalSurvivalScoreInput {
  startingEquity: number;
  currentEquity: number;
  peakEquity: number;
  dailyPnlPercent: number;
  cashReservePercent: number;
}

export type CapitalSurvivalScoreResult =
  | { status: "SCORED"; score: number; state: CapitalSurvivalState; missingInputs: [] }
  | { status: "DATA_REQUIRED"; score: null; state: null; missingInputs: Array<keyof CapitalSurvivalScoreInput> };

/** Scores only observable account facts; it never recommends execution. */
export class CapitalSurvivalScore {
  evaluate(input: Partial<CapitalSurvivalScoreInput> | null | undefined): CapitalSurvivalScoreResult {
    const fields: Array<keyof CapitalSurvivalScoreInput> = [
      "startingEquity", "currentEquity", "peakEquity", "dailyPnlPercent", "cashReservePercent",
    ];
    const missingInputs = fields.filter((field) => !Number.isFinite(input?.[field]));
    if (missingInputs.length) return { status: "DATA_REQUIRED", score: null, state: null, missingInputs };
    const facts = input as CapitalSurvivalScoreInput;
    if (facts.startingEquity <= 0 || facts.currentEquity < 0 || facts.peakEquity <= 0 ||
        facts.cashReservePercent < 0 || facts.cashReservePercent > 1) {
      throw new Error("Capital-survival inputs are out of range");
    }
    const drawdown = Math.max(0, (facts.peakEquity - facts.currentEquity) / facts.peakEquity);
    const dailyLoss = Math.max(0, -facts.dailyPnlPercent);
    const totalLoss = Math.max(0, (facts.startingEquity - facts.currentEquity) / facts.startingEquity);
    const score = Math.round(Math.max(0, Math.min(100,
      100 - drawdown * 180 - dailyLoss * 250 - totalLoss * 80 - Math.max(0, 0.1 - facts.cashReservePercent) * 100,
    )) * 100) / 100;
    const state: CapitalSurvivalState = score >= 90 ? "STRONG"
      : score >= 75 ? "HEALTHY"
      : score >= 60 ? "CAUTION"
      : score >= 40 ? "DEFENSIVE"
      : score >= 20 ? "CAPITAL_PRESERVATION"
      : "SURVIVAL";
    return { status: "SCORED", score, state, missingInputs: [] };
  }
}

export interface CapitalLimits {
  maxGrossExposurePercent: number;
  maxSymbolConcentrationPercent: number;
  maxDrawdownPercent: number;
}

export interface CapitalGovernorInput {
  equity: number;
  currentGrossExposure: number;
  currentSymbolExposure: number;
  proposedNotional: number;
  drawdownPercent: number;
}

export interface CapitalGovernorDecision {
  approved: boolean;
  checks: Array<{ rule: "EXPOSURE" | "CONCENTRATION" | "DRAWDOWN"; passed: boolean; actual: number; limit: number }>;
}

export class CapitalGovernor {
  constructor(private readonly limits: CapitalLimits) {
    if (Object.values(limits).some((limit) => !Number.isFinite(limit) || limit < 0)) {
      throw new Error("Capital limits must be finite and non-negative");
    }
  }

  evaluateCapitalSurvival(input: CapitalGovernorInput): CapitalGovernorDecision {
    if (!Number.isFinite(input.equity) || input.equity <= 0 ||
        [input.currentGrossExposure, input.currentSymbolExposure, input.proposedNotional, input.drawdownPercent]
          .some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Valid non-negative account and intent values are required");
    }
    const exposure = (input.currentGrossExposure + input.proposedNotional) / input.equity;
    const concentration = (input.currentSymbolExposure + input.proposedNotional) / input.equity;
    const checks: CapitalGovernorDecision["checks"] = [
      { rule: "EXPOSURE", passed: exposure <= this.limits.maxGrossExposurePercent, actual: exposure, limit: this.limits.maxGrossExposurePercent },
      { rule: "CONCENTRATION", passed: concentration <= this.limits.maxSymbolConcentrationPercent, actual: concentration, limit: this.limits.maxSymbolConcentrationPercent },
      { rule: "DRAWDOWN", passed: input.drawdownPercent < this.limits.maxDrawdownPercent, actual: input.drawdownPercent, limit: this.limits.maxDrawdownPercent },
    ];
    return { approved: checks.every((check) => check.passed), checks };
  }

  evaluate(input: CapitalGovernorInput): CapitalGovernorDecision {
    return this.evaluateCapitalSurvival(input);
  }
}

export interface PaperTradeOutcome {
  strategyId: string;
  tradeId: string;
  openedAt: string;
  closedAt: string;
  pnl: number;
  returnPercent: number;
  mode: "PAPER";
}

export interface StrategyPerformance {
  strategyId: string;
  sampleSize: number;
  totalPnl: number;
  averageReturnPercent: number;
  winRate: number;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
  statisticallyMature: boolean;
  caveat: string | null;
  status: Exclude<StrategyStatus, "DRAFT">;
}

export class StrategyPerformanceTracker {
  private readonly outcomes: PaperTradeOutcome[] = [];

  constructor(private readonly minimumSampleSize = 30) {
    if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 1) throw new Error("Minimum sample size must be positive");
  }

  recordOutcome(input: PaperTradeOutcome): void {
    if (input.mode !== "PAPER") throw new Error("Only paper-trade outcomes may be recorded");
    if (!input.strategyId || !input.tradeId || !Number.isFinite(input.pnl) || !Number.isFinite(input.returnPercent) ||
        !Number.isFinite(Date.parse(input.openedAt)) || !Number.isFinite(Date.parse(input.closedAt)) ||
        Date.parse(input.closedAt) < Date.parse(input.openedAt)) {
      throw new Error("Invalid paper-trade outcome");
    }
    if (this.outcomes.some((outcome) => outcome.tradeId === input.tradeId)) throw new Error("Duplicate tradeId");
    this.outcomes.push({ ...input });
  }

  summarize(strategyId: string): StrategyPerformance {
    const trades = this.outcomes.filter((trade) => trade.strategyId === strategyId);
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const trade of trades) {
      equity += trade.pnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
    const gains = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
    const losses = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
    const sampleSize = trades.length;
    const statisticallyMature = sampleSize >= this.minimumSampleSize;
    const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    const expectancy = sampleSize === 0 ? 0 : totalPnl / sampleSize;
    const profitFactor = losses === 0 ? null : gains / losses;
    const status: Exclude<StrategyStatus, "DRAFT"> = !statisticallyMature ? "RETEST"
      : profitFactor !== null && profitFactor < 0.5 ? "RETIRE"
      : maxDrawdown > Math.max(1, gains) * 0.75 ? "PAUSE"
      : expectancy < 0 ? "REDUCE"
      : profitFactor === null || profitFactor < 1.2 ? "WATCH"
      : "ACTIVE";
    return {
      strategyId,
      sampleSize,
      totalPnl,
      averageReturnPercent: sampleSize === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / sampleSize,
      winRate: sampleSize === 0 ? 0 : trades.filter((trade) => trade.pnl > 0).length / sampleSize,
      expectancy,
      profitFactor,
      maxDrawdown,
      statisticallyMature,
      caveat: statisticallyMature
        ? null
        : `Small sample: ${sampleSize}/${this.minimumSampleSize} closed paper trades; metrics are preliminary.`,
      status,
    };
  }
}

export interface TradingJournalEntry {
  id: string;
  strategyId: string;
  tradeId?: string;
  recordedAt: string;
  symbol: string;
  event: "HYPOTHESIS" | "PAPER_ENTRY" | "PAPER_EXIT" | "REVIEW";
  facts: readonly string[];
  decision: string;
  outcome?: { pnl: number; returnPercent: number };
  tags?: readonly string[];
}

export class TradingJournal {
  private readonly entries: TradingJournalEntry[] = [];

  record(input: TradingJournalEntry & Record<string, unknown>): TradingJournalEntry {
    for (const prohibited of ["chainOfThought", "chain_of_thought", "reasoning", "internalReasoning"]) {
      if (Object.hasOwn(input, prohibited)) throw new Error("Chain-of-thought fields are not permitted");
    }
    if (!input.id || !input.strategyId || !input.symbol || !input.decision ||
        !Number.isFinite(Date.parse(input.recordedAt)) || !Array.isArray(input.facts) ||
        input.facts.some((fact) => typeof fact !== "string")) {
      throw new Error("Invalid structured journal entry");
    }
    if (this.entries.some((entry) => entry.id === input.id)) throw new Error("Duplicate journal id");
    const entry: TradingJournalEntry = {
      id: input.id,
      strategyId: input.strategyId,
      ...(input.tradeId ? { tradeId: input.tradeId } : {}),
      recordedAt: input.recordedAt,
      symbol: input.symbol,
      event: input.event,
      facts: [...input.facts],
      decision: input.decision,
      ...(input.outcome ? { outcome: { ...input.outcome } } : {}),
      ...(input.tags ? { tags: [...input.tags] } : {}),
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  list(): TradingJournalEntry[] {
    return structuredClone(this.entries);
  }
}

export interface MarketHistoryPoint {
  timestamp: string;
  close: number;
}

export type PaperLabResult =
  | { status: "DATA_REQUIRED"; reason: "MARKET_HISTORY_REQUIRED"; metrics: null }
  | { status: "EVALUATED"; metrics: { observations: number; totalReturn: number; maxDrawdownPercent: number } };

export class PaperStrategyLab {
  evaluate(history: readonly MarketHistoryPoint[] | null | undefined): PaperLabResult {
    if (!history || history.length < 2) {
      return { status: "DATA_REQUIRED", reason: "MARKET_HISTORY_REQUIRED", metrics: null };
    }
    if (history.some((point) => !Number.isFinite(point.close) || point.close <= 0 ||
        !Number.isFinite(Date.parse(point.timestamp)))) {
      throw new Error("Market history contains invalid observations");
    }
    let peak = history[0].close;
    let maxDrawdownPercent = 0;
    for (const point of history) {
      peak = Math.max(peak, point.close);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - point.close) / peak);
    }
    return {
      status: "EVALUATED",
      metrics: {
        observations: history.length,
        totalReturn: history[history.length - 1].close / history[0].close - 1,
        maxDrawdownPercent,
      },
    };
  }
}