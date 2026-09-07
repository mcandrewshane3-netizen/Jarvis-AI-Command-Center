import {
  OpportunityScanner,
  type DataFreshness,
  type MarketDataProvider,
  type TradableAsset,
} from "./market-intelligence";
import { AUTONOMOUS_CRYPTO_CORE_UNIVERSE } from "./market-intelligence/universe";
import { requiresCurrentMarketData } from "./current-market-intent";

export type MarketConversationIntent =
  | { kind: "QUOTE"; symbol: string }
  | { kind: "CRYPTO_STRENGTH" }
  | { kind: "PAPER_OPPORTUNITY" }
  | { kind: "WHY_REJECTED"; symbol?: string }
  | { kind: "NONE" };

export type MarketConversationSource = "TYPED" | "VOICE";

export function classifyMarketConversation(
  content: string,
  _source: MarketConversationSource = "TYPED",
): MarketConversationIntent {
  const text = content.trim().toUpperCase();
  if (/\b(BEST|TOP)\b.*\bPAPER\b.*\b(OPPORTUNITY|TRADE)\b|\bPAPER\b.*\b(OPPORTUNITY|TRADE)\b/.test(text)) {
    return { kind: "PAPER_OPPORTUNITY" };
  }
  const rejected = /\bWHY\b.*\b(REJECT(?:ED|ION)?|NO[ -]?TRADE)\b|\b(REJECT(?:ED|ION)?)\b.*\bWHY\b/.test(text);
  if (rejected) {
    const explicit = text.match(/\b([A-Z]{2,12})\/USD\b/)?.[1];
    const named = text.match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA)\b/)?.[1];
    return {
      kind: "WHY_REJECTED",
      symbol: explicit ?? ({ BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL" }[named ?? ""] ?? named),
    };
  }
  const cryptoSubject = /\b(CRYPTO(?:CURRENCY)?|COINS?|BITCOIN|BTC|ETHEREUM|ETH|SOLANA|SOL)\b/.test(text);
  const comparativeMarketQuestion =
    /\b(STRENGTH|STRONGEST|WEAKEST|MOMENTUM|BEST|PROMISING|LEADING|LEADER|WATCH|SETUP|OPPORTUNITY|BREAKOUT|TREND|COMPARE)\b/.test(text);
  if (cryptoSubject && comparativeMarketQuestion && requiresCurrentMarketData(content)) {
    return { kind: "CRYPTO_STRENGTH" };
  }
  const pair = text.match(/\b([A-Z]{2,12})\s*(?:\/|-)\s*USD\b/)?.[1];
  const asksForQuote = /\b(PRICE|QUOTE|CURRENT|NOW|TRADING|TRADE AT)\b/.test(text);
  if (pair && asksForQuote) return { kind: "QUOTE", symbol: pair };
  if (asksForQuote && /\bBITCOIN\b|\bBTC\b/.test(text)) return { kind: "QUOTE", symbol: "BTC" };
  if (asksForQuote && /\bETHEREUM\b|\bETH\b/.test(text)) return { kind: "QUOTE", symbol: "ETH" };
  return { kind: "NONE" };
}

export type MarketConversationDecision = {
  symbol: string;
  strategyId: string;
  strategyVersion: string;
  reasonCode: string;
  decidedAt: Date;
};

export type MarketConversationDependencies = {
  provider: MarketDataProvider;
  paperCycle: (messageId: string) => Promise<Record<string, unknown>>;
  recentDecision: (symbol?: string) => Promise<MarketConversationDecision | undefined>;
};

type MarketFailure = "RATE LIMITED" | "STALE" | "UNSUPPORTED" | "UNAVAILABLE";

const failure = (error: unknown): MarketFailure => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/rate.?limit|backoff|429|quota/i.test(message)) return "RATE LIMITED";
  if (/stale/i.test(message)) return "STALE";
  if (/metadata unavailable|unsupported|not found|invalid symbol/i.test(message)) return "UNSUPPORTED";
  return "UNAVAILABLE";
};

const paperFailure = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const safeCode = message.match(
    /\b(PAPER_PORTFOLIO_NOT_CONFIGURED|PAPER_OPERATIONS_NOT_RUNNING|PAPER_CYCLE_ALREADY_RUNNING|PAPER_CYCLE_CONFLICT_RETRY|KILL_SWITCH_ACTIVE|MARKET_DATA_PROVIDER_NOT_CONFIGURED|AUTHENTICATION_UNAVAILABLE|INTERNAL_LOOPBACK_UNAVAILABLE)\b/,
  )?.[1];
  return safeCode ?? failure(error);
};

const displaySymbol = (asset: TradableAsset): string => {
  if (asset.symbol.includes("/")) return asset.symbol.toUpperCase();
  return asset.quoteCurrency
    ? `${asset.symbol}/${asset.quoteCurrency}`.toUpperCase()
    : asset.symbol.toUpperCase();
};

