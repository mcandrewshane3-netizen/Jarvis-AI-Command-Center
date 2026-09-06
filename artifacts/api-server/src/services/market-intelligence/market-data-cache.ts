export type MarketDataRequestPriority = "HIGH" | "NORMAL" | "LOW";

export interface MarketDataCacheLoadOptions {
  ttlMs: number;
  priority?: MarketDataRequestPriority;
}

export interface MarketDataCacheStats {
  entries: number;
  inFlight: number;
  hits: number;
  misses: number;
  deduplicated: number;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class MarketDataCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;
  private deduplicated = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maximumEntries = 1_000,
  ) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new Error("Market data cache maximum entries must be positive");
    }
  }

  async getOrLoad<T>(
    key: string,
    options: MarketDataCacheLoadOptions,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (!key || !Number.isFinite(options.ttlMs) || options.ttlMs < 0) {
      throw new Error("A valid market data cache key and TTL are required");
    }
    const currentTime = this.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > currentTime) {
      this.hits += 1;
      return cached.value as T;
    }
    if (cached) this.entries.delete(key);

    const existing = this.inFlight.get(key);
    if (existing) {
      this.deduplicated += 1;
      return existing as Promise<T>;
    }

    this.misses += 1;
    const request = loader().then((value) => {
      if (options.ttlMs > 0) {
        this.evictIfFull();
        this.entries.set(key, { value, expiresAt: this.now() + options.ttlMs });
      }
      return value;
    }).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }

  clear(): void {
    this.entries.clear();
  }

  getStats(): MarketDataCacheStats {
    return {
      entries: this.entries.size,
      inFlight: this.inFlight.size,
      hits: this.hits,
      misses: this.misses,
      deduplicated: this.deduplicated,
    };
  }

  private evictIfFull(): void {
    if (this.entries.size < this.maximumEntries) return;
    const oldestKey = this.entries.keys().next().value as string | undefined;
    if (oldestKey !== undefined) this.entries.delete(oldestKey);
  }
}