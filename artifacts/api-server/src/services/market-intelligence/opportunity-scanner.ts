import type { MarketBar, TradableAsset } from "./types";

export interface ObjectiveFeatures {
  trend: number;
  momentum: number;
  rateOfChange: number;
  movingAverageStructure: number;
  relativeStrength: number | null;
  relativeVolume: number;
  volatility: number;
  atrPercent: number;
  rangeExpansion: number;
  breakoutProximity: number;
  meanReversionDistance: number;
  liquidity: number;
  abnormalMovement: number;
}

export interface MarketCandidate {
  asset: TradableAsset;
  score: number;
  features: ObjectiveFeatures;
  evidence: readonly string[];
  status: "CANDIDATE" | "NO_TRADE";
  reason?: string;
}

export interface ScannerConfig {
  lookback: number;
  minimumBars: number;
  minimumScore: number;
}

const DEFAULTS: ScannerConfig = { lookback: 20, minimumBars: 21, minimumScore: 55 };

export class OpportunityScanner {
  constructor(private readonly config: ScannerConfig = DEFAULTS) {
    if (config.lookback < 2 || config.minimumBars < config.lookback + 1 ||
        config.minimumScore < 0 || config.minimumScore > 100) throw new Error("Invalid scanner configuration");
  }

  scan(asset: TradableAsset, bars: readonly MarketBar[], benchmark?: readonly MarketBar[]): MarketCandidate {
    validateChronology(bars);
    if (bars.length < this.config.minimumBars) return this.noTrade(asset, "INSUFFICIENT_HISTORY");
    const window = bars.slice(-this.config.lookback - 1);
    const closes = window.map((bar) => bar.close);
    const returns = closes.slice(1).map((close, index) => close / closes[index] - 1);
    const last = window[window.length - 1];
    const previous = window[window.length - 2];
    const averageClose = average(closes.slice(0, -1));
    const averageVolume = average(window.slice(0, -1).map((bar) => bar.volume));
    const priorHigh = Math.max(...window.slice(0, -1).map((bar) => bar.high));
    const atr = average(window.slice(1).map((bar, index) => Math.max(
      bar.high - bar.low, Math.abs(bar.high - window[index].close), Math.abs(bar.low - window[index].close),
    )));
    const volatility = standardDeviation(returns);
    const roc = last.close / window[0].close - 1;
    const benchmarkRoc = benchmark && benchmark.length >= this.config.lookback + 1
      ? benchmark[benchmark.length - 1].close / benchmark[benchmark.length - this.config.lookback - 1].close - 1 : null;
    const liquidity = asset.liquidityData
      ? clamp(Math.log10(Math.max(1, asset.liquidityData.averageDailyDollarVolume ?? 1)) / 9) : 0;
    const features: ObjectiveFeatures = {
      trend: clamp((last.close / averageClose - 1) * 10 + 0.5),
      momentum: clamp(roc * 5 + 0.5),
      rateOfChange: roc,
      movingAverageStructure: last.close > averageClose ? 1 : 0,
      relativeStrength: benchmarkRoc === null ? null : roc - benchmarkRoc,
      relativeVolume: averageVolume > 0 ? last.volume / averageVolume : 0,
      volatility,
      atrPercent: atr / last.close,
      rangeExpansion: (last.high - last.low) / Math.max(previous.high - previous.low, Number.EPSILON),
      breakoutProximity: clamp(last.close / priorHigh),
      meanReversionDistance: (last.close - averageClose) / Math.max(atr, Number.EPSILON),
      liquidity,
      abnormalMovement: Math.abs(returns[returns.length - 1]) / Math.max(volatility, Number.EPSILON),
    };
    const score = round(100 * clamp(
      features.trend * 0.2 + features.momentum * 0.2 + clamp(features.relativeVolume / 2) * 0.15 +
      features.breakoutProximity * 0.15 + features.liquidity * 0.2 +
      clamp((features.relativeStrength ?? 0) * 5 + 0.5) * 0.1,
    ));
    const evidence = [
      `ROC=${round(features.rateOfChange)}`, `RELATIVE_VOLUME=${round(features.relativeVolume)}`,
      `ATR_PERCENT=${round(features.atrPercent)}`, `BREAKOUT_PROXIMITY=${round(features.breakoutProximity)}`,
    ];
    return score >= this.config.minimumScore
      ? { asset, score, features, evidence, status: "CANDIDATE" }
      : { asset, score, features, evidence, status: "NO_TRADE", reason: "OBJECTIVE_SCORE_BELOW_THRESHOLD" };
  }

  private noTrade(asset: TradableAsset, reason: string): MarketCandidate {
    return {
      asset, score: 0, status: "NO_TRADE", reason, evidence: [],
      features: {
        trend: 0, momentum: 0, rateOfChange: 0, movingAverageStructure: 0, relativeStrength: null,
        relativeVolume: 0, volatility: 0, atrPercent: 0, rangeExpansion: 0, breakoutProximity: 0,
        meanReversionDistance: 0, liquidity: 0, abnormalMovement: 0,
      },
    };
  }
}

function validateChronology(bars: readonly MarketBar[]): void {
  let previous = -Infinity;
  for (const bar of bars) {
    const time = Date.parse(bar.timestamp);
    if (!Number.isFinite(time) || time <= previous || [bar.open, bar.high, bar.low, bar.close, bar.volume]
      .some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Bars must be valid and strictly chronological");
    previous = time;
  }
}
const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const standardDeviation = (values: readonly number[]): number => {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
};
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;