const isCurrentStrategyFreshness = (freshness: DataFreshness): boolean =>
  freshness === "LIVE_OR_CURRENT" || freshness === "DELAYED";

const safePaperEvidence = (result: Record<string, unknown>): string => {
  const summary = result.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "none reported";
  const inspected = (summary as Record<string, unknown>).inspected;
  if (!Array.isArray(inspected)) return "none reported";
  const evidence = inspected.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.symbol === "string" && typeof row.reason === "string"
      ? [`${row.symbol}:${row.reason}`]
      : [];
  });
  return evidence.slice(0, 8).join(", ") || "none reported";
};

export async function resolveMarketConversation(
  intent: MarketConversationIntent,
  messageId: string,
  deps: MarketConversationDependencies,
): Promise<string | null> {
  if (intent.kind === "NONE") return null;
  if (intent.kind === "WHY_REJECTED") {
    const decision = await deps.recentDecision(intent.symbol);
    return decision
      ? [
        "MODELED PAPER EXECUTION",
        `Latest persisted user-scoped NO_TRADE for ${decision.symbol}: ${decision.reasonCode} (${decision.strategyId}@${decision.strategyVersion}) at ${decision.decidedAt.toISOString()}.`,
        "CURRENT PROVIDER DATA",
        "Not requested; this answer uses persisted decision evidence only.",
        "AI RESEARCH",
        "Not invoked.",
      ].join("\n")
      : [
        "NO DATA / DEGRADED DATA",
        `No persisted user-scoped rejection evidence${intent.symbol ? ` for ${intent.symbol}/USD` : ""}. No rationale was inferred.`,
      ].join("\n");
  }
  if (intent.kind === "PAPER_OPPORTUNITY") {
    try {
      const result = await deps.paperCycle(messageId);
      if (result.outcome !== "PAPER_TRADE" && result.outcome !== "NO_TRADE") {
        return "NO DATA / DEGRADED DATA\nThe authoritative PAPER cycle did not return a valid outcome; no opportunity is asserted.";
      }
      return [
        "MODELED PAPER EXECUTION",
        `Authoritative PAPER cycle outcome: ${result.outcome}.`,
        `Candidates evaluated: ${String(result.candidatesEvaluated ?? 0)}; PAPER trades: ${String(result.tradesTaken ?? 0)}; NO_TRADE decisions: ${String(result.noTradeDecisions ?? 0)}.`,
        `Decision evidence: ${safePaperEvidence(result)}.`,
        "AI RESEARCH",
        "Controlled only by the existing AIResearchGate inside the authoritative cycle; no separate chat AI was invoked.",
        "EXECUTION",
        "PAPER ONLY. Live trading remains disabled.",
      ].join("\n");
    } catch (error) {
      return [
        "NO DATA / DEGRADED DATA",
        `Authoritative PAPER cycle unavailable (${paperFailure(error)}); no opportunity is asserted.`,
        "EXECUTION",
        "PAPER ONLY. Live trading remains disabled.",
      ].join("\n");
    }
  }
  let health;
  try {
    health = await deps.provider.getProviderHealth();
  } catch (error) {
    return `NO DATA / DEGRADED DATA\nMarket provider health is ${failure(error)}; no current market fact is asserted.`;
  }
  if (!health.configured || ["RATE_LIMITED", "UNAVAILABLE", "NOT_CONFIGURED"].includes(health.status)) {
    return `NO DATA / DEGRADED DATA\nMarket provider status: ${health.status}. No current market fact is asserted.`;
  }
  if (intent.kind === "QUOTE") {
    try {
      const asset = await deps.provider.getAssetMetadata(`${intent.symbol}/USD`, "CRYPTO");
      const quote = await deps.provider.getQuote(asset);
      const current = quote.freshness === "LIVE_OR_CURRENT";
      return [
        current ? "CURRENT PROVIDER DATA" : "HISTORICAL / STALE DATA",
        `${displaySymbol(asset)}: ${quote.price} ${asset.quoteCurrency ?? asset.currency}.`,
        `Provider: ${quote.provider}; market timestamp: ${quote.marketTimestamp}; retrieved: ${quote.retrievedAt}; freshness: ${quote.freshness}; provider status: ${health.status}.`,
        quote.bidAskStatus === "AVAILABLE"
          ? `Bid/ask: ${String(quote.bid)} / ${String(quote.ask)}.`
          : "Bid/ask: unavailable from provider.",
        "MODELED PAPER EXECUTION",
        "Not invoked.",
        "AI RESEARCH",
        "Not invoked.",
      ].join("\n");
    } catch (error) {
      return `NO DATA / DEGRADED DATA\nMarket quote is ${failure(error)}; no symbol or quote substitution was made.`;
    }
  }

  const boundedUniverse = AUTONOMOUS_CRYPTO_CORE_UNIVERSE.slice(0, 3);
  const successful: Array<{
    symbol: string;
    price: number;
    timestamp: string;
    freshness: DataFreshness;
    score: number;
    status: string;
    evidence: readonly string[];
    volumeStatus: "AVAILABLE" | "VOLUME_UNAVAILABLE";
  }> = [];
  const failed: string[] = [];
  for (const pair of boundedUniverse) {
    try {
      const asset = await deps.provider.getAssetMetadata(pair, "CRYPTO");
      const bars = await deps.provider.getBars(asset, "1h", 200);
      if (!bars.bars.length) throw new Error("MARKET_DATA_UNAVAILABLE");
      if (!isCurrentStrategyFreshness(bars.freshness)) {
        failed.push(`${pair}:${bars.freshness}`);
        continue;
      }
      const hasProviderVolume = bars.bars.some((bar) => Number.isFinite(bar.volume) && bar.volume > 0);
      const volume = hasProviderVolume
        ? bars.bars.reduce((total, bar) => total + bar.volume, 0) / bars.bars.length
        : 0;
      const dollars = hasProviderVolume
        ? bars.bars.reduce((total, bar) => total + bar.volume * bar.close, 0) / bars.bars.length
        : 0;
      const candidate = new OpportunityScanner().scan({
        ...asset,
        liquidityData: hasProviderVolume ? {
          averageDailyVolume: volume,
          averageDailyDollarVolume: dollars,
          measuredAt: bars.marketTimestamp,
        } : null,
      }, bars.bars);
      successful.push({
        symbol: pair,
        price: bars.bars.at(-1)!.close,
        timestamp: bars.marketTimestamp,
        freshness: bars.freshness,
        score: candidate.score,
        status: candidate.status,
        evidence: candidate.evidence,
        volumeStatus: hasProviderVolume ? "AVAILABLE" : "VOLUME_UNAVAILABLE",
      });
    } catch (error) {
      failed.push(`${pair}:${failure(error)}`);
    }
  }
  const ranked = [...successful].sort((left, right) =>
    right.score - left.score || left.symbol.localeCompare(right.symbol));
  const degraded = failed.length > 0 || successful.some((item) =>
    item.freshness !== "LIVE_OR_CURRENT" || item.volumeStatus === "VOLUME_UNAVAILABLE");
  const freshness = successful.length
    ? [...new Set(successful.map((item) => item.freshness))].join(", ")
    : "UNAVAILABLE";
  return [
    "CURRENT CRYPTO STRENGTH",
    successful.length === 0
      ? "NO DATA / DEGRADED DATA"
      : degraded
        ? "PARTIAL CURRENT PROVIDER DATA"
        : "CURRENT PROVIDER DATA",
    `Bounded crypto universe evaluated: ${boundedUniverse.join(", ")}.`,
    ...ranked.map((item, index) => [
      `${index + 1}. ${item.symbol}`,
      `   - Current provider-backed 1h close: ${item.price} USD`,
      `   - Objective signal: score=${item.score}; status=${item.status}`,
      `   - Momentum / strength evidence: ${item.evidence.join(", ") || "none"}`,
      `   - Volume / liquidity: ${item.volumeStatus === "AVAILABLE"
        ? "provider-backed metrics available"
        : "VOLUME_UNAVAILABLE; score is conservatively price-derived with zero liquidity contribution"}`,
      `   - Data freshness: ${item.freshness} at ${item.timestamp}`,
    ].join("\n")),
    "JARVIS ASSESSMENT:",
    ranked.length
      ? `${ranked[0].symbol} has the highest objective OpportunityScanner score among the assets successfully evaluated. This is a market ranking, not a trade instruction.`
      : "No current asset had sufficient provider-backed data to rank.",
    "DATA COVERAGE:",
    `${successful.length}/${boundedUniverse.length} assets successfully evaluated. Failed assets: ${failed.join(", ") || "none"}.`,
    `Data limitations: ${successful.filter((item) => item.volumeStatus === "VOLUME_UNAVAILABLE")
      .map((item) => `${item.symbol}:VOLUME_UNAVAILABLE`).join(", ") || "none"}.`,
    "DATA PROVIDER:",
    "Twelve Data",
    "FRESHNESS:",
    freshness,
    `Successful assets: ${successful.map((item) =>
      `${item.symbol}@${item.timestamp}:${item.freshness}`).join(", ") || "none"}.`,
    `Failed assets: ${failed.join(", ") || "none"}.`,
    `Objective OpportunityScanner ranking among successful assets: ${ranked.map((item) =>
      `${item.symbol} score=${item.score} status=${item.status} evidence=[${item.evidence.join(", ")}]`).join("; ") || "none"}.`,
    "HISTORICAL DATA",
    "Each successful score used up to 200 provider-backed 1-hour bars ending at the timestamp shown above.",
    "MODELED PAPER EXECUTION",
    "Not invoked; market strength is not a PAPER trade recommendation.",
    "AI RESEARCH",
    "Not invoked.",
  ].join("\n");
}
