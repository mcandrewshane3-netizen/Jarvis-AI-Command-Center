import type { AssetClass, DataFreshness } from "./types";

export interface FreshnessPolicy {
  currentMs: number;
  delayedMs: number;
  staleMs: number;
}

const DEFAULTS: Record<AssetClass, FreshnessPolicy> = {
  STOCK: { currentMs: 2 * 60_000, delayedMs: 20 * 60_000, staleMs: 24 * 60 * 60_000 },
  ETF: { currentMs: 2 * 60_000, delayedMs: 20 * 60_000, staleMs: 24 * 60 * 60_000 },
  CRYPTO: { currentMs: 2 * 60_000, delayedMs: 10 * 60_000, staleMs: 60 * 60_000 },
};

const INTERVAL_MS: Readonly<Record<string, number>> = {
  "1min": 60_000,
  "5min": 5 * 60_000,
  "15min": 15 * 60_000,
  "1h": 60 * 60_000,
  "1day": 24 * 60 * 60_000,
};

export class MarketDataQualityService {
  constructor(private readonly policies: Record<AssetClass, FreshnessPolicy> = DEFAULTS) {}

  classify(
    marketTimestamp: string | null | undefined,
    assetClass: AssetClass,
    now = new Date(),
    historical = false,
    interval?: string,
  ): DataFreshness {
    if (!marketTimestamp) return "UNAVAILABLE";
    const timestamp = Date.parse(marketTimestamp);
    if (!Number.isFinite(timestamp)) return "UNAVAILABLE";
    if (historical) return "HISTORICAL";
    // Twelve Data timestamps OHLCV bars at the beginning of their interval.
    // Measure bar freshness from the interval's close, while quotes remain
    // measured from their exact provider timestamp.
    const intervalDuration = interval ? INTERVAL_MS[interval] : undefined;
    const freshnessTimestamp = timestamp + (intervalDuration ?? 0);
    const age = Math.max(0, now.getTime() - freshnessTimestamp);
    const policy = this.policies[assetClass];
    if (age <= policy.currentMs) return "LIVE_OR_CURRENT";
    if (age <= policy.delayedMs) return "DELAYED";
    return age <= policy.staleMs ? "HISTORICAL" : "STALE";
  }

  isUsableForCurrentStrategy(freshness: DataFreshness): boolean {
    return freshness === "LIVE_OR_CURRENT" || freshness === "DELAYED";
  }
}