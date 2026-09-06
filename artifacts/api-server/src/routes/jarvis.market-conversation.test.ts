import { describe, expect, it, vi } from "vitest";
import {
  classifyMarketConversation,
  resolveMarketConversation,
  type MarketConversationDependencies,
} from "../services/market-conversation";
import type {
  DataFreshness,
  MarketBar,
  MarketBars,
  MarketDataProvider,
  MarketQuote,
  ProviderHealth,
  TradableAsset,
} from "../services/market-intelligence";

const timestamp = "2026-09-06T12:00:00.000Z";

function assetFor(pair: string): TradableAsset {
  const symbol = pair.replace("/USD", "");
  return {
    symbol,
    name: `${symbol}/USD`,
    assetClass: "CRYPTO",
    exchange: null,
    currency: symbol,
    quoteCurrency: "USD",
    tradingHoursType: "TWENTY_FOUR_SEVEN",
    fractionalSupport: "UNKNOWN",
    liquidityData: null,
    providerMetadata: {},
  };
}

function barsFor(asset: TradableAsset, strength = 1, freshness: DataFreshness = "LIVE_OR_CURRENT"): MarketBars {
  const bars: MarketBar[] = Array.from({ length: 200 }, (_, index) => {
    const close = 100 + index * strength * 0.1;
    return {
      timestamp: new Date(Date.parse(timestamp) - (199 - index) * 60 * 60_000).toISOString(),
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 10_000 + index * 10,
    };
  });
  return {
    provider: "TWELVE_DATA",
    retrievedAt: timestamp,
    marketTimestamp: bars.at(-1)!.timestamp,
    freshness,
    asset,
    interval: "1h",
    bars,
  };
}

function quoteFor(asset: TradableAsset, freshness: DataFreshness = "LIVE_OR_CURRENT"): MarketQuote {
  return {
    provider: "TWELVE_DATA",
    retrievedAt: "2026-09-06T12:00:01.000Z",
    marketTimestamp: timestamp,
    freshness,
    asset,
    price: asset.symbol === "ETH" ? 4_000 : 60_000,
    bid: null,
    ask: null,
    bidAskStatus: "BID_ASK_UNAVAILABLE",
    volume: 1_000,
  };
}

function fakeProvider(options: {
  health?: Partial<ProviderHealth>;
  quoteFreshness?: DataFreshness;
  barsFreshness?: Partial<Record<string, DataFreshness>>;
  metadataFailure?: string;
  barsFailure?: string;
  quoteFailure?: Error;
} = {}) {
  const calls: string[] = [];
  const provider: MarketDataProvider = {
    async getProviderHealth() {
      calls.push("health");
      return {
        provider: "TWELVE_DATA",
        configured: true,
        status: "HEALTHY",
        ...options.health,
      };
    },
    async getAssetMetadata(symbol) {
      calls.push(`metadata:${symbol}`);
      if (options.metadataFailure === symbol) throw new Error(`Asset metadata unavailable for ${symbol}`);
      return assetFor(symbol);
    },
    async getQuote(asset) {
      calls.push(`quote:${display(asset)}`);
      if (options.quoteFailure) throw options.quoteFailure;
      return quoteFor(asset, options.quoteFreshness);
    },
    async getBars(asset) {
      const pair = display(asset);
      calls.push(`bars:${pair}`);
      if (options.barsFailure === pair) throw new Error("Twelve Data rate limit reached");
      const strength = pair.startsWith("SOL") ? 3 : pair.startsWith("ETH") ? 2 : 1;
      return barsFor(asset, strength, options.barsFreshness?.[pair]);
    },
    async getHistoricalBars() { throw new Error("not used"); },
    async getMarketStatus() { throw new Error("not used"); },
    async getSupportedAssets() { return []; },
  };
  return { provider, calls };
}

const display = (asset: TradableAsset) =>
  asset.symbol.includes("/") ? asset.symbol : `${asset.symbol}/${asset.quoteCurrency}`;

