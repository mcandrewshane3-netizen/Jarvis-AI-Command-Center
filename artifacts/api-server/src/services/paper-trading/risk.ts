import type { PaperAssetClass } from "./contracts.js";
import type { PaperPortfolioSnapshot } from "./portfolio.js";

export type SurvivalState = "STRONG" | "HEALTHY" | "CAUTION" | "DEFENSIVE" | "CAPITAL_PRESERVATION" | "SURVIVAL";

export interface SurvivalInput {
  equity: number;
  highWaterMark: number;
  currentDrawdown: number;
  maxDrawdown: number;
  recentExpectancy: number;
  profitFactor: number;
  losingStreak: number;
  grossExposurePercent: number;
}

export class CapitalSurvivalEngine {
  evaluate(input: SurvivalInput): { score: number; state: SurvivalState; riskMultiplier: number } {
    if (Object.values(input).some((value) => !Number.isFinite(value)) || input.equity < 0 ||
        input.highWaterMark <= 0 || input.currentDrawdown < 0 || input.maxDrawdown < 0 ||
        input.losingStreak < 0 || input.grossExposurePercent < 0) {
      throw new Error("Valid capital survival facts are required");
    }
    const penalty = input.currentDrawdown * 180 + input.maxDrawdown * 40 +
      Math.max(0, -input.recentExpectancy / Math.max(1, input.equity)) * 500 +
      Math.max(0, 1 - input.profitFactor) * 15 + Math.min(25, input.losingStreak * 4) +
      Math.max(0, input.grossExposurePercent - 0.7) * 40;
    const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)) * 100) / 100;
    const state: SurvivalState = score >= 90 ? "STRONG" : score >= 75 ? "HEALTHY" :
      score >= 60 ? "CAUTION" : score >= 40 ? "DEFENSIVE" :
      score >= 20 ? "CAPITAL_PRESERVATION" : "SURVIVAL";
    const multiplier: Record<SurvivalState, number> = {
      STRONG: 1, HEALTHY: 1, CAUTION: 0.75, DEFENSIVE: 0.5,
      CAPITAL_PRESERVATION: 0.25, SURVIVAL: 0,
    };
    return { score, state, riskMultiplier: multiplier[state] };
  }
}

export interface CapitalGovernorLimits {
  allocations: Record<PaperAssetClass, number>;
  minimumCashReservePercent: number;
  maxGrossExposurePercent: number;
  maxPositionPercent: number;
  maxStrategyPercent: number;
  maxCorrelatedExposurePercent: number;
  maxDrawdownPercent: number;
  maxLosingStreak: number;
  protectedProfitPercent: number;
}

export interface GovernorRequest {
  assetClass: PaperAssetClass;
  symbol: string;
  strategyId: string;
  proposedNotional: number;
  symbolExposure: number;
  correlatedExposure: number;
  losingStreak: number;
  requestReason?: string;
}

export interface GovernorDecision {
  approved: boolean;
  mode: "PAPER";
  riskMultiplier: number;
  checks: Array<{ rule: string; passed: boolean; actual: number; limit: number }>;
  reason: string;
}

const REVENGE = /\b(revenge|make it back|win it back|recover (?:our )?(?:loss|cost)|double (?:the )?(?:next|position|down)|chase loss)/i;

export class CapitalGovernor {
  constructor(private readonly limits: CapitalGovernorLimits) {
    if (Object.values(limits.allocations).some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
        Object.values(limits).filter((value): value is number => typeof value === "number")
          .some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Invalid capital governor limits");
    }
  }

  evaluate(portfolio: PaperPortfolioSnapshot, request: GovernorRequest): GovernorDecision {
    if (!Number.isFinite(request.proposedNotional) || request.proposedNotional <= 0 ||
        request.losingStreak < 0 || request.symbolExposure < 0 || request.correlatedExposure < 0) {
      throw new Error("Invalid capital request");
    }
    if (REVENGE.test(request.requestReason ?? "")) {
      return { approved: false, mode: "PAPER", riskMultiplier: 0,
        checks: [], reason: "REVENGE_TRADING_REJECTED" };
    }
    const equity = portfolio.equity;
    const classExposure = request.assetClass === "STOCK" ? portfolio.stockExposure :
      request.assetClass === "ETF" ? portfolio.etfExposure : portfolio.cryptoExposure;
    const protectedProfit = Math.max(0, portfolio.realizedPnL) * this.limits.protectedProfitPercent;
    const availableCash = portfolio.cash - portfolio.startingCapital * this.limits.minimumCashReservePercent -
      protectedProfit;
    const pairs: Array<[string, number, number]> = [
      ["CASH_RESERVE_AND_PROTECTED_PROFIT", request.proposedNotional, Math.max(0, availableCash)],
      ["GROSS_EXPOSURE", portfolio.grossExposure + request.proposedNotional, equity * this.limits.maxGrossExposurePercent],
      ["ASSET_CLASS_ALLOCATION", classExposure + request.proposedNotional, equity * this.limits.allocations[request.assetClass]],
      ["POSITION_CONCENTRATION", request.symbolExposure + request.proposedNotional, equity * this.limits.maxPositionPercent],
      ["STRATEGY_CONCENTRATION", (portfolio.strategyExposure[request.strategyId] ?? 0) + request.proposedNotional,
        equity * this.limits.maxStrategyPercent],
      ["CORRELATION", request.correlatedExposure + request.proposedNotional, equity * this.limits.maxCorrelatedExposurePercent],
      ["DRAWDOWN", portfolio.currentDrawdown, this.limits.maxDrawdownPercent],
      ["LOSING_STREAK", request.losingStreak, this.limits.maxLosingStreak],
    ];
    const checks = pairs.map(([rule, actual, limit]) => ({ rule, actual, limit,
      passed: rule === "DRAWDOWN" || rule === "LOSING_STREAK" ? actual < limit : actual <= limit }));
    const stressMultiplier = portfolio.currentDrawdown >= this.limits.maxDrawdownPercent * 0.75 ? 0.25 :
      request.losingStreak >= this.limits.maxLosingStreak * 0.75 ? 0.5 : 1;
    return { approved: checks.every((check) => check.passed), mode: "PAPER",
      riskMultiplier: stressMultiplier, checks,
      reason: checks.every((check) => check.passed) ? "APPROVED" :
        checks.filter((check) => !check.passed).map((check) => check.rule).join(",") };
  }
}