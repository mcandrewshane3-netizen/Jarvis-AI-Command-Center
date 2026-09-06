import type { MarketDataRequestPriority } from "./market-data-cache";

export type AssetClass = "STOCK" | "ETF" | "CRYPTO";
export type TradingHoursType = "EXCHANGE_SESSION" | "TWENTY_FOUR_SEVEN" | "UNKNOWN";
export type FractionalSupport = "SUPPORTED" | "NOT_SUPPORTED" | "UNKNOWN";
export type DataFreshness = "LIVE_OR_CURRENT" | "DELAYED" | "HISTORICAL" | "STALE" | "UNAVAILABLE";
export type BidAskStatus = "AVAILABLE" | "BID_ASK_UNAVAILABLE";

export interface LiquidityData {
  averageDailyVolume?: number;
  averageDailyDollarVolume?: number;
  spreadBps?: number;
  measuredAt?: string;
}

export interface TradableAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string | null;
  currency: string;
  quoteCurrency: string | null;
  tradingHoursType: TradingHoursType;
  fractionalSupport: FractionalSupport;
  liquidityData: LiquidityData | null;
  providerMetadata: Readonly<Record<string, unknown>>;
}

export interface MarketDataEnvelope {
  provider: string;
  retrievedAt: string;
  marketTimestamp: string;
  freshness: DataFreshness;
  asset: TradableAsset;
  interval?: string;
}

export interface MarketQuote extends MarketDataEnvelope {
  price: number;
  bid: number | null;
  ask: number | null;
  bidAskStatus: BidAskStatus;
  volume: number | null;
}

export interface MarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketBars extends MarketDataEnvelope {
  interval: string;
  bars: readonly MarketBar[];
}

export interface MarketStatus {
  provider: string;
  retrievedAt: string;
  exchange: string | null;
  isOpen: boolean | null;
  status: string;
}

export interface ProviderHealth {
  provider: string;
  configured: boolean;
  status: "HEALTHY" | "RATE_LIMIT_WARNING" | "RATE_LIMITED" | "DEGRADED" | "NOT_CONFIGURED" | "UNAVAILABLE";
  requiredSecret?: string;
  message?: string;
  requestBudget?: Readonly<Record<string, unknown>>;
}

export interface MarketDataCallOptions {
  priority?: MarketDataRequestPriority;
  openPosition?: boolean;
}

export interface MarketDataProvider {
  getQuote(asset: TradableAsset, options?: MarketDataCallOptions): Promise<MarketQuote>;
  getBars(
    asset: TradableAsset,
    interval: string,
    outputSize?: number,
    options?: MarketDataCallOptions,
  ): Promise<MarketBars>;
  getHistoricalBars(
    asset: TradableAsset,
    interval: string,
    start: string,
    end: string,
    options?: MarketDataCallOptions,
  ): Promise<MarketBars>;
  getAssetMetadata(
    symbol: string,
    assetClass: AssetClass,
    options?: MarketDataCallOptions,
  ): Promise<TradableAsset>;
  getMarketStatus(exchange?: string): Promise<MarketStatus>;
  getSupportedAssets(assetClass?: AssetClass): Promise<readonly TradableAsset[]>;
  getProviderHealth(): Promise<ProviderHealth>;
}