function dependencies(provider: MarketDataProvider, overrides: Partial<MarketConversationDependencies> = {}) {
  return {
    provider,
    paperCycle: vi.fn(async () => ({ outcome: "NO_TRADE" })),
    recentDecision: vi.fn(async () => undefined),
    ...overrides,
  } satisfies MarketConversationDependencies;
}

describe("JARVIS deterministic market conversation routing", () => {
  it("routes typed and voice market questions through the same classifier", () => {
    const prompts = [
      "What is BTC/USD trading at right now?",
      "What is ETH/USD trading at right now?",
      "What crypto looks strongest right now?",
      "What crypto looks best right now?",
      "What looks like the best paper-trade opportunity right now?",
      "Why did you reject BTC?",
    ];
    for (const prompt of prompts) {
      expect(classifyMarketConversation(prompt, "VOICE"))
        .toEqual(classifyMarketConversation(prompt, "TYPED"));
    }
    expect(classifyMarketConversation(prompts[0])).toEqual({ kind: "QUOTE", symbol: "BTC" });
    expect(classifyMarketConversation(prompts[1])).toEqual({ kind: "QUOTE", symbol: "ETH" });
    expect(classifyMarketConversation(prompts[2])).toEqual({ kind: "CRYPTO_STRENGTH" });
    expect(classifyMarketConversation(prompts[3])).toEqual({ kind: "CRYPTO_STRENGTH" });
    expect(classifyMarketConversation(prompts[4])).toEqual({ kind: "PAPER_OPPORTUNITY" });
    expect(classifyMarketConversation(prompts[5])).toEqual({ kind: "WHY_REJECTED", symbol: "BTC" });
  });

  it.each(["BTC", "ETH"])("uses only canonical metadata and quote services for a %s quote", async (symbol) => {
    const { provider, calls } = fakeProvider();
    const deps = dependencies(provider);
    const answer = await resolveMarketConversation({ kind: "QUOTE", symbol }, "message-quote", deps);

    expect(answer).toContain("CURRENT PROVIDER DATA");
    expect(answer).toContain(`${symbol}/USD`);
    expect(answer).toContain("AI RESEARCH\nNot invoked.");
    expect(answer).toContain("MODELED PAPER EXECUTION\nNot invoked.");
    expect(calls).toEqual(["health", `metadata:${symbol}/USD`, `quote:${symbol}/USD`]);
    expect(deps.paperCycle).not.toHaveBeenCalled();
    expect(deps.recentDecision).not.toHaveBeenCalled();
  });

  it("labels a stale provider quote as stale rather than current", async () => {
    const { provider } = fakeProvider({ quoteFreshness: "STALE" });
    const answer = await resolveMarketConversation(
      { kind: "QUOTE", symbol: "BTC" },
      "message-stale",
      dependencies(provider),
    );
    expect(answer).toContain("HISTORICAL / STALE DATA");
    expect(answer).toContain("freshness: STALE");
    expect(answer).not.toMatch(/^CURRENT PROVIDER DATA/m);
  });

  it("fails closed for rate limits and unsupported symbols without substitution", async () => {
    const rateLimited = fakeProvider({ health: { status: "RATE_LIMITED" } });
    const rateAnswer = await resolveMarketConversation(
      { kind: "QUOTE", symbol: "BTC" },
      "message-rate",
      dependencies(rateLimited.provider),
    );
    expect(rateAnswer).toContain("RATE_LIMITED");
    expect(rateLimited.calls).toEqual(["health"]);

    const unsupported = fakeProvider({ metadataFailure: "DOGE/USD" });
    const unsupportedAnswer = await resolveMarketConversation(
      classifyMarketConversation("What is DOGE/USD trading at right now?"),
      "message-unsupported",
      dependencies(unsupported.provider),
    );
    expect(unsupportedAnswer).toContain("UNSUPPORTED");
    expect(unsupportedAnswer).toContain("no symbol or quote substitution");
    expect(unsupported.calls).toEqual(["health", "metadata:DOGE/USD"]);
  });

  it("uses the bounded BTC/ETH/SOL universe and existing OpportunityScanner without AI", async () => {
    const { provider, calls } = fakeProvider();
    const deps = dependencies(provider);
    const answer = await resolveMarketConversation(
      { kind: "CRYPTO_STRENGTH" },
      "message-strength",
      deps,
    );

    expect(answer).toContain("CURRENT PROVIDER DATA");
    expect(answer).toContain("Bounded crypto universe evaluated: BTC/USD, ETH/USD, SOL/USD");
    expect(answer).toContain("SOL/USD score=");
    expect(answer).toContain("evidence=[ROC=");
    expect(answer).toContain("AI RESEARCH\nNot invoked.");
    expect(calls).toEqual([
      "health",
      "metadata:BTC/USD", "bars:BTC/USD",
      "metadata:ETH/USD", "bars:ETH/USD",
      "metadata:SOL/USD", "bars:SOL/USD",
    ]);
    expect(deps.paperCycle).not.toHaveBeenCalled();
  });

  it("truthfully limits a partial strength ranking to successful assets", async () => {
    const { provider } = fakeProvider({ barsFailure: "SOL/USD" });
    const answer = await resolveMarketConversation(
      { kind: "CRYPTO_STRENGTH" },
      "message-partial",
      dependencies(provider),
    );
    expect(answer).toContain("NO DATA / DEGRADED DATA (PARTIAL CURRENT PROVIDER DATA)");
    expect(answer).toContain("Successful assets: BTC/USD@");
    expect(answer).toContain("ETH/USD@");
    expect(answer).toContain("Failed assets: SOL/USD:RATE LIMITED");
    expect(answer).not.toContain("SOL/USD score=");
  });

  it.each(["PAPER_TRADE", "NO_TRADE"])(
    "invokes the authoritative PAPER cycle once and accepts %s",
    async (outcome) => {
      const { provider, calls } = fakeProvider();
      const paperCycle = vi.fn(async () => ({
        outcome,
        candidatesEvaluated: 2,
        tradesTaken: outcome === "PAPER_TRADE" ? 1 : 0,
        noTradeDecisions: outcome === "NO_TRADE" ? 1 : 0,
        summary: { inspected: [{ symbol: "BTC/USD", reason: "AI_RESEARCH_PROVIDER_UNAVAILABLE" }] },
      }));
      const answer = await resolveMarketConversation(
        { kind: "PAPER_OPPORTUNITY" },
        "stable-message-id",
        dependencies(provider, { paperCycle }),
      );

      expect(paperCycle).toHaveBeenCalledOnce();
      expect(paperCycle).toHaveBeenCalledWith("stable-message-id");
      expect(answer).toContain(`Authoritative PAPER cycle outcome: ${outcome}`);
      expect(answer).toContain("PAPER ONLY. Live trading remains disabled.");
      expect(answer).toContain("no separate chat AI was invoked");
      expect(answer).toContain("AI_RESEARCH_PROVIDER_UNAVAILABLE");
      expect(calls).toEqual([]);
    },
  );

  it("requests only symbol-specific persisted user-scoped rejection evidence", async () => {
    const { provider } = fakeProvider();
    const recentDecision = vi.fn(async (symbol?: string) =>
      symbol === "BTC" ? {
        symbol: "BTC/USD",
        strategyId: "momentum",
        strategyVersion: "1.0.0",
        reasonCode: "OBJECTIVE_SCORE_BELOW_THRESHOLD",
        decidedAt: new Date(timestamp),
      } : undefined);
    const answer = await resolveMarketConversation(
      classifyMarketConversation("Why did you reject BTC?"),
      "message-rejection",
      dependencies(provider, { recentDecision }),
    );

    expect(recentDecision).toHaveBeenCalledWith("BTC");
    expect(answer).toContain("BTC/USD");
    expect(answer).toContain("OBJECTIVE_SCORE_BELOW_THRESHOLD");
    expect(answer).toContain("persisted user-scoped");
  });
});