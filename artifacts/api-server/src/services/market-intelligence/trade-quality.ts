import type { ModelAgreementState } from "./research";

export interface TradeQualityInputs {
  strategyEvidence: number;
  historicalExpectancy: number;
  outOfSampleEvidence: number;
  regimeFit: number;
  liquidity: number;
  volatilitySuitability: number;
  riskReward: number;
  signalStrength: number;
  catalystQuality: number;
  portfolioDiversification: number;
  drawdownSafety: number;
  executionQuality: number;
  modelAgreement: ModelAgreementState;
}
export type NumericQualityKey = Exclude<keyof TradeQualityInputs, "modelAgreement">;
export type TradeQualityWeights = Record<NumericQualityKey, number>;
export type TradeQualityResult =
  | { status: "SCORED"; score: number; decision: "TRADE_ELIGIBLE" | "NO_TRADE"; missingInputs: [] }
  | { status: "INSUFFICIENT_DATA"; score: null; decision: "NO_TRADE"; missingInputs: readonly (keyof TradeQualityInputs)[] };

const WEIGHTS: TradeQualityWeights = {
  strategyEvidence: 15, historicalExpectancy: 10, outOfSampleEvidence: 12, regimeFit: 10,
  liquidity: 8, volatilitySuitability: 6, riskReward: 12, signalStrength: 10, catalystQuality: 3,
  portfolioDiversification: 5, drawdownSafety: 5, executionQuality: 4,
};
const AGREEMENT: Record<ModelAgreementState, number> = {
  STRONG_AGREEMENT: 1, PARTIAL_AGREEMENT: 0.9, MIXED: 0.7, STRONG_DISAGREEMENT: 0,
  INSUFFICIENT_INFORMATION: 0.6,
};

export class TradeQualityEngine {
  private readonly weights: TradeQualityWeights;
  constructor(weights: Partial<TradeQualityWeights> = {}, private readonly eligibleThreshold = 70) {
    this.weights = { ...WEIGHTS, ...weights };
    if (Object.values(this.weights).some((value) => !Number.isFinite(value) || value < 0) ||
        Object.values(this.weights).reduce((sum, value) => sum + value, 0) <= 0) throw new Error("Invalid quality weights");
  }

  evaluate(input: Partial<TradeQualityInputs> | null | undefined): TradeQualityResult {
    const numericKeys = Object.keys(this.weights) as NumericQualityKey[];
    const missing = [...numericKeys.filter((key) => !Number.isFinite(input?.[key])),
      ...(!input?.modelAgreement ? ["modelAgreement" as const] : [])];
    if (missing.length) return { status: "INSUFFICIENT_DATA", score: null, decision: "NO_TRADE", missingInputs: missing };
    if (numericKeys.some((key) => input![key]! < 0 || input![key]! > 100)) throw new Error("Quality inputs must be between 0 and 100");
    const total = numericKeys.reduce((sum, key) => sum + this.weights[key], 0);
    const raw = numericKeys.reduce((sum, key) => sum + input![key]! * this.weights[key], 0) / total;
    const score = Math.round(raw * AGREEMENT[input!.modelAgreement!] * 100) / 100;
    return {
      status: "SCORED", score,
      decision: score >= this.eligibleThreshold && input!.modelAgreement !== "STRONG_DISAGREEMENT" ? "TRADE_ELIGIBLE" : "NO_TRADE",
      missingInputs: [],
    };
  }
}