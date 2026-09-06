import { MarketDataQualityService } from "./market-data-quality";
import type {
  AssetClass, MarketBar, MarketBars, MarketDataProvider, MarketQuote, MarketStatus,
  ProviderHealth, TradableAsset,
} from "./types";

export const TWELVE_DATA_SECRET_NAME = "TWELVE_DATA_API_KEY";
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface TwelveDataOptions {
  apiKey?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  now?: () => Date;
  quality?: MarketDataQualityService;
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "TWELVE_DATA";
  private readonly apiKey?: string;
  private readonly fetcher: FetchLike;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private readonly quality: MarketDataQualityService;

  constructor(options: TwelveDataOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? "https://api.twelvedata.com";
    this.now = options.now ?? (() => new Date());
    this.quality = options.quality ?? new MarketDataQualityService();
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    if (!this.apiKey) return {
      provider: this.name, configured: false, status: "NOT_CONFIGURED",
      requiredSecret: TWELVE_DATA_SECRET_NAME,
      message: `Configure Replit Secret ${TWELVE_DATA_SECRET_NAME}`,
    };
    return { provider: this.name, configured: true, status: "HEALTHY" };
  }

  async getQuote(asset: TradableAsset): Promise<MarketQuote> {
    const raw = await this.request("/quote", { symbol: this.providerSymbol(asset) });
    const price = number(raw.close ?? raw.price, "quote price");
    const marketTimestamp = timestamp(raw.timestamp ?? raw.datetime);
    const retrievedAt = this.now().toISOString();
    return {
      provider: this.name, retrievedAt, marketTimestamp,
      freshness: this.quality.classify(marketTimestamp, asset.assetClass, this.now()),
      asset, price, bid: optionalNumber(raw.bid), ask: optionalNumber(raw.ask),
      volume: optionalNumber(raw.volume),
    };
  }

  async getBars(asset: TradableAsset, interval: string, outputSize = 30): Promise<MarketBars> {
    if (!Number.isInteger(outputSize) || outputSize < 1 || outputSize > 5000) throw new Error("Invalid output size");
    return this.timeSeries(asset, interval, { outputsize: String(outputSize) }, false);
  }

  async getHistoricalBars(
    asset: TradableAsset, interval: string, start: string, end: string,
  ): Promise<MarketBars> {
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
      throw new Error("A valid chronological historical range is required");
    }
    return this.timeSeries(asset, interval, { start_date: start, end_date: end, outputsize: "5000" }, true);
  }

  async getAssetMetadata(symbol: string, assetClass: AssetClass): Promise<TradableAsset> {
    const raw = await this.request("/symbol_search", { symbol });
    const match = array(raw.data).find((item) => this.classify(item.instrument_type) === assetClass);
    if (!match) throw new Error(`Asset metadata unavailable for ${symbol}`);
    return this.asset(match, assetClass);
  }

  async getMarketStatus(exchange?: string): Promise<MarketStatus> {
    const raw = await this.request("/market_state", exchange ? { exchange } : {});
    const row = array(raw.data)[0] ?? raw;
    const state = String(row.market_state ?? row.status ?? "UNKNOWN").toUpperCase();
    return {
      provider: this.name, retrievedAt: this.now().toISOString(), exchange: exchange ?? null,
      isOpen: state === "OPEN" ? true : state === "CLOSED" ? false : null, status: state,
    };
  }

  async getSupportedAssets(assetClass?: AssetClass): Promise<readonly TradableAsset[]> {
    const classes: AssetClass[] = assetClass ? [assetClass] : ["STOCK", "ETF", "CRYPTO"];
    const paths: Record<AssetClass, string> = { STOCK: "/stocks", ETF: "/etf", CRYPTO: "/cryptocurrencies" };
    const result: TradableAsset[] = [];
    for (const type of classes) {
      const raw = await this.request(paths[type], {});
      for (const row of array(raw.data)) result.push(this.asset(row, type));
    }
    return result;
  }

  private async timeSeries(
    asset: TradableAsset, interval: string, extra: Record<string, string>, historical: boolean,
  ): Promise<MarketBars> {
    if (!interval.trim()) throw new Error("Interval is required");
    const raw = await this.request("/time_series", {
      symbol: this.providerSymbol(asset), interval, order: "ASC", ...extra,
    });
    const bars = array(raw.values).map(parseBar).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (!bars.length) throw new Error("Twelve Data returned no bars");
    const marketTimestamp = bars[bars.length - 1].timestamp;
    return {
      provider: this.name, retrievedAt: this.now().toISOString(), marketTimestamp,
      freshness: this.quality.classify(marketTimestamp, asset.assetClass, this.now(), historical),
      asset, interval, bars,
    };
  }

  private providerSymbol(asset: TradableAsset): string {
    return asset.assetClass === "CRYPTO" && asset.quoteCurrency
      ? `${asset.symbol}/${asset.quoteCurrency}` : asset.symbol;
  }

  private asset(row: Record<string, unknown>, forced?: AssetClass): TradableAsset {
    const assetClass = forced ?? this.classify(row.instrument_type);
    const symbol = text(row.symbol, "symbol");
    const quoteCurrency = assetClass === "CRYPTO"
      ? String(row.currency_quote ?? row.quote_currency ?? "USD") : null;
    return {
      symbol, name: String(row.instrument_name ?? row.name ?? symbol), assetClass,
      exchange: typeof row.exchange === "string" ? row.exchange : null,
      currency: String(row.currency ?? (assetClass === "CRYPTO" ? symbol : "USD")),
      quoteCurrency,
      tradingHoursType: assetClass === "CRYPTO" ? "TWENTY_FOUR_SEVEN" : "EXCHANGE_SESSION",
      fractionalSupport: "UNKNOWN", liquidityData: null, providerMetadata: { ...row },
    };
  }

  private classify(value: unknown): AssetClass {
    const type = String(value ?? "").toUpperCase();
    if (type.includes("ETF")) return "ETF";
    if (type.includes("CRYPTO")) return "CRYPTO";
    return "STOCK";
  }

  private async request(path: string, parameters: Record<string, string>): Promise<Record<string, unknown>> {
    if (!this.apiKey) throw new Error(`Market data provider not configured: ${TWELVE_DATA_SECRET_NAME} is required`);
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries({ ...parameters, apikey: this.apiKey })) url.searchParams.set(key, value);
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`Twelve Data request failed (${response.status})`);
    const body = await response.json() as Record<string, unknown>;
    if (body.status === "error" || body.code) throw new Error(`Twelve Data error: ${String(body.message ?? body.code)}`);
    return body;
  }
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Twelve Data ${label} unavailable`);
  return value.trim();
}
function number(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Twelve Data ${label} unavailable`);
  return parsed;
}
function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed) ? null : parsed;
}
function timestamp(value: unknown): string {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric).toISOString();
  }
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error("Twelve Data market timestamp unavailable");
  return new Date(parsed).toISOString();
}
function parseBar(row: Record<string, unknown>): MarketBar {
  const bar = {
    timestamp: timestamp(row.datetime ?? row.timestamp), open: number(row.open, "open"),
    high: number(row.high, "high"), low: number(row.low, "low"), close: number(row.close, "close"),
    volume: optionalNumber(row.volume) ?? 0,
  };
  if (bar.open <= 0 || bar.high < bar.low || bar.low <= 0 || bar.close <= 0) throw new Error("Invalid OHLC bar");
  return bar;
}