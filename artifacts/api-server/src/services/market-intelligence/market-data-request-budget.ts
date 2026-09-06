import type { MarketDataRequestPriority } from "./market-data-cache";
import type { MarketDataCallOptions } from "./types";

export type MarketDataProviderState =
  | "HEALTHY"
  | "RATE_LIMIT_WARNING"
  | "RATE_LIMITED"
  | "DEGRADED"
  | "UNAVAILABLE";

export interface MarketDataRequestOptions extends MarketDataCallOptions {
  priority?: MarketDataRequestPriority;
}

export interface MarketDataRequestBudgetOptions {
  now?: () => number;
  maximumRequestsPerMinute?: number;
  maximumRequestsPerDay?: number;
  highPriorityReserve?: number;
  warningRatio?: number;
  baseBackoffMs?: number;
  maximumBackoffMs?: number;
  unavailableAfterFailures?: number;
}

export interface MarketDataRequestBudgetStats {
  state: MarketDataProviderState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsLastMinute: number;
  requestsToday: number;
  remainingThisMinute: number;
  remainingToday: number;
  consecutiveRateLimits: number;
  backoffUntil: string | null;
  requestTimestamps: readonly string[];
}

export class MarketDataRateLimitError extends Error {
  readonly status = 429;

  constructor(message = "Twelve Data rate limit reached") {
    super(message);
    this.name = "MarketDataRateLimitError";
  }
}

export class MarketDataBackoffError extends Error {
  constructor(readonly retryAt: string) {
    super(`Twelve Data request backoff is active until ${retryAt}`);
    this.name = "MarketDataBackoffError";
  }
}

export class MarketDataRequestBudgetService {
  private readonly now: () => number;
  private readonly maximumRequestsPerMinute: number;
  private readonly maximumRequestsPerDay: number;
  private readonly highPriorityReserve: number;
  private readonly warningRatio: number;
  private readonly baseBackoffMs: number;
  private readonly maximumBackoffMs: number;
  private readonly unavailableAfterFailures: number;
  private requestTimestamps: number[] = [];
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private consecutiveFailures = 0;
  private consecutiveRateLimits = 0;
  private backoffUntil = 0;

  constructor(options: MarketDataRequestBudgetOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maximumRequestsPerMinute = options.maximumRequestsPerMinute ?? 8;
    this.maximumRequestsPerDay = options.maximumRequestsPerDay ?? 800;
    this.highPriorityReserve = options.highPriorityReserve
      ?? Math.min(1, this.maximumRequestsPerMinute - 1);
    this.warningRatio = options.warningRatio ?? 0.75;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maximumBackoffMs = options.maximumBackoffMs ?? 60_000;
    this.unavailableAfterFailures = options.unavailableAfterFailures ?? 3;
    if (
      this.maximumRequestsPerMinute < 1 || this.maximumRequestsPerDay < 1
      || this.highPriorityReserve < 0 || this.highPriorityReserve >= this.maximumRequestsPerMinute
      || this.warningRatio <= 0 || this.warningRatio > 1
      || this.baseBackoffMs < 1 || this.maximumBackoffMs < this.baseBackoffMs
    ) throw new Error("Invalid market data request budget configuration");
  }

  async execute<T>(
    _operation: string,
    options: MarketDataRequestOptions,
    request: () => Promise<T>,
  ): Promise<T> {
    const now = this.now();
    this.prune(now);
    if (this.backoffUntil > now) {
      throw new MarketDataBackoffError(new Date(this.backoffUntil).toISOString());
    }

    const priority = options.openPosition ? "HIGH" : (options.priority ?? "NORMAL");
    const minuteRequests = this.requestsInLastMinute(now);
    const todayRequests = this.requestsToday(now);
    const minuteLimit = priority === "HIGH"
      ? this.maximumRequestsPerMinute
      : this.maximumRequestsPerMinute - this.highPriorityReserve;
    if (minuteRequests >= minuteLimit || todayRequests >= this.maximumRequestsPerDay) {
      const retryAt = minuteRequests >= minuteLimit
        ? (this.requestTimestamps.find((timestamp) => timestamp > now - 60_000) ?? now) + 60_000
        : this.startOfNextUtcDay(now);
      throw new MarketDataBackoffError(new Date(retryAt).toISOString());
    }

    this.requestTimestamps.push(now);
    this.totalRequests += 1;
    try {
      const result = await request();
      this.successfulRequests += 1;
      this.consecutiveFailures = 0;
      this.consecutiveRateLimits = 0;
      this.backoffUntil = 0;
      return result;
    } catch (error) {
      this.failedRequests += 1;
      this.consecutiveFailures += 1;
      if (error instanceof MarketDataRateLimitError) {
        this.consecutiveRateLimits += 1;
        const delay = Math.min(
          this.maximumBackoffMs,
          this.baseBackoffMs * (2 ** (this.consecutiveRateLimits - 1)),
        );
        this.backoffUntil = Math.max(this.backoffUntil, this.now() + delay);
      }
      throw error;
    }
  }

  getState(): MarketDataProviderState {
    const now = this.now();
    this.prune(now);
    if (this.backoffUntil > now) return "RATE_LIMITED";
    if (this.consecutiveFailures >= this.unavailableAfterFailures) return "UNAVAILABLE";
    if (this.consecutiveFailures > 0) return "DEGRADED";
    const ratio = Math.max(
      this.requestsInLastMinute(now) / this.maximumRequestsPerMinute,
      this.requestsToday(now) / this.maximumRequestsPerDay,
    );
    return ratio >= this.warningRatio ? "RATE_LIMIT_WARNING" : "HEALTHY";
  }

  getStats(): MarketDataRequestBudgetStats {
    const now = this.now();
    this.prune(now);
    const minute = this.requestsInLastMinute(now);
    const today = this.requestsToday(now);
    return {
      state: this.getState(),
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      requestsLastMinute: minute,
      requestsToday: today,
      remainingThisMinute: Math.max(0, this.maximumRequestsPerMinute - minute),
      remainingToday: Math.max(0, this.maximumRequestsPerDay - today),
      consecutiveRateLimits: this.consecutiveRateLimits,
      backoffUntil: this.backoffUntil > now ? new Date(this.backoffUntil).toISOString() : null,
      requestTimestamps: this.requestTimestamps.map((timestamp) => new Date(timestamp).toISOString()),
    };
  }

  private prune(now: number): void {
    const dayStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
    );
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => timestamp >= dayStart);
  }

  private requestsInLastMinute(now: number): number {
    return this.requestTimestamps.filter((timestamp) => timestamp > now - 60_000).length;
  }

  private requestsToday(now: number): number {
    const date = new Date(now);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return this.requestTimestamps.filter((timestamp) => timestamp >= dayStart).length;
  }

  private startOfNextUtcDay(now: number): number {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  }
}