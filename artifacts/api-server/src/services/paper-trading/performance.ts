import type { ClosedPaperTrade, EvaluationStage, ExitReason, PaperAssetClass } from "./contracts.js";

export interface PerformanceOutcome {
  id: string;
  strategyId: string;
  strategyVersion: string;
  assetClass: PaperAssetClass;
  regime: string;
  stage: EvaluationStage;
  pnl: number;
  returnPercent: number;
  fees: number;
  slippage: number;
}

export interface PerformanceSummary {
  strategyId: string;
  strategyVersion: string;
  assetClass: PaperAssetClass;
  stage: EvaluationStage;
  sampleSize: number;
  winRate: number;
  averageWinner: number;
  averageLoser: number;
  expectancy: number;
  profitFactor: number | null;
  netPnl: number;
  return: number;
  maxDrawdown: number;
  fees: number;
  slippage: number;
  regimePerformance: Record<string, number>;
  status: "INSUFFICIENT_SAMPLE" | "PROMISING" | "ACTIVE_PAPER" | "WATCH" | "REDUCE" | "PAUSE" | "RETEST" | "RETIRE";
}

export class StrategyPerformanceTracker {
  private outcomes: PerformanceOutcome[] = [];
  constructor(private readonly minimumSample = 30) {}
  record(outcome: PerformanceOutcome): void {
    if (this.outcomes.some((item) => item.id === outcome.id)) throw new Error("Duplicate outcome");
    if (!Number.isFinite(outcome.pnl) || !Number.isFinite(outcome.returnPercent) ||
        !Number.isFinite(outcome.fees) || !Number.isFinite(outcome.slippage)) throw new Error("Invalid outcome");
    this.outcomes.push(structuredClone(outcome));
  }
  summarize(strategyId: string, strategyVersion: string, assetClass: PaperAssetClass,
    stage: EvaluationStage): PerformanceSummary {
    const trades = this.outcomes.filter((item) => item.strategyId === strategyId &&
      item.strategyVersion === strategyVersion && item.assetClass === assetClass && item.stage === stage);
    const wins = trades.filter((trade) => trade.pnl > 0);
    const losses = trades.filter((trade) => trade.pnl < 0);
    const gains = wins.reduce((sum, trade) => sum + trade.pnl, 0);
    const lossTotal = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
    let curve = 0, peak = 0, maxDrawdown = 0;
    const regimes: Record<string, number> = {};
    for (const trade of trades) {
      curve += trade.pnl; peak = Math.max(peak, curve); maxDrawdown = Math.max(maxDrawdown, peak - curve);
      regimes[trade.regime] = (regimes[trade.regime] ?? 0) + trade.pnl;
    }
    const sampleSize = trades.length;
    const expectancy = sampleSize ? curve / sampleSize : 0;
    const profitFactor = lossTotal ? gains / lossTotal : null;
    const status: PerformanceSummary["status"] = sampleSize < this.minimumSample ? "INSUFFICIENT_SAMPLE" :
      expectancy < 0 && (profitFactor ?? 0) < 0.7 ? "RETIRE" :
      maxDrawdown > Math.max(1, gains) ? "PAUSE" : expectancy < 0 ? "REDUCE" :
      (profitFactor ?? 0) < 1.1 ? "WATCH" : stage === "PAPER" ? "ACTIVE_PAPER" : "PROMISING";
    return {
      strategyId, strategyVersion, assetClass, stage, sampleSize,
      winRate: sampleSize ? wins.length / sampleSize : 0,
      averageWinner: wins.length ? gains / wins.length : 0,
      averageLoser: losses.length ? -lossTotal / losses.length : 0,
      expectancy, profitFactor, netPnl: curve,
      return: trades.reduce((sum, trade) => sum + trade.returnPercent, 0),
      maxDrawdown, fees: trades.reduce((sum, trade) => sum + trade.fees, 0),
      slippage: trades.reduce((sum, trade) => sum + trade.slippage, 0),
      regimePerformance: regimes, status,
    };
  }
  leaderboard(stage: EvaluationStage): PerformanceSummary[] {
    const keys = new Map<string, PerformanceOutcome>();
    this.outcomes.filter((item) => item.stage === stage).forEach((item) =>
      keys.set(`${item.strategyId}|${item.strategyVersion}|${item.assetClass}`, item));
    return [...keys.values()].map((item) =>
      this.summarize(item.strategyId, item.strategyVersion, item.assetClass, stage))
      .sort((a, b) => b.expectancy - a.expectancy);
  }
}

export interface JournalEntry {
  id: string; mode: "PAPER"; tradeId: string; symbol: string; assetClass: PaperAssetClass;
  strategyId: string; strategyVersion: string; regime: string; entry: number; exit: number;
  positionSize: number; risk: number; target?: number; tradeQuality: number; modelAgreement: string;
  researchSummary: string; entryReason: string; exitReason: ExitReason; grossPnl: number;
  fees: number; slippage: number; netPnl: number; ruleViolations: string[]; lessonSummary: string;
  recordedAt: string;
}

export class TradingJournal {
  private entries: JournalEntry[] = [];
  record(input: JournalEntry & Record<string, unknown>): JournalEntry {
    for (const key of ["chainOfThought", "reasoning", "internalReasoning"]) {
      if (Object.hasOwn(input, key)) throw new Error("Hidden reasoning is prohibited");
    }
    if (input.mode !== "PAPER" || this.entries.some((entry) => entry.id === input.id)) {
      throw new Error("Invalid or duplicate paper journal entry");
    }
    const entry: JournalEntry = { ...input, ruleViolations: [...input.ruleViolations] };
    this.entries.push(entry);
    return structuredClone(entry);
  }
  list(): JournalEntry[] { return structuredClone(this.entries); }
}

export class TradingReviewService {
  review(trades: readonly ClosedPaperTrade[], drawdown: number) {
    const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
    const ordered = [...trades].sort((a, b) => b.netPnl - a.netPnl);
    return {
      mode: "PAPER" as const, trades: trades.length, netPnl, drawdown,
      best: ordered[0] ?? null, worst: ordered[ordered.length - 1] ?? null,
      doingNothingWouldHaveBeenBetter: netPnl < 0,
      exitReasons: trades.reduce<Record<string, number>>((counts, trade) => {
        counts[trade.exitReason] = (counts[trade.exitReason] ?? 0) + 1; return counts;
      }, {}),
    };
  }
}