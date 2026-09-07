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
  if (/\b(BEST|TOP)\b.*\bPAPER\b.*\b(OPPORTUNITY|TRADE)\b|\bPAPER\b.*\b(OPPORTUNITY|TRADE)\b/.test(text)) return { kind: "PAPER_OPPORTUNITY" };
  const rejected = /\bWHY\b.*\b(REJECT(?:ED|ION)?|NO[ -]?TRADE)\b|\b(REJECT(?:ED|ION)?)\b.*\bWHY\b/.test(text);
  if (rejected) {
    const explicit = text.match(/\b([A-Z]{2,12})\/USD\b/)?.[1];
    const named = text.match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOLANA|SOL)\b/)?.[1];
    return { kind: "WHY_REJECTED", symbol: explicit ?? ({ BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL" }[named ?? ""] ?? named) };
  }
  const cryptoSubject = /\b(CRYPTO(?:CURRENCY)?|COINS?|BITCOIN|BTC|ETHEREUM|ETH|SOLANA|SOL)\b/.test(text);
  const comparativeMarketQuestion = /\b(STRENGTH|STRONGEST|WEAKEST|MOMENTUM|BEST|PROMISING|LEADING|LEADER|WATCH|SETUP|OPPORTUNITY|BREAKOUT|TREND|COMPARE)\b/.test(text);
  if (cryptoSubject && comparativeMarketQuestion && requiresCurrentMarketData(content)) return { kind: "CRYPTO_STRENGTH" };
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
  const safeCode = message.match(/\b(PAPER_PORTFOLIO_NOT_CONFIGURED|PAPER_OPERATIONS_NOT_RUNNING|PAPER_CYCLE_ALREADY_RUNNING|PAPER_CYCLE_CONFLICT_RETRY|KILL_SWITCH_ACTIVE|MARKET_DATA_PROVIDER_NOT_CONFIGURED|AUTHENTICATION_UNAVAILABLE|INTERNAL_LOOPBACK_UNAVAILABLE)\b/)?.[1];
  return safeCode ?? failure(error);
};

const displaySymbol = (asset: TradableAsset): string => {
  if (asset.symbol.includes("/")) return asset.symbol.toUpperCase();
  return asset.quoteCurrency ? `${asset.symbol}/${asset.quoteCurrency}`.toUpperCase() : asset.symbol.toUpperCase();
};

const isCurrentStrategyFreshness = (freshness: DataFreshness): boolean => freshness === "LIVE_OR_CURRENT" || freshness === "DELAYED";

const safePaperEvidence = (result: Record<string, unknown>): string => {
  const summary = result.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "none reported";
  const inspected = (summary as Record<string, unknown>).inspected;
  if (!Array.isArray(inspected)) return "none reported";
  const evidence = inspected.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.symbol === "string" && typeof row.reason === "string" ? [`${row.symbol}:${row.reason}`] : [];
  });
  return evidence.slice(0, 5).join(", ") || "none reported";
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
      ? `The latest PAPER no-trade for ${decision.symbol} was ${decision.reasonCode} under ${decision.strategyId}@${decision.strategyVersion}. That decision was recorded at ${decision.decidedAt.toISOString()}. I did not infer any additional rationale.`
      : `I don't have persisted rejection evidence${intent.symbol ? ` for ${intent.symbol}/USD` : ""}, so I won't invent a reason.`;
  }
  if (intent.kind === "PAPER_OPPORTUNITY") {
    try {
      const result = await deps.paperCycle(messageId);
      if (result.outcome !== "PAPER_TRADE" && result.outcome !== "NO_TRADE") {
        return "I couldn't verify a valid PAPER outcome, so I'm not asserting an opportunity.";
      }
      const evidence = safePaperEvidence(result);
      return `PAPER cycle result: ${result.outcome}. I evaluated ${String(result.candidatesEvaluated ?? 0)} candidates, with ${String(result.tradesTaken ?? 0)} paper trades and ${String(result.noTradeDecisions ?? 0)} no-trade decisions.${evidence !== "none reported" ? ` Key evidence: ${evidence}.` : ""} Live trading remains disabled.`;
    } catch (error) {
      return `The PAPER cycle is unavailable right now (${paperFailure(error)}), so I'm not asserting an opportunity. Live trading remains disabled.`;
    }
  }

  let health;
  try {
    health = await deps.provider.getProviderHealth();
  } catch (error) {
    return `I can't verify current market data right now; provider health is ${failure(error).toLowerCase()}.`;
  }
  if (!health.configured || ["RATE_LIMITED", "UNAVAILABLE", "NOT_CONFIGURED"].includes(health.status)) {
    return `I can't verify a current market fact right now. The market provider status is ${health.status}.`;
  }
  if (intent.kind === "QUOTE") {
    try {
      const asset = await deps.provider.getAssetMetadata(`${intent.symbol}/USD`, "CRYPTO");
      const quote = await deps.provider.getQuote(asset);
      const freshnessNote = quote.freshness === "LIVE_OR_CURRENT" ? "current" : quote.freshness.toLowerCase().replaceAll("_", " ");
      const bidAsk = quote.bidAskStatus === "AVAILABLE" ? ` Bid/ask is ${String(quote.bid)} / ${String(quote.ask)}.` : "";
      return `${displaySymbol(asset)} is ${quote.price} ${asset.quoteCurrency ?? asset.currency}. Data is ${freshnessNote} from ${quote.provider}, timestamp ${quote.marketTimestamp}.${bidAsk}`;
    } catch (error) {
      return `I can't verify that market quote right now; the provider returned ${failure(error).toLowerCase()}.`;
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
      const volume = hasProviderVolume ? bars.bars.reduce((total, bar) => total + bar.volume, 0) / bars.bars.length : 0;
      const dollars = hasProviderVolume ? bars.bars.reduce((total, bar) => total + bar.volume * bar.close, 0) / bars.bars.length : 0;
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

  const ranked = [...successful].sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol));
  if (!ranked.length) {
    return `I couldn't get enough current provider-backed data to rank ${boundedUniverse.join(", ")}. I won't guess.`;
  }

  const leader = ranked[0];
  const ranking = ranked.map((item, index) => `${index + 1}) ${item.symbol} ${item.score.toFixed(1)} (${item.status})`).join("; ");
  const incompleteVolume = ranked.some((item) => item.volumeStatus === "VOLUME_UNAVAILABLE");
  const degraded = failed.length > 0 || ranked.some((item) => item.freshness !== "LIVE_OR_CURRENT") || incompleteVolume;
  const limitation = degraded
    ? ` Coverage is partial${incompleteVolume ? " and volume/liquidity data is incomplete" : ""}${failed.length ? `; unavailable: ${failed.join(", ")}` : ""}.`
    : "";
  return `${leader.symbol} is the strongest of the ${ranked.length} assets I can verify right now, with an objective score of ${leader.score.toFixed(1)} and status ${leader.status}. Ranking: ${ranking}.${limitation} This is a current strength ranking, not a trade recommendation.`;
}
