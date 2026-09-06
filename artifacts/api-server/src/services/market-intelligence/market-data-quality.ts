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

export class MarketDataQualityService {
  constructor(private readonly policies: Record<AssetClass, FreshnessPolicy> = DEFAULTS) {}

  classify(
    marketTimestamp: string | null | undefined,
    assetClass: AssetClass,
    now = new Date(),
    historical = false,
  ): DataFreshness {
    if (!marketTimestamp) return "UNAVAILABLE";
    const timestamp = Date.parse(marketTimestamp);
    if (!Number.isFinite(timestamp)) return "UNAVAILABLE";
    if (historical) return "HISTORICAL";
    const age = Math.max(0, now.getTime() - timestamp);
    const policy = this.policies[assetClass];
    if (age <= policy.currentMs) return "LIVE_OR_CURRENT";
    if (age <= policy.delayedMs) return "DELAYED";
    return age <= policy.staleMs ? "HISTORICAL" : "STALE";
  }

  isUsableForCurrentStrategy(freshness: DataFreshness): boolean {
    return freshness === "LIVE_OR_CURRENT" || freshness === "DELAYED";
  }
}