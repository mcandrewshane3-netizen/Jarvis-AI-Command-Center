import type { PaperAssetClass, PaperOrderRequest } from "./contracts.js";
import { PaperBroker } from "./paper-broker.js";
import { PaperPortfolio } from "./portfolio.js";
import type { CapitalGovernor, GovernorRequest } from "./risk.js";

export interface MarketCandidate {
  symbol: string;
  assetClass: PaperAssetClass;
  referencePrice: number;
  strategyId: string;
  strategyVersion: string;
  score: number;
  dataTimestamp: string;
  stopPrice?: number;
  targetPrice?: number;
}

export interface CandidateProvider {
  refresh(): Promise<void> | void;
  scan(): Promise<MarketCandidate[]> | MarketCandidate[];
}
export interface StrategyFilterProvider {
  evaluate(candidate: MarketCandidate): Promise<{ accepted: boolean; reason?: string }> |
    { accepted: boolean; reason?: string };
}
export interface ResearchProvider {
  shouldResearch(candidate: MarketCandidate): boolean;
  analyze(candidate: MarketCandidate): Promise<{ accepted: boolean; summary: string }> |
    { accepted: boolean; summary: string };
}
export interface RiskProvider {
  evaluate(candidate: MarketCandidate): Promise<{ approved: boolean; quantity: number; reason?: string }> |
    { approved: boolean; quantity: number; reason?: string };
}

export interface AutonomousCycleResult {
  mode: "PAPER";
  outcome: "TRADED" | "NO_TRADE";
  candidatesEvaluated: number;
  candidatesRejected: number;
  tradesTaken: number;
  noTradeDecisions: number;
  rejectionReasons: Record<string, number>;
  orderIds: string[];
}

/** A caller-driven cycle: deliberately contains no scheduler, network client, or live path. */
export class AutonomousPaperTradingService {
  readonly mode = "PAPER" as const;
  constructor(
    private readonly candidates: CandidateProvider,
    private readonly strategy: StrategyFilterProvider,
    private readonly research: ResearchProvider,
    private readonly risk: RiskProvider,
    private readonly governor: CapitalGovernor,
    private readonly broker: PaperBroker,
    private readonly portfolio: PaperPortfolio,
  ) {}

  async runCycle(): Promise<AutonomousCycleResult> {
    await this.candidates.refresh();
    const candidates = await this.candidates.scan();
    const reasons: Record<string, number> = {};
    const orderIds: string[] = [];
    let rejected = 0;
    const reject = (reason: string) => { rejected++; reasons[reason] = (reasons[reason] ?? 0) + 1; };
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate.referencePrice) || candidate.referencePrice <= 0 ||
          !Number.isFinite(Date.parse(candidate.dataTimestamp))) {
        reject("INVALID_OR_STALE_DATA"); continue;
      }
      const strategy = await this.strategy.evaluate(candidate);
      if (!strategy.accepted) { reject(strategy.reason ?? "STRATEGY_REJECTED"); continue; }
      if (this.research.shouldResearch(candidate)) {
        const analysis = await this.research.analyze(candidate);
        if (!analysis.accepted) { reject("RESEARCH_REJECTED"); continue; }
      }
      const risk = await this.risk.evaluate(candidate);
      if (!risk.approved || !Number.isFinite(risk.quantity) || risk.quantity <= 0) {
        reject(risk.reason ?? "RISK_REJECTED"); continue;
      }
      const snapshot = this.portfolio.snapshot();
      const notional = risk.quantity * candidate.referencePrice;
      const governorRequest: GovernorRequest = {
        assetClass: candidate.assetClass, symbol: candidate.symbol,
        strategyId: candidate.strategyId, proposedNotional: notional,
        symbolExposure: snapshot.positions.filter((item) => item.symbol === candidate.symbol)
          .reduce((sum, item) => sum + item.quantity * item.currentPrice, 0),
        correlatedExposure: 0, losingStreak: this.currentLosingStreak(),
      };
      const capital = this.governor.evaluate(snapshot, governorRequest);
      if (!capital.approved) { reject(`CAPITAL_GOVERNOR:${capital.reason}`); continue; }
      const request: PaperOrderRequest = {
        symbol: candidate.symbol, assetClass: candidate.assetClass,
        strategyId: candidate.strategyId, strategyVersion: candidate.strategyVersion,
        side: "BUY", quantity: risk.quantity * capital.riskMultiplier, orderType: "MARKET",
        submittedAt: candidate.dataTimestamp,
        ...(candidate.stopPrice !== undefined ? { stopPrice: candidate.stopPrice } : {}),
        ...(candidate.targetPrice !== undefined ? { targetPrice: candidate.targetPrice } : {}),
      };
      if (request.quantity <= 0) { reject("CAPITAL_SURVIVAL"); continue; }
      const submitted = this.broker.submit(request);
      const filled = this.broker.fill(submitted.id, candidate.referencePrice, request.quantity,
        candidate.dataTimestamp);
      try {
        this.portfolio.applyBuy(filled);
        orderIds.push(filled.id);
      } catch (error) {
        reject(error instanceof Error ? error.message : "PORTFOLIO_REJECTED");
      }
    }
    return {
      mode: "PAPER", outcome: orderIds.length ? "TRADED" : "NO_TRADE",
      candidatesEvaluated: candidates.length, candidatesRejected: rejected,
      tradesTaken: orderIds.length, noTradeDecisions: orderIds.length ? 0 : 1,
      rejectionReasons: reasons, orderIds,
    };
  }

  /** Exists as an explicit safety boundary and can never submit live. */
  submitLive(): never {
    throw new Error("LIVE_TRADING_DISABLED: autonomous service is PAPER only");
  }

  private currentLosingStreak(): number {
    let streak = 0;
    const trades = this.portfolio.closedTrades();
    for (let index = trades.length - 1; index >= 0 && trades[index].netPnl < 0; index--) streak++;
    return streak;
  }
}