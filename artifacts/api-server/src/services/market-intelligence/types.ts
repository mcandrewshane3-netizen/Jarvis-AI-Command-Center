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
  status: "HEALTHY" | "NOT_CONFIGURED" | "UNAVAILABLE";
  requiredSecret?: string;
  message?: string;
}

export interface MarketDataProvider {
  getQuote(asset: TradableAsset): Promise<MarketQuote>;
  getBars(asset: TradableAsset, interval: string, outputSize?: number): Promise<MarketBars>;
  getHistoricalBars(asset: TradableAsset, interval: string, start: string, end: string): Promise<MarketBars>;
  getAssetMetadata(symbol: string, assetClass: AssetClass): Promise<TradableAsset>;
  getMarketStatus(exchange?: string): Promise<MarketStatus>;
  getSupportedAssets(assetClass?: AssetClass): Promise<readonly TradableAsset[]>;
  getProviderHealth(): Promise<ProviderHealth>;
}