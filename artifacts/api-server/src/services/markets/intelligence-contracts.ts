export interface CapitalGovernor {
  evaluateCapitalSurvival(input: unknown): Promise<unknown>;
}

export interface StrategyEngine {
  generateHypothesis(input: unknown): Promise<unknown>;
}

export interface TradeQualityScore {
  evaluate(input: unknown): Promise<unknown>;
}

export interface CapitalSurvivalScore {
  evaluate(input: unknown): Promise<unknown>;
}

export interface StrategyPerformanceTracker {
  recordOutcome(input: unknown): Promise<void>;
}

export interface MarketRegimeEngine {
  classify(input: unknown): Promise<unknown>;
}

export interface OpportunityEngine {
  compareAuthorizedOpportunities(input: unknown): Promise<unknown>;
}