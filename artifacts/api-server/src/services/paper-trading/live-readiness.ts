export type LiveReadiness =
  | "NOT_READY" | "MORE_DATA_REQUIRED" | "REVIEW_REQUIRED" | "ELIGIBLE_FOR_LIMITED_LIVE_REVIEW";

export interface ReadinessEvidence {
  sampleSize: number;
  netExpectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  outOfSampleTrades: number;
  paperTrades: number;
  regimeCount: number;
  slippageSensitivity: number;
  strategyConcentration: number;
  dataQuality: number;
  ruleViolations: number;
  systemReliability: number;
}

export interface ReadinessResult {
  status: LiveReadiness;
  liveTradingEnabled: false;
  canExecuteLive: false;
  reasons: string[];
}

export class LiveReadinessEvaluator {
  evaluate(input: ReadinessEvidence): ReadinessResult {
    if (Object.values(input).some((value) => !Number.isFinite(value))) {
      return this.result("NOT_READY", ["INCOMPLETE_EVIDENCE"]);
    }
    if (input.ruleViolations > 0 || input.netExpectancy <= 0 || input.profitFactor < 1 ||
        input.maxDrawdown > 0.2 || input.dataQuality < 0.8 || input.systemReliability < 0.95) {
      return this.result("NOT_READY", ["SAFETY_OR_PERFORMANCE_THRESHOLD_FAILED"]);
    }
    if (input.sampleSize < 100 || input.paperTrades < 60 || input.outOfSampleTrades < 30 ||
        input.regimeCount < 3) {
      return this.result("MORE_DATA_REQUIRED", ["SAMPLE_OR_REGIME_DIVERSITY_INSUFFICIENT"]);
    }
    if (input.slippageSensitivity > 0.25 || input.strategyConcentration > 0.6 ||
        input.maxDrawdown > 0.12) {
      return this.result("REVIEW_REQUIRED", ["RISK_REVIEW_REQUIRED"]);
    }
    return this.result("ELIGIBLE_FOR_LIMITED_LIVE_REVIEW", ["HUMAN_REVIEW_REQUIRED"]);
  }

  enableLiveTrading(): never {
    throw new Error("LIVE_TRADING_CANNOT_BE_ENABLED_BY_READINESS_EVALUATOR");
  }

  private result(status: LiveReadiness, reasons: string[]): ReadinessResult {
    return { status, liveTradingEnabled: false, canExecuteLive: false, reasons };
  }
}