import { describe, expect, it, vi } from "vitest";
import { MarketDataCacheService } from "./market-data-cache";
import {
  MarketDataBackoffError,
  MarketDataRateLimitError,
  MarketDataRequestBudgetService,
} from "./market-data-request-budget";
import { TwelveDataProvider } from "./twelve-data-provider";
import type { TradableAsset } from "./types";

const asset: TradableAsset = {
  symbol: "SPY",
  name: "SPDR S&P 500 ETF Trust",
  assetClass: "ETF",
  exchange: "NYSE",
  currency: "USD",
  quoteCurrency: null,
  tradingHoursType: "EXCHANGE_SESSION",
  fractionalSupport: "UNKNOWN",
  liquidityData: null,
  providerMetadata: {},
};

describe("MarketDataCacheService", () => {
  it("reuses only unexpired entries and reloads at the TTL boundary", async () => {
    let now = 1_000;
    const cache = new MarketDataCacheService(() => now);
    const loader = vi.fn(async () => ({ sequence: loader.mock.calls.length }));

    expect(await cache.getOrLoad("quote:SPY", { ttlMs: 100 }, loader)).toEqual({ sequence: 1 });
    now = 1_099;
    expect(await cache.getOrLoad("quote:SPY", { ttlMs: 100 }, loader)).toEqual({ sequence: 1 });
    now = 1_100;
    expect(await cache.getOrLoad("quote:SPY", { ttlMs: 100 }, loader)).toEqual({ sequence: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.getStats()).toMatchObject({ hits: 1, misses: 2 });
  });

  it("deduplicates concurrent loads and never caches a failed load", async () => {
    let resolve!: (value: number) => void;
    const pending = new Promise<number>((complete) => { resolve = complete; });
    const loader = vi.fn(() => pending);
    const cache = new MarketDataCacheService();
    const first = cache.getOrLoad("bars:SPY", { ttlMs: 100 }, loader);
    const second = cache.getOrLoad("bars:SPY", { ttlMs: 100 }, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    resolve(42);
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    expect(cache.getStats().deduplicated).toBe(1);

    const failureCache = new MarketDataCacheService();
    const failure = vi.fn()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(7);
    await expect(failureCache.getOrLoad("quote", { ttlMs: 100 }, failure)).rejects.toThrow("provider failed");
    await expect(failureCache.getOrLoad("quote", { ttlMs: 100 }, failure)).resolves.toBe(7);
    expect(failure).toHaveBeenCalledTimes(2);
  });
});

describe("MarketDataRequestBudgetService", () => {
  it("backs off exponentially after 429 and makes no request during backoff", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const budget = new MarketDataRequestBudgetService({
      now: () => now,
      baseBackoffMs: 1_000,
      maximumBackoffMs: 8_000,
    });
    const request = vi.fn(async () => {
      throw new MarketDataRateLimitError();
    });

    await expect(budget.execute("quote", {}, request)).rejects.toBeInstanceOf(MarketDataRateLimitError);
    expect(budget.getStats()).toMatchObject({
      state: "RATE_LIMITED",
      consecutiveRateLimits: 1,
      backoffUntil: "2026-01-01T00:00:01.000Z",
    });
    await expect(budget.execute("quote", {}, request)).rejects.toBeInstanceOf(MarketDataBackoffError);
    expect(request).toHaveBeenCalledTimes(1);

    now += 1_000;
    await expect(budget.execute("quote", {}, request)).rejects.toBeInstanceOf(MarketDataRateLimitError);
    expect(budget.getStats().backoffUntil).toBe("2026-01-01T00:00:03.000Z");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reserves capacity for open-position/high-priority requests", async () => {
    const budget = new MarketDataRequestBudgetService({
      now: () => Date.parse("2026-01-01T00:00:00Z"),
      maximumRequestsPerMinute: 2,
      maximumRequestsPerDay: 10,
      highPriorityReserve: 1,
    });
    const request = vi.fn(async () => "ok");

    await expect(budget.execute("scan", { priority: "LOW" }, request)).resolves.toBe("ok");
    await expect(budget.execute("scan", { priority: "NORMAL" }, request))
      .rejects.toBeInstanceOf(MarketDataBackoffError);
    await expect(budget.execute("position", { openPosition: true }, request)).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("TwelveDataProvider rate-limit-aware boundary", () => {
  it("deduplicates and caches metadata without spending additional budget", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { complete = resolve; });
    const fetcher = vi.fn(() => pending);
    const budget = new MarketDataRequestBudgetService({
      now: () => Date.parse("2026-01-01T00:00:00Z"),
    });
    const provider = new TwelveDataProvider({
      apiKey: "key",
      fetch: fetcher,
      requestBudget: budget,
    });

    const first = provider.getAssetMetadata("spy", "ETF");
    const second = provider.getAssetMetadata("SPY", "ETF", { openPosition: true });
    complete({
      ok: true,
      status: 200,
      json: async () => ({ data: [{
        symbol: "SPY",
        instrument_name: "SPDR S&P 500 ETF Trust",
        instrument_type: "ETF",
        exchange: "NYSE",
        currency: "USD",
      }] }),
    } as Response);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(provider.getAssetMetadata("SPY", "ETF")).resolves.toMatchObject({ symbol: "SPY" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(budget.getStats()).toMatchObject({
      totalRequests: 1,
      successfulRequests: 1,
      requestsLastMinute: 1,
    });
  });

  it("deduplicates concurrent quotes and reuses the normalized cached result", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { complete = resolve; });
    const fetcher = vi.fn(() => pending);
    const provider = new TwelveDataProvider({
      apiKey: "key",
      fetch: fetcher,
      now: () => new Date("2026-01-01T00:00:01Z"),
    });
    const first = provider.getQuote(asset);
    const second = provider.getQuote(asset, { openPosition: true });
    complete({
      ok: true,
      status: 200,
      json: async () => ({ close: "500", timestamp: 1767225600 }),
    } as Response);

    const [one, two] = await Promise.all([first, second]);
    expect(one).toEqual(two);
    expect(await provider.getQuote(asset)).toEqual(one);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not call Twelve Data repeatedly while provider backoff is active", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ status: "error", code: 429, message: "rate limit" }),
    } as Response));
    const budget = new MarketDataRequestBudgetService({ now: () => now, baseBackoffMs: 1_000 });
    const provider = new TwelveDataProvider({
      apiKey: "key",
      fetch: fetcher,
      now: () => new Date(now),
      requestBudget: budget,
    });

    await expect(provider.getQuote(asset)).rejects.toBeInstanceOf(MarketDataRateLimitError);
    await expect(provider.getQuote(asset)).rejects.toBeInstanceOf(MarketDataBackoffError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await provider.getProviderHealth()).toMatchObject({ status: "RATE_LIMITED" });

    now += 1_000;
    await expect(provider.getQuote(asset)).rejects.toBeInstanceOf(MarketDataRateLimitError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});