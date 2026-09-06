import type { BacktestMetrics, BacktestResult } from "./backtest";
import type { PerformanceSummary } from "../paper-trading/performance.js";

export type LearningSeverity = "INFO" | "WATCH" | "ACTION";
export interface LearningObservation {
  kind: "OBSERVATION";
  code: string;
  severity: LearningSeverity;
  evidence: Readonly<Record<string, number | string | boolean>>;
}
export interface LearningHypothesis {
  kind: "HYPOTHESIS";
  id: string;
  statement: string;
  basedOn: readonly string[];
  falsificationTest: string;
}
export interface LearningProposal {
  kind: "PROPOSAL";
  id: string;
  action: "RUN_EXPERIMENT" | "PROMOTE_CHALLENGER" | "WATCH_STRATEGY" | "PAUSE_STRATEGY" | "RETEST_STRATEGY";
  strategyId: string;
  strategyVersion: string;
  reasons: readonly string[];
  requiresControlledReview: true;
}
export interface LearningOutput {
  observations: readonly LearningObservation[];
  hypotheses: readonly LearningHypothesis[];
  proposals: readonly LearningProposal[];
}

/** Pure transformer: it has no dependencies and can only return review artifacts. */
export class JarvisLearningEngine {
  analyze(input: Readonly<{
    strategyId: string;
    strategyVersion: string;
    recentOutcomes: readonly number[];
    minimumSample?: number;
  }>): LearningOutput {
    const minimum = input.minimumSample ?? 30;
    validNumbers(input.recentOutcomes);
    const count = input.recentOutcomes.length;
    const expectancy = count ? average(input.recentOutcomes) : 0;
    const observation: LearningObservation = {
      kind: "OBSERVATION", code: count < minimum ? "INSUFFICIENT_SAMPLE" : expectancy < 0 ? "NEGATIVE_EXPECTANCY" : "NON_NEGATIVE_EXPECTANCY",
      severity: count < minimum ? "INFO" : expectancy < 0 ? "WATCH" : "INFO",
      evidence: { sampleSize: count, minimumSample: minimum, expectancy },
    };
    if (count < minimum || expectancy >= 0) return frozen({ observations: [observation], hypotheses: [], proposals: [] });
    const hypothesis: LearningHypothesis = {
      kind: "HYPOTHESIS", id: `${input.strategyId}@${input.strategyVersion}:negative-expectancy`,
      statement: "Observed negative expectancy may indicate parameter or regime mismatch.",
      basedOn: [observation.code], falsificationTest: "Run a preregistered challenger on untouched out-of-sample bars.",
    };
    const proposal: LearningProposal = {
      kind: "PROPOSAL", id: `${hypothesis.id}:experiment`, action: "RUN_EXPERIMENT",
      strategyId: input.strategyId, strategyVersion: input.strategyVersion,
      reasons: ["SUFFICIENT_SAMPLE", "NEGATIVE_EXPECTANCY"], requiresControlledReview: true,
    };
    return frozen({ observations: [observation], hypotheses: [hypothesis], proposals: [proposal] });
  }
}

export interface ExperimentDecision {
  decision: "PROMOTION_PROPOSED" | "KEEP_CHAMPION" | "INSUFFICIENT_EVIDENCE";
  proposal: LearningProposal | null;
  evidence: Readonly<Record<string, number | string | boolean>>;
}

export class StrategyExperimentService {
  compare(champion: BacktestResult, challenger: BacktestResult): ExperimentDecision {
    const c = champion.outOfSample, n = challenger.outOfSample;
    const evidence = {
      championTrades: c.tradeCount, challengerTrades: n.tradeCount,
      championExpectancy: c.expectancy, challengerExpectancy: n.expectancy,
      championDrawdown: c.maxDrawdown, challengerDrawdown: n.maxDrawdown,
      challengerProfitFactor: n.profitFactor ?? 0,
    };
    if (c.sampleStatus !== "SUFFICIENT" || n.sampleStatus !== "SUFFICIENT") {
      return frozen({ decision: "INSUFFICIENT_EVIDENCE", proposal: null, evidence });
    }
    // All fixed gates must pass. There is no discretionary score or weakening path.
    const passes = n.expectancy > c.expectancy && n.netReturn > c.netReturn &&
      n.maxDrawdown <= c.maxDrawdown && (n.profitFactor ?? 0) >= 1.2 && n.tradeCount >= c.tradeCount * 0.8;
    if (!passes) return frozen({ decision: "KEEP_CHAMPION", proposal: null, evidence });
    return frozen({
      decision: "PROMOTION_PROPOSED",
      proposal: {
        kind: "PROPOSAL", id: `${challenger.strategyId}:promotion`, action: "PROMOTE_CHALLENGER",
        strategyId: challenger.strategyId.split("@")[0], strategyVersion: challenger.strategyId.split("@")[1] ?? "UNKNOWN",
        reasons: ["OUT_OF_SAMPLE_EXPECTANCY_IMPROVED", "NET_RETURN_IMPROVED", "DRAWDOWN_NOT_WORSE", "PROFIT_FACTOR_GATE"],
        requiresControlledReview: true,
      },
      evidence,
    });
  }
}

export interface StrategyHealth {
  status: "INSUFFICIENT_SAMPLE" | "HEALTHY" | "WATCH" | "PAUSE_REVIEW";
  score: number | null;
  reasons: readonly string[];
  sampleSize: number;
}

