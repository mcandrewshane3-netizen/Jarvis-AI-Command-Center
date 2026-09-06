export interface RegimeInput {
  priceReturn: number;
  trendStrength: number;
  realizedVolatility: number;
  relativeRiskAssetReturn: number;
}
export interface RegimeDimensions {
  trend: "TRENDING_UP" | "TRENDING_DOWN" | "RANGE_BOUND" | "UNKNOWN";
  volatility: "HIGH_VOLATILITY" | "LOW_VOLATILITY" | "NORMAL_VOLATILITY" | "UNKNOWN";
  risk: "RISK_ON" | "RISK_OFF" | "UNKNOWN";
}
export type RegimeResult =
  | { status: "CLASSIFIED"; dimensions: RegimeDimensions; missingInputs: [] }
  | { status: "DATA_REQUIRED"; dimensions: { trend: "UNKNOWN"; volatility: "UNKNOWN"; risk: "UNKNOWN" }; missingInputs: Array<keyof RegimeInput> };

export class MarketRegimeEngine {
  classify(input: Partial<RegimeInput> | null | undefined): RegimeResult {
    const fields: Array<keyof RegimeInput> = ["priceReturn", "trendStrength", "realizedVolatility", "relativeRiskAssetReturn"];
    const missingInputs = fields.filter((field) => !Number.isFinite(input?.[field]));
    if (missingInputs.length) return {
      status: "DATA_REQUIRED", dimensions: { trend: "UNKNOWN", volatility: "UNKNOWN", risk: "UNKNOWN" }, missingInputs,
    };
    const value = input as RegimeInput;
    if (value.trendStrength < 0 || value.realizedVolatility < 0) throw new Error("Regime inputs are out of range");
    return {
      status: "CLASSIFIED", missingInputs: [],
      dimensions: {
        trend: value.trendStrength < 0.2 ? "RANGE_BOUND" : value.priceReturn > 0 ? "TRENDING_UP" : value.priceReturn < 0 ? "TRENDING_DOWN" : "RANGE_BOUND",
        volatility: value.realizedVolatility >= 0.4 ? "HIGH_VOLATILITY" : value.realizedVolatility <= 0.12 ? "LOW_VOLATILITY" : "NORMAL_VOLATILITY",
        risk: value.relativeRiskAssetReturn > 0.02 ? "RISK_ON" : value.relativeRiskAssetReturn < -0.02 ? "RISK_OFF" : "UNKNOWN",
      },
    };
  }
}