export class StrategyHealthService {
  evaluate(metrics: Pick<BacktestMetrics, "tradeCount" | "expectancy" | "profitFactor" | "maxDrawdown">, minimumSample = 30): StrategyHealth {
    if (metrics.tradeCount < minimumSample) {
      return frozen({ status: "INSUFFICIENT_SAMPLE", score: null, reasons: ["MINIMUM_SAMPLE_NOT_MET"], sampleSize: metrics.tradeCount });
    }
    const factor = metrics.profitFactor ?? (metrics.expectancy > 0 ? 2 : 0);
    const score = round(clamp(50 + metrics.expectancy * 2 + (factor - 1) * 25 - metrics.maxDrawdown * 100, 0, 100));
    const status = metrics.expectancy < 0 && factor < 0.8 ? "PAUSE_REVIEW" :
      metrics.expectancy <= 0 || factor < 1.1 || metrics.maxDrawdown > 0.2 ? "WATCH" : "HEALTHY";
    const reasons = status === "HEALTHY" ? ["EXPECTANCY_AND_RISK_GATES_PASS"] :
      [metrics.expectancy <= 0 ? "NON_POSITIVE_EXPECTANCY" : "RISK_OR_PROFIT_FACTOR_DEGRADED"];
    return frozen({ status, score, reasons, sampleSize: metrics.tradeCount });
  }
  evaluatePerformance(summary: PerformanceSummary, minimumSample = 30): StrategyHealth {
    return this.evaluate({
      tradeCount: summary.sampleSize, expectancy: summary.expectancy,
      profitFactor: summary.profitFactor,
      maxDrawdown: Math.abs(summary.maxDrawdown) / Math.max(1, Math.abs(summary.netPnl) + Math.abs(summary.maxDrawdown)),
    }, minimumSample);
  }
}

export interface ResearchValueEvent {
  id: string;
  cost: number;
  baselineOutcome: number;
  researchedOutcome: number;
}
export class AIResearchValueTracker {
  evaluate(events: readonly ResearchValueEvent[]) {
    if (new Set(events.map((event) => event.id)).size !== events.length) throw new Error("DUPLICATE_RESEARCH_EVENT");
    validNumbers(events.flatMap((event) => [event.cost, event.baselineOutcome, event.researchedOutcome]));
    if (events.some((event) => event.cost < 0)) throw new Error("INVALID_RESEARCH_COST");
    const cost = events.reduce((sum, event) => sum + event.cost, 0);
    const incrementalValue = events.reduce((sum, event) => sum + event.researchedOutcome - event.baselineOutcome, 0);
    return frozen({
      sampleSize: events.length, cost, incrementalValue, netValue: incrementalValue - cost,
      returnOnCost: cost > 0 ? incrementalValue / cost : null,
      status: events.length < 30 ? "INSUFFICIENT_SAMPLE" as const : incrementalValue > cost ? "VALUE_ADD" as const : "NO_PROVEN_VALUE" as const,
    });
  }
}

export interface NoTradeOutcome {
  id: string;
  reason: string;
  hypotheticalReturn: number;
  maximumAdverseExcursion: number;
}
export class NoTradeQualityEvaluator {
  evaluate(outcomes: readonly NoTradeOutcome[]) {
    if (new Set(outcomes.map((item) => item.id)).size !== outcomes.length) throw new Error("DUPLICATE_NO_TRADE_OUTCOME");
    validNumbers(outcomes.flatMap((item) => [item.hypotheticalReturn, item.maximumAdverseExcursion]));
    const avoidedLosses = outcomes.filter((item) => item.hypotheticalReturn < 0);
    const missedWinners = outcomes.filter((item) => item.hypotheticalReturn > 0);
    return frozen({
      sampleSize: outcomes.length,
      avoidedLossRate: outcomes.length ? avoidedLosses.length / outcomes.length : 0,
      avoidedLossValue: -avoidedLosses.reduce((sum, item) => sum + item.hypotheticalReturn, 0),
      missedWinnerValue: missedWinners.reduce((sum, item) => sum + item.hypotheticalReturn, 0),
      averageAvoidedAdverseExcursion: avoidedLosses.length ? average(avoidedLosses.map((item) => item.maximumAdverseExcursion)) : 0,
    });
  }
}

export class DailyLearningReview {
  build(input: Readonly<{ date: string; learning: LearningOutput; noTradeOutcomes: readonly NoTradeOutcome[] }>) {
    requireDate(input.date);
    return frozen({
      period: input.date, cadence: "DAILY" as const,
      observations: input.learning.observations, hypotheses: input.learning.hypotheses,
      proposals: input.learning.proposals, noTradeQuality: new NoTradeQualityEvaluator().evaluate(input.noTradeOutcomes),
    });
  }
}

export class WeeklyStrategyReview {
  build(input: Readonly<{ weekEnding: string; strategyId: string; strategyVersion: string; metrics: BacktestMetrics; learning: LearningOutput }>) {
    requireDate(input.weekEnding);
    return frozen({
      period: input.weekEnding, cadence: "WEEKLY" as const, strategyId: input.strategyId,
      strategyVersion: input.strategyVersion, health: new StrategyHealthService().evaluate(input.metrics),
      observations: input.learning.observations, hypotheses: input.learning.hypotheses,
      proposals: input.learning.proposals,
    });
  }
}

function requireDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error("VALID_REVIEW_DATE_REQUIRED");
}
function validNumbers(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new Error("FINITE_EVIDENCE_REQUIRED");
}
const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const round = (value: number) => Math.round(value * 100) / 100;
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child && typeof child === "object" && !Object.isFrozen(child)) frozen(child);
    }
    Object.freeze(value);
  }
  return value;
}