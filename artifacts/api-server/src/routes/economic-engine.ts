import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  autonomousPaperRuns, db, economicResearchRecords, paperExecutions, paperPortfolios, paperPositions,
  projectEconomicEntries, users,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  CommerceCapitalGovernor, CommerceOperator, CommerceUnitEconomicsEngine, ProductKillSwitch,
} from "../services/commerce";
import { ProjectEconomicsService, type EconomicScope, type ProjectEconomicEntry } from "../services/economics";
import {
  AIResearchGate, BacktestEngine, INITIAL_STRATEGIES, MarketDataQualityService, OpportunityScanner, TradeQualityEngine,
  TwelveDataProvider, TradingUniverse, synthesizeResearch, type MarketDataProvider,
} from "../services/market-intelligence";
import {
  AutonomousPaperTradingService, CapitalGovernor, ExitEngine, LiveReadinessEvaluator, PaperBroker, PaperPortfolio,
  StrategyPerformanceTracker, TradingReviewService,
} from "../services/paper-trading";
import { OpenAIProvider, type AIProvider } from "../services/ai/provider";
import { GrokProvider } from "../services/ai/xai-provider";

const router: IRouter = Router();
router.use(requireAuth);
const sharedResearchGate = new AIResearchGate<Record<string, unknown>>();

const SCOPES = new Set(["REAL", "PAPER", "FORECAST"]);
const ASSET_CLASSES = new Set(["STOCK", "ETF", "CRYPTO"]);
const REAL_CATEGORIES = new Set([
  "REPLIT_DEVELOPMENT_COST", "REPLIT_OPERATING_COST", "OPENAI_COST", "XAI_COST", "MARKET_DATA_COST",
  "INFRASTRUCTURE_COST", "COMMERCE_SOFTWARE_COST", "ADVERTISING_COST", "OTHER_OPERATING_EXPENSE",
  "REALIZED_TRADING_PNL", "REALIZED_COMMERCE_PNL", "OTHER_ATTRIBUTABLE_REVENUE", "REALIZED_COST_SAVING",
]);
const PAPER_CATEGORIES = new Set(["PAPER_TRADING_PNL", "PAPER_COMMERCE_PNL"]);
const FORECAST_CATEGORIES = new Set(["PROJECTED_REVENUE", "PROJECTED_SAVING", "PROJECTED_COST"]);

type EconomicEngineRuntime = {
  marketDataProvider: () => MarketDataProvider;
  openAIProvider: () => AIProvider;
  grokProvider: () => AIProvider;
};
const defaultRuntime: EconomicEngineRuntime = {
  marketDataProvider: () => new TwelveDataProvider({ apiKey: process.env.TWELVE_DATA_API_KEY }),
  openAIProvider: () => new OpenAIProvider(),
  grokProvider: () => new GrokProvider(),
};
let runtime: EconomicEngineRuntime = defaultRuntime;

export function setEconomicEngineRuntimeForTests(overrides: Partial<EconomicEngineRuntime> | null): void {
  runtime = overrides ? { ...defaultRuntime, ...overrides } : defaultRuntime;
}

async function getLocalUser(clerkUserId: string) {
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values({ clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId }).returning();
  if (created) return created;
  const [concurrent] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!concurrent) throw new Error("LOCAL_USER_PROVISIONING_FAILED");
  return concurrent;
}
function userId(req: unknown) { return (req as AuthenticatedRequest).clerkUserId; }
function bad(res: Parameters<Parameters<IRouter["post"]>[1]>[1], error: string, status = 400) {
  res.status(status).json({ error });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function cents(value: unknown, signed = false): value is number {
  return Number.isSafeInteger(value) && (signed || (value as number) >= 0);
}
function configuredProvider() {
  return runtime.marketDataProvider();
}
function evidenceView(value: unknown) {
  if (!isRecord(value) || !["BULLISH", "BEARISH", "NEUTRAL"].includes(String(value.direction)) ||
      typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1 ||
      !Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== "string")) return null;
  return {
    direction: value.direction as "BULLISH" | "BEARISH" | "NEUTRAL", confidence: value.confidence,
    evidence: value.evidence.slice(0, 8).map((item) => (item as string).slice(0, 240)),
  };
}
function entryFromRow(row: typeof projectEconomicEntries.$inferSelect): ProjectEconomicEntry {
  return {
    id: row.id, userId: row.userId, scope: row.bucket as EconomicScope, category: row.category as never,
    amountCents: row.amountCents, provenance: row.verified ? "VERIFIED" : "MANUALLY_ENTERED",
    evidence: { source: row.source, recordedAt: row.occurredAt.toISOString(), note: row.description },
  } as ProjectEconomicEntry;
}

router.get("/economic-engine/economics", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const scope = typeof req.query.scope === "string" ? req.query.scope.toUpperCase() : undefined;
    if (scope && !SCOPES.has(scope)) return bad(res, "INVALID_SCOPE");
    const rows = await db.select().from(projectEconomicEntries)
      .where(eq(projectEconomicEntries.userId, user.id)).orderBy(desc(projectEconomicEntries.occurredAt));
    res.json(rows.filter((row) => !scope || row.bucket === scope));
  } catch (error) { next(error); }
});
router.post("/economic-engine/economics", async (req, res, next) => {
  try {
    const input = req.body;
    const scope = typeof input?.scope === "string" ? input.scope.toUpperCase() : "";
    const category = typeof input?.category === "string" ? input.category.toUpperCase() : "";
    if (!SCOPES.has(scope) || !(scope === "REAL" ? REAL_CATEGORIES : scope === "PAPER" ? PAPER_CATEGORIES : FORECAST_CATEGORIES).has(category)) return bad(res, "INVALID_ECONOMIC_CATEGORY");
    if (!cents(input?.amountCents, category.includes("PNL")) || typeof input?.description !== "string" ||
      !input.description.trim() || input.description.length > 1000) return bad(res, "INVALID_ECONOMIC_ENTRY");
    const occurredAt = new Date(input?.occurredAt ?? "");
    if (Number.isNaN(occurredAt.getTime())) return bad(res, "VALID_OCCURRED_AT_REQUIRED");
    const user = await getLocalUser(userId(req));
    const [entry] = await db.insert(projectEconomicEntries).values({
      userId: user.id, bucket: scope, category, amountCents: input.amountCents, currency: "USD",
      source: "MANUAL", verified: input.verified === true, description: input.description.trim(), occurredAt,
    }).returning();
    res.status(201).json(entry);
  } catch (error) { next(error); }
});
router.delete("/economic-engine/economics/:id", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const [deleted] = await db.delete(projectEconomicEntries).where(and(
      eq(projectEconomicEntries.id, req.params.id), eq(projectEconomicEntries.userId, user.id),
    )).returning();
    if (!deleted) return bad(res, "ECONOMIC_ENTRY_NOT_FOUND", 404);
    res.status(204).end();
  } catch (error) { next(error); }
});
router.get("/economic-engine/economics/summary", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const rows = await db.select().from(projectEconomicEntries).where(eq(projectEconomicEntries.userId, user.id));
    const service = new ProjectEconomicsService({ insert() {}, listByUser: () => rows.map(entryFromRow) });
    res.json(service.summarize(user.id));
  } catch (error) { next(error); }
});

router.get("/economic-engine/commerce/foundation", (_req, res) => {
  res.json({ ...new CommerceOperator().getStatus(), liveBrokerage: false });
});
router.get("/economic-engine/commerce/status", (_req, res) => {
  res.json({ ...new CommerceOperator().getStatus(), capability: "NO_LIVE_COMMERCE_EXECUTION" });
});
router.post("/economic-engine/commerce/unit-economics", (req, res, next) => {
  try { res.json(new CommerceUnitEconomicsEngine().calculate(req.body)); } catch (error) { next(error); }
});
router.post("/economic-engine/commerce/capital/evaluate", (req, res, next) => {
  try {
    if (!isRecord(req.body?.limits) || !isRecord(req.body?.request)) return bad(res, "LIMITS_AND_REQUEST_REQUIRED");
    res.json(new CommerceCapitalGovernor(req.body.limits as never).evaluate(req.body.request as never));
  } catch (error) { next(error); }
});
router.post("/economic-engine/commerce/product-kill/evaluate", (req, res, next) => {
  try {
    if (!isRecord(req.body?.limits) || !isRecord(req.body?.performance)) return bad(res, "LIMITS_AND_PERFORMANCE_REQUIRED");
    res.json(new ProductKillSwitch(req.body.limits as never).evaluate(req.body.performance as never));
  } catch (error) { next(error); }
});

router.get("/economic-engine/market-lab/status", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const provider = configuredProvider();
    const [portfolio] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    const executions = await db.select().from(paperExecutions).where(eq(paperExecutions.userId, user.id));
    const runs = await db.select().from(autonomousPaperRuns).where(eq(autonomousPaperRuns.userId, user.id));
    const positions = await db.select().from(paperPositions).where(and(
      eq(paperPositions.userId, user.id),
      eq(paperPositions.status, "OPEN"),
    ));
    res.json({ mode: "PAPER_ONLY", scheduler: { enabled: false, truth: "MANUAL_ONLY" },
      providers: [await provider.getProviderHealth()], supportedAssetClasses: ["STOCK", "ETF", "CRYPTO"],
      strategies: INITIAL_STRATEGIES, portfolioConfigured: Boolean(portfolio), executionCount: executions.length,
      autonomousRunCount: runs.length, counts: {
        executionCount: executions.length,
        autonomousRunCount: runs.length,
        positions: positions.length,
        trades: executions.filter((execution) => execution.status === "FILLED").length,
      },
      latestRun: runs.at(-1) ?? null,
      liveTradingEnabled: false, brokerageExecution: false });
  } catch (error) { next(error); }
});
router.get("/economic-engine/status", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const health = await configuredProvider().getProviderHealth();
    const [portfolio] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    const [latestRun] = await db.select().from(autonomousPaperRuns).where(eq(autonomousPaperRuns.userId, user.id))
      .orderBy(desc(autonomousPaperRuns.startedAt)).limit(1);
    res.json({
      mode: "PAPER_ONLY", scheduler: { enabled: false, mode: "MANUAL_ONLY" },
      marketData: { provider: health.provider, configured: health.configured, status: health.status },
      portfolioConfigured: Boolean(portfolio), liveTradingEnabled: false, brokerageExecution: false,
      commerceExecution: false, latestRun: latestRun ?? null,
    });
  } catch (error) { next(error); }
});
async function assetFromQuery(req: { query: Record<string, unknown> }) {
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
  const assetClass = typeof req.query.assetClass === "string" ? req.query.assetClass.toUpperCase() : "";
  if (!symbol || symbol.length > 30 || !ASSET_CLASSES.has(assetClass)) throw new Error("VALID_SYMBOL_AND_ASSET_CLASS_REQUIRED");
  return configuredProvider().getAssetMetadata(symbol, assetClass as "STOCK" | "ETF" | "CRYPTO");
}
router.get("/economic-engine/market/quote", async (req, res, next) => {
  try { const provider = configuredProvider(); res.json(await provider.getQuote(await assetFromQuery(req))); } catch (error) { next(error); }
});
router.get("/economic-engine/market/bars", async (req, res, next) => {
  try {
    const size = req.query.outputSize === undefined ? 30 : Number(req.query.outputSize);
    const interval = typeof req.query.interval === "string" ? req.query.interval : "";
    if (!Number.isInteger(size) || size < 1 || size > 5000 || !interval || interval.length > 12) return bad(res, "INVALID_BARS_REQUEST");
    const provider = configuredProvider(); res.json(await provider.getBars(await assetFromQuery(req), interval, size));
  } catch (error) { next(error); }
});

router.post("/economic-engine/paper/portfolio", async (req, res, next) => {
  try {
    if (!cents(req.body?.startingCapitalCents) || req.body.startingCapitalCents <= 0) return bad(res, "EXPLICIT_STARTING_CAPITAL_CENTS_REQUIRED");
    const user = await getLocalUser(userId(req));
    const [existing] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    if (existing) return bad(res, "PAPER_PORTFOLIO_ALREADY_CONFIGURED", 409);
    const capital = req.body.startingCapitalCents;
    const [portfolio] = await db.insert(paperPortfolios).values({ userId: user.id, currency: "USD", startingCapitalCents: capital,
      cashCents: capital, equityCents: capital, highWaterMarkCents: capital, allocations: {}, status: "ACTIVE_PAPER" }).returning();
    res.status(201).json(portfolio);
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/portfolio", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const [portfolio] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    if (!portfolio) return bad(res, "PAPER_PORTFOLIO_NOT_CONFIGURED", 404);
    const positions = await db.select().from(paperPositions).where(and(eq(paperPositions.userId, user.id), eq(paperPositions.status, "OPEN")));
    res.json({ ...portfolio, positions, mode: "PAPER", liveTradingEnabled: false });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/strategies", (_req, res) => res.json({ definitions: INITIAL_STRATEGIES, mode: "PAPER_ONLY" }));
router.get("/economic-engine/paper/strategies/leaderboard", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const rows = await db.select().from(paperExecutions).where(eq(paperExecutions.userId, user.id));
    const tracker = new StrategyPerformanceTracker();
    for (const row of rows.filter((r) => r.netPnlCents !== null)) tracker.record({ id: row.id, strategyId: row.strategyId, strategyVersion: row.strategyVersion,
      assetClass: row.assetClass as "STOCK", stage: "PAPER", regime: "UNKNOWN", pnl: row.netPnlCents!, returnPercent: 0, fees: row.feesCents, slippage: row.slippageCents });
    res.json({ mode: "PAPER", leaderboard: tracker.leaderboard("PAPER") });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/strategies/review", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const rows = await db.select().from(paperExecutions).where(eq(paperExecutions.userId, user.id));
    const trades = rows.filter((r) => r.netPnlCents !== null).map((r) => {
      const intent = r.orderIntent;
      return { id: r.id, mode: "PAPER" as const, symbol: String(intent.symbol), assetClass: r.assetClass as "STOCK", strategyId: r.strategyId, strategyVersion: r.strategyVersion, openedAt: String(intent.openedAt ?? r.createdAt.toISOString()), closedAt: String(intent.closedAt ?? r.updatedAt.toISOString()), quantity: r.filledQuantity, entryPrice: Number(intent.entryCents) / 100, exitPrice: Number(intent.exitCents ?? r.averageFillCents) / 100, grossPnl: r.grossPnlCents ?? 0, fees: r.feesCents, slippage: r.slippageCents, netPnl: r.netPnlCents!, exitReason: (r.exitReason ?? "MANUAL_PAPER_CLOSE") as "MANUAL_PAPER_CLOSE" };
    });
    res.json(new TradingReviewService().review(trades, 0));
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/review", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const rows = await db.select().from(paperExecutions).where(eq(paperExecutions.userId, user.id));
    const trades = rows.filter((r) => r.netPnlCents !== null).map((r) => {
      const intent = r.orderIntent;
      return { id: r.id, mode: "PAPER" as const, symbol: String(intent.symbol), assetClass: r.assetClass as "STOCK", strategyId: r.strategyId, strategyVersion: r.strategyVersion, openedAt: String(intent.openedAt ?? r.createdAt.toISOString()), closedAt: String(intent.closedAt ?? r.updatedAt.toISOString()), quantity: r.filledQuantity, entryPrice: Number(intent.entryCents) / 100, exitPrice: Number(intent.exitCents ?? r.averageFillCents) / 100, grossPnl: r.grossPnlCents ?? 0, fees: r.feesCents, slippage: r.slippageCents, netPnl: r.netPnlCents!, exitReason: (r.exitReason ?? "MANUAL_PAPER_CLOSE") as "MANUAL_PAPER_CLOSE" };
    });
    res.json(new TradingReviewService().review(trades, 0));
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/strategies/live-readiness", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const rows = await db.select().from(paperExecutions).where(eq(paperExecutions.userId, user.id));
    const pnl = rows.reduce((sum, row) => sum + (row.netPnlCents ?? 0), 0);
    const gains = rows.reduce((sum, row) => sum + Math.max(0, row.netPnlCents ?? 0), 0);
    const losses = rows.reduce((sum, row) => sum + Math.max(0, -(row.netPnlCents ?? 0)), 0);
    const [portfolio] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    const strategyCounts = rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.strategyId] = (counts[row.strategyId] ?? 0) + 1; return counts;
    }, {});
    const concentration = rows.length ? Math.max(0, ...Object.values(strategyCounts)) / rows.length : 0;
    res.json(new LiveReadinessEvaluator().evaluate({
      sampleSize: rows.length, netExpectancy: rows.length ? pnl / rows.length : 0,
      profitFactor: losses ? gains / losses : 0,
      maxDrawdown: (portfolio?.maxDrawdownBps ?? 0) / 10_000, outOfSampleTrades: 0,
      paperTrades: rows.length, regimeCount: 0, slippageSensitivity: 0, strategyConcentration: concentration,
      dataQuality: 0, ruleViolations: rows.filter((row) => row.status === "REJECTED").length,
      systemReliability: 0,
    }));
  } catch (error) { next(error); }
});
router.post("/economic-engine/paper/autonomous-cycle", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req)); const provider = configuredProvider(); const health = await provider.getProviderHealth();
    if (!health.configured) return bad(res, "MARKET_DATA_PROVIDER_NOT_CONFIGURED", 409);
    const [portfolio] = await db.select().from(paperPortfolios)
      .where(eq(paperPortfolios.userId, user.id)).limit(1);
    if (!portfolio) return bad(res, "PAPER_PORTFOLIO_NOT_CONFIGURED", 409);
    const existingPositions = await db.select().from(paperPositions).where(and(
      eq(paperPositions.userId, user.id), eq(paperPositions.status, "OPEN"),
    ));
    if (existingPositions.length) {
      const evaluated: Array<{
        position: typeof paperPositions.$inferSelect;
        quotePrice: number;
        marketTimestamp: string;
        markCents: number;
        highestPrice: number;
        shouldExit: boolean;
        exitReason: string | null;
        providerBidAskStatus: "AVAILABLE" | "BID_ASK_UNAVAILABLE";
        paperExecutionCost: "PROVIDER_BID_ASK_DERIVED" | "MODELED";
        executionSpreadBps: number;
        filled: ReturnType<PaperBroker["fill"]> | null;
      }> = [];
      const markErrors: Array<{ symbol: string; reason: string }> = [];
      for (const position of existingPositions) {
        try {
          const asset = {
            symbol: position.symbol, name: position.symbol, assetClass: position.assetClass as "STOCK" | "ETF" | "CRYPTO",
            exchange: null, currency: position.assetClass === "CRYPTO" ? position.symbol : "USD",
            quoteCurrency: position.assetClass === "CRYPTO" ? "USD" : null,
            tradingHoursType: position.assetClass === "CRYPTO" ? "TWENTY_FOUR_SEVEN" as const : "EXCHANGE_SESSION" as const,
            fractionalSupport: "UNKNOWN" as const, liquidityData: null, providerMetadata: {},
          };
          const quote = await provider.getQuote(asset);
          if (!["LIVE_OR_CURRENT", "DELAYED"].includes(quote.freshness)) throw new Error(`DATA_${quote.freshness}`);
          if (!Number.isFinite(quote.price) || quote.price <= 0) throw new Error("EXECUTABLE_QUOTE_REQUIRED");
          const providerBidAskAvailable = quote.bidAskStatus === "AVAILABLE";
          if (providerBidAskAvailable && (
            quote.bid === null || !Number.isFinite(quote.bid) || quote.bid <= 0 ||
            quote.ask === null || !Number.isFinite(quote.ask) || quote.ask < quote.bid
          )) {
            throw new Error("INVALID_PROVIDER_BID_ASK");
          }
          const defaultSpreadBps = ({ STOCK: 2, ETF: 1, CRYPTO: 10 } as const)[asset.assetClass];
          const executionSpreadBps = providerBidAskAvailable
            ? (quote.ask! - quote.bid!) / quote.price * 10_000
            : defaultSpreadBps;
          const paperExecutionCost = providerBidAskAvailable ? "PROVIDER_BID_ASK_DERIVED" as const : "MODELED" as const;
          const evaluation = new ExitEngine().evaluate({
            symbol: position.symbol, assetClass: asset.assetClass, strategyId: position.strategyId,
            strategyVersion: position.strategyVersion, quantity: position.quantity,
            averageEntryPrice: position.averageEntryCents / 100, currentPrice: quote.price,
            openedAt: position.openedAt.toISOString(),
            highestPrice: Number(position.metadata.highestPrice ?? position.currentPriceCents / 100),
            ...(position.stopCents === null ? {} : { stopPrice: position.stopCents / 100 }),
            ...(position.targetCents === null ? {} : { targetPrice: position.targetCents / 100 }),
            ...(typeof position.metadata.trailingStopPercent === "number"
              ? { trailingStopPercent: position.metadata.trailingStopPercent } : {}),
            invalidated: position.metadata.invalidated === true,
            regimeChanged: position.metadata.regimeChanged === true,
            ...(typeof position.metadata.signalStrength === "number"
              ? { signalStrength: position.metadata.signalStrength } : {}),
            maxHoldingMs: typeof position.metadata.maxHoldingMs === "number"
              ? position.metadata.maxHoldingMs : 7 * 24 * 60 * 60_000,
            entryFees: Number(position.metadata.entryFees ?? 0),
            entrySlippage: Number(position.metadata.entrySlippage ?? 0),
          }, {
            now: quote.marketTimestamp,
            manualClose: position.metadata.manualClose === true,
            capitalGovernorExit: position.metadata.capitalGovernorExit === true ||
              portfolio.currentDrawdownBps >= 2_000,
            signalDeteriorationThreshold: typeof position.metadata.signalDeteriorationThreshold === "number"
              ? position.metadata.signalDeteriorationThreshold : 0.35,
          });
          let filled: ReturnType<PaperBroker["fill"]> | null = null;
          if (evaluation.shouldExit && evaluation.reason) {
            const exitSpreads = { STOCK: 2, ETF: 1, CRYPTO: 10 };
            exitSpreads[asset.assetClass] = executionSpreadBps;
            const exitBroker = new PaperBroker({
              feeRate: 0.0005,
              minimumFee: 0,
              spreadBps: exitSpreads,
              slippageBps: { STOCK: 3, ETF: 2, CRYPTO: 15 },
            });
            const order = exitBroker.submit({
              symbol: position.symbol, assetClass: asset.assetClass, strategyId: position.strategyId,
              strategyVersion: position.strategyVersion, side: "SELL", quantity: position.quantity,
              orderType: "MARKET", submittedAt: quote.marketTimestamp,
            });
            filled = exitBroker.fill(order.id, quote.price, position.quantity, quote.marketTimestamp);
          }
          evaluated.push({
            position,
            quotePrice: quote.price,
            marketTimestamp: quote.marketTimestamp,
            markCents: Math.round(quote.price * 100),
            highestPrice: Math.max(Number(position.metadata.highestPrice ?? 0), quote.price),
            shouldExit: Boolean(evaluation.shouldExit && evaluation.reason),
            exitReason: evaluation.reason ?? null,
            providerBidAskStatus: quote.bidAskStatus,
            paperExecutionCost,
            executionSpreadBps,
            filled,
          });
        } catch (error) {
          markErrors.push({
            symbol: position.symbol,
            reason: error instanceof Error ? error.message.slice(0, 120) : "POSITION_MARK_FAILED",
          });
        }
      }
      if (markErrors.length || !evaluated.length) {
        const [run] = await db.insert(autonomousPaperRuns).values({
          userId: user.id, status: "COMPLETED", outcome: "NO_TRADE", provider: "TWELVE_DATA",
          completedAt: new Date(), noTradeDecisions: 1,
          summary: { mode: "PAPER", reason: "COMPLETE_POSITION_MARKS_REQUIRED", markErrors },
        }).returning();
        return res.status(201).json({ ...run, mode: "PAPER", liveTradingEnabled: false });
      }
      const accounting = await db.transaction(async (tx) => {
        let cashCents = portfolio.cashCents;
        let realizedPnlCents = portfolio.realizedPnlCents;
        let unrealizedPnlCents = 0;
        let openMarketValueCents = 0;
        const exited: Array<{ symbol: string; reason: string }> = [];
        const held: string[] = [];
        for (const item of evaluated) {
          if (item.shouldExit && item.exitReason && item.filled) {
            const proceedsCents = Math.round(
              item.filled.fills.reduce((sum, fill) => sum + fill.grossNotional, 0) * 100,
            );
            const feesCents = Math.round(
              item.filled.fills.reduce((sum, fill) => sum + fill.fee, 0) * 100,
            );
            const slippageCents = Math.round(
              item.filled.fills.reduce((sum, fill) => sum + fill.slippageCost + fill.spreadCost, 0) * 100,
            );
            const averageFillCents = Math.round((item.filled.averageFillPrice ?? item.quotePrice) * 100);
            const grossPnlCents = Math.round(
              (averageFillCents - item.position.averageEntryCents) * item.position.quantity,
            );
            const entryFeesCents = Math.round(Number(item.position.metadata.entryFees ?? 0) * 100);
            const netPnlCents = grossPnlCents - feesCents - entryFeesCents;
            const [closed] = await tx.update(paperPositions).set({
              status: "CLOSED",
              closedAt: new Date(item.marketTimestamp),
              currentPriceCents: item.markCents,
              updatedAt: new Date(),
              metadata: {
                ...item.position.metadata,
                highestPrice: item.highestPrice,
                markedAt: item.marketTimestamp,
                exitReason: item.exitReason,
              },
            }).where(and(
              eq(paperPositions.id, item.position.id),
              eq(paperPositions.userId, user.id),
              eq(paperPositions.status, "OPEN"),
            )).returning();
            if (!closed) throw new Error("PAPER_CYCLE_CONFLICT_RETRY");
            await tx.insert(paperExecutions).values({
              portfolioId: portfolio.id,
              userId: user.id,
              orderIntent: {
                symbol: item.position.symbol,
                side: "SELL",
                entryCents: item.position.averageEntryCents,
                exitCents: averageFillCents,
                openedAt: item.position.openedAt.toISOString(),
                closedAt: item.marketTimestamp,
                providerBidAskStatus: item.providerBidAskStatus,
                paperExecutionCost: item.paperExecutionCost,
                executionSpreadBps: item.executionSpreadBps,
              },
              assetClass: item.position.assetClass,
              strategyId: item.position.strategyId,
              strategyVersion: item.position.strategyVersion,
              status: "FILLED",
              paperLabel: "PAPER",
              requestedQuantity: item.position.quantity,
              filledQuantity: item.filled.filledQuantity,
              averageFillCents,
              feesCents,
              slippageCents,
              grossPnlCents,
              netPnlCents,
              exitReason: item.exitReason,
              rejectionReasons: [],
            });
            cashCents += proceedsCents - feesCents;
            realizedPnlCents += netPnlCents;
            exited.push({ symbol: item.position.symbol, reason: item.exitReason });
          } else {
            const marketValueCents = Math.round(item.markCents * item.position.quantity);
            openMarketValueCents += marketValueCents;
            unrealizedPnlCents += Math.round(
              (item.markCents - item.position.averageEntryCents) * item.position.quantity,
            );
            const [marked] = await tx.update(paperPositions).set({
              currentPriceCents: item.markCents,
              updatedAt: new Date(),
              metadata: {
                ...item.position.metadata,
                highestPrice: item.highestPrice,
                markedAt: item.marketTimestamp,
              },
            }).where(and(
              eq(paperPositions.id, item.position.id),
              eq(paperPositions.userId, user.id),
              eq(paperPositions.status, "OPEN"),
            )).returning();
            if (!marked) throw new Error("PAPER_CYCLE_CONFLICT_RETRY");
            held.push(item.position.symbol);
          }
        }
        const equityCents = cashCents + openMarketValueCents;
        const highWaterMarkCents = Math.max(portfolio.highWaterMarkCents, equityCents);
        const drawdownBps = highWaterMarkCents
          ? Math.max(0, Math.round((highWaterMarkCents - equityCents) * 10_000 / highWaterMarkCents))
          : 0;
        const [updatedPortfolio] = await tx.update(paperPortfolios).set({
          cashCents,
          equityCents,
          realizedPnlCents,
          unrealizedPnlCents,
          highWaterMarkCents,
          currentDrawdownBps: drawdownBps,
          maxDrawdownBps: Math.max(portfolio.maxDrawdownBps, drawdownBps),
          cycleVersion: sql`${paperPortfolios.cycleVersion} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(paperPortfolios.id, portfolio.id),
          eq(paperPortfolios.userId, user.id),
          eq(paperPortfolios.cycleVersion, portfolio.cycleVersion),
        )).returning();
        if (!updatedPortfolio) throw new Error("PAPER_CYCLE_CONFLICT_RETRY");
        return { exited, held, equityCents, unrealizedPnlCents };
      });
      const [run] = await db.insert(autonomousPaperRuns).values({
        userId: user.id,
        status: "COMPLETED",
        outcome: "NO_TRADE",
        provider: "TWELVE_DATA",
        completedAt: new Date(),
        noTradeDecisions: 1,
        summary: {
          mode: "PAPER",
          reason: accounting.exited.length ? "POSITIONS_EXITED" : "OPEN_POSITIONS_HELD",
          ...accounting,
          markErrors,
        },
      }).returning();
      return res.status(201).json({ ...run, mode: "PAPER", liveTradingEnabled: false });
    }
    /*
     * This is deliberately a tiny, inspectable universe. We request metadata, bars,
     * quotes, and volume from the configured provider. When provider bid/ask is absent,
     * PAPER execution may use the broker's separately labeled deterministic cost model;
     * those modeled costs are never stored as provider liquidity observations.
     */
    const requested = [
      { symbol: "SPY", assetClass: "ETF" as const }, { symbol: "AAPL", assetClass: "STOCK" as const },
      { symbol: "BTC", assetClass: "CRYPTO" as const },
    ];
    const quality = new MarketDataQualityService();
    const universe = new TradingUniverse({ id: "manual-liquid-v1", name: "Manual liquid universe",
      assetClasses: ["STOCK", "ETF", "CRYPTO"], symbols: requested.map((item) => item.symbol),
      liquidity: { minimumAverageDailyVolume: 1, minimumAverageDailyDollarVolume: 1, maximumSpreadBps: 100 } });
    const inspected: Array<{ symbol: string; reason: string }> = [];
    const candidates: Array<{ symbol: string; assetClass: "STOCK" | "ETF" | "CRYPTO"; referencePrice: number; strategyId: string; strategyVersion: string; score: number; dataTimestamp: string; stopPrice: number; targetPrice: number }> = [];
    const candidateFreshness = new Map<string, "LIVE_OR_CURRENT" | "DELAYED">();
    const objectiveQuality = new Map<string, Record<string, number>>();
    const researchAgreement = new Map<string, "STRONG_AGREEMENT" | "PARTIAL_AGREEMENT" | "MIXED" | "STRONG_DISAGREEMENT" | "INSUFFICIENT_INFORMATION">();
    let candidateExecution: {
      assetClass: "STOCK" | "ETF" | "CRYPTO";
      spreadBps: number;
      providerBidAskStatus: "AVAILABLE" | "BID_ASK_UNAVAILABLE";
      paperExecutionCost: "PROVIDER_BID_ASK_DERIVED" | "MODELED";
    } | null = null;
    const modeledSpreadBps = { STOCK: 2, ETF: 1, CRYPTO: 10 } as const;
    for (const item of requested) {
      try {
        const rawAsset = await provider.getAssetMetadata(item.symbol, item.assetClass);
        const bars = await provider.getBars(rawAsset, "1h", 200);
        const quote = await provider.getQuote(rawAsset);
        if (!quality.isUsableForCurrentStrategy(bars.freshness) || !quality.isUsableForCurrentStrategy(quote.freshness)) {
          inspected.push({ symbol: item.symbol, reason: `DATA_${bars.freshness}` }); continue;
        }
        const averageVolume = bars.bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.bars.length;
        const averageDollarVolume = bars.bars.reduce((sum, bar) => sum + bar.volume * bar.close, 0) / bars.bars.length;
        if (!Number.isFinite(averageVolume) || !Number.isFinite(averageDollarVolume) || averageVolume <= 0 ||
            averageDollarVolume <= 0) {
          inspected.push({ symbol: item.symbol, reason: "LIQUIDITY_DATA_REQUIRED" }); continue;
        }
        const providerBidAskAvailable = quote.bidAskStatus === "AVAILABLE";
        if (providerBidAskAvailable &&
            (quote.bid === null || quote.ask === null || quote.bid <= 0 || quote.ask < quote.bid)) {
          inspected.push({ symbol: item.symbol, reason: "INVALID_PROVIDER_BID_ASK" }); continue;
        }
        const executionSpreadBps = providerBidAskAvailable
          ? (quote.ask! - quote.bid!) / quote.price * 10_000
          : modeledSpreadBps[item.assetClass];
        const asset = { ...rawAsset, liquidityData: { averageDailyVolume: averageVolume,
          averageDailyDollarVolume: averageDollarVolume,
          ...(providerBidAskAvailable ? { spreadBps: executionSpreadBps } : {}),
          measuredAt: quote.marketTimestamp } };
        const candidate = new OpportunityScanner().scan(asset, bars.bars);
        const membership = universe.inspect([asset])[0];
        const membershipBlockers = providerBidAskAvailable
          ? [...membership.reasons]
          : membership.reasons.filter((reason) => reason !== "SPREAD_TOO_WIDE");
        if (!providerBidAskAvailable && executionSpreadBps > universe.config.liquidity.maximumSpreadBps) {
          membershipBlockers.push("MODELED_SPREAD_TOO_WIDE");
        }
        if (membershipBlockers.length) {
          inspected.push({ symbol: item.symbol, reason: membershipBlockers.join(",") }); continue;
        }
        if (candidate.status !== "CANDIDATE") {
          inspected.push({ symbol: item.symbol, reason: candidate.reason ?? "NO_TRADE" }); continue;
        }
        const backtest = new BacktestEngine({ startingCapital: portfolio.cashCents / 100, feePerOrder: 0,
          feeRate: 0.0005, slippageBps: 5, trainFraction: 0.7, minimumTrades: 5 }).run(bars.bars, {
          id: "momentum",
          shouldEnter: (history) => history.length >= 20 && history.at(-1)!.close >
            history.slice(-20).reduce((sum, bar) => sum + bar.close, 0) / 20,
          shouldExit: (history, position) => history.at(-1)!.close < position.entryPrice,
          positionSize: (cash, price) => Math.floor((cash * 0.01) / price),
        });
        const expectancyScore = Math.max(0, Math.min(100, 50 + backtest.outOfSample.expectancy * 10));
        const objective = {
          strategyEvidence: candidate.score, historicalExpectancy: expectancyScore,
          outOfSampleEvidence: Math.min(100, backtest.outOfSample.tradeCount * 10),
          regimeFit: candidate.features.trend * 100, liquidity: Math.min(100, Math.log10(averageDollarVolume) * 10),
          volatilitySuitability: Math.max(0, 100 - candidate.features.volatility * 1_000),
          riskReward: candidate.features.atrPercent > 0 ? Math.min(100, 100 / candidate.features.atrPercent / 10) : 0,
          signalStrength: candidate.score, catalystQuality: 0, portfolioDiversification: 100,
          drawdownSafety: Math.max(0, 100 - portfolio.currentDrawdownBps / 100),
          executionQuality: 100 - Math.min(100, executionSpreadBps / 2),
        };
        objectiveQuality.set(asset.symbol, objective);
        if (candidate.score < 70 || backtest.outOfSample.sampleStatus !== "SUFFICIENT") {
          inspected.push({ symbol: item.symbol, reason: "OBJECTIVE_STRATEGY_EVIDENCE_INSUFFICIENT" }); continue;
        }
        // At most one candidate is allowed into a manually triggered cycle.
        candidates.push({ symbol: asset.symbol, assetClass: asset.assetClass, referencePrice: quote.price,
          strategyId: "momentum", strategyVersion: "1.0.0", score: candidate.score, dataTimestamp: quote.marketTimestamp,
          stopPrice: quote.price * (1 - Math.max(candidate.features.atrPercent * 2, 0.002)),
          targetPrice: quote.price * (1 + Math.max(candidate.features.atrPercent * 3, 0.004)) });
        candidateExecution = {
          assetClass: asset.assetClass,
          spreadBps: executionSpreadBps,
          providerBidAskStatus: quote.bidAskStatus,
          paperExecutionCost: providerBidAskAvailable ? "PROVIDER_BID_ASK_DERIVED" : "MODELED",
        };
        candidateFreshness.set(
          asset.symbol,
          bars.freshness === "DELAYED" || quote.freshness === "DELAYED" ? "DELAYED" : "LIVE_OR_CURRENT",
        );
        break;
      } catch {
        inspected.push({ symbol: item.symbol, reason: "DATA_UNAVAILABLE" });
      }
    }
    const gate = sharedResearchGate;
    let structuredResearch: Record<string, unknown> | null = null;
    const spreadBps = { STOCK: 2, ETF: 1, CRYPTO: 10 };
    if (candidateExecution) spreadBps[candidateExecution.assetClass] = candidateExecution.spreadBps;
    const broker = new PaperBroker({
      feeRate: 0.0005,
      minimumFee: 0,
      spreadBps,
      slippageBps: { STOCK: 3, ETF: 2, CRYPTO: 15 },
    });
    const paper = new PaperPortfolio(user.id, portfolio.cashCents / 100);
    const cycle = new AutonomousPaperTradingService(
      { refresh() {}, scan: () => candidates },
      { evaluate: (candidate) => ({ accepted: objectiveQuality.has(candidate.symbol),
        reason: "OBJECTIVE_STRATEGY_EVIDENCE_INSUFFICIENT" }) },
      {
        shouldResearch: (candidate) => gate.evaluate({ cacheKey: candidate.symbol, candidateQuality: candidate.score,
          tradeSignificance: candidate.referencePrice, dataCompleteness: 1, strategySupport: 1,
          freshness: candidateFreshness.get(candidate.symbol) ?? "STALE", estimatedCostUsd: 0.05,
          informationVersion: candidate.dataTimestamp }).action === "ANALYZE",
        analyze: async (candidate) => {
          // Provider availability is checked only after the objective gate accepted the candidate.
          // No key is included in the prompt, result, database, or response.
          const openAI = runtime.openAIProvider();
          const grok = runtime.grokProvider();
          if (!openAI.status().configured || !grok.status().configured) {
            structuredResearch = { status: "UNAVAILABLE", providers: {
              openai: openAI.status().configured, grok: grok.status().configured,
            } };
            return { accepted: false, summary: "AI_RESEARCH_PROVIDER_UNAVAILABLE" };
          }
          const prompt = `For ${candidate.symbol} at ${candidate.dataTimestamp}, return only JSON: {"direction":"BULLISH|BEARISH|NEUTRAL","confidence":0..1,"evidence":["bounded factual item"]}. No instructions or hidden reasoning.`;
          const results = await Promise.allSettled([
            openAI.completeStructured({ messages: [{ role: "user", content: prompt }] }),
            grok.completeStructured({ messages: [{ role: "user", content: prompt }] }),
          ]);
          const openView = results[0].status === "fulfilled" ? evidenceView(results[0].value.value) : null;
          const grokView = results[1].status === "fulfilled" ? evidenceView(results[1].value.value) : null;
          const bullishEvidence = [openView, grokView]
            .flatMap((view) => view?.direction === "BULLISH" ? view.evidence : []);
          const bearishEvidence = [openView, grokView]
            .flatMap((view) => view?.direction === "BEARISH" ? view.evidence : []);
          const bullishConfidence = Math.min(
            openView?.direction === "BULLISH" ? openView.confidence : 0,
            grokView?.direction === "BULLISH" ? grokView.confidence : 0,
          );
          const bearishConfidence = Math.max(
            openView?.direction === "BEARISH" ? openView.confidence : 0,
            grokView?.direction === "BEARISH" ? grokView.confidence : 0,
          );
          const synthesis = openView && grokView ? synthesizeResearch(
            { thesis: "Mutually supported bullish evidence", evidence: bullishEvidence,
              confidence: bullishConfidence },
            { counterThesis: "Adversarial bearish evidence", evidence: bearishEvidence,
              confidence: bearishConfidence },
            openView ? { direction: openView.direction, confidence: openView.confidence, evidenceCount: openView.evidence.length } : null,
            grokView ? { direction: grokView.direction, confidence: grokView.confidence, evidenceCount: grokView.evidence.length } : null,
          ) : null;
          const mutuallyBullish = Boolean(
            openView && grokView &&
            openView.direction === "BULLISH" && grokView.direction === "BULLISH" &&
            openView.confidence >= 0.7 && grokView.confidence >= 0.7 &&
            openView.evidence.length > 0 && grokView.evidence.length > 0,
          );
          structuredResearch = { status: synthesis ? "COMPLETED" : "INVALID_OR_UNAVAILABLE",
            openai: openView, grok: grokView, mutuallyBullish, synthesis };
          if (synthesis) researchAgreement.set(candidate.symbol, synthesis.agreement);
          const complete = Boolean(mutuallyBullish && synthesis && synthesis.decision === "QUALIFIED");
          // AI only supplies independently preserved evidence; objective quality/risk still decide.
          return { accepted: complete, summary: complete ? "STRUCTURED_RESEARCH_RECORDED" : "AI_RESEARCH_INVALID" };
        },
      },
      { evaluate: (candidate) => {
        const objective = objectiveQuality.get(candidate.symbol);
        const agreement = researchAgreement.get(candidate.symbol);
        if (!objective || !agreement) return { approved: false, quantity: 0, reason: "FINAL_TRADE_QUALITY_INCOMPLETE" };
        const finalQuality = new TradeQualityEngine().evaluate({ ...objective, modelAgreement: agreement });
        if (finalQuality.decision !== "TRADE_ELIGIBLE") {
          return { approved: false, quantity: 0, reason: "FINAL_TRADE_QUALITY_NO_TRADE" };
        }
        const paperCash = paper.snapshot().cash;
        const quantity = Math.floor(Math.min(paperCash * 0.01, paperCash * 0.2) / candidate.referencePrice);
        return quantity > 0 ? { approved: true, quantity } : { approved: false, quantity: 0, reason: "INSUFFICIENT_PAPER_CASH" };
      } },
      new CapitalGovernor({ allocations: { STOCK: 0.5, ETF: 0.5, CRYPTO: 0.2 }, minimumCashReservePercent: 0.1,
        maxGrossExposurePercent: 0.8, maxPositionPercent: 0.2, maxStrategyPercent: 0.3,
        maxCorrelatedExposurePercent: 0.3, maxDrawdownPercent: 0.2, maxLosingStreak: 3, protectedProfitPercent: 0.5 }),
      broker, paper,
    );
    const result = await cycle.runCycle();
    const snapshot = paper.snapshot();
    await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${portfolio.id}))`);
    if (snapshot.positions.length) {
      const concurrent = await tx.select().from(paperPositions).where(and(
        eq(paperPositions.portfolioId, portfolio.id), eq(paperPositions.status, "OPEN"),
      )).limit(1);
      if (concurrent.length) throw new Error("PAPER_CYCLE_CONFLICT_RETRY");
    }
    for (const order of broker.listOrders().filter((order) => order.status === "FILLED")) {
      await tx.insert(paperExecutions).values({
        portfolioId: portfolio.id, userId: user.id, orderIntent: {
          symbol: order.symbol, side: order.side, orderType: order.orderType,
          entryCents: Math.round((order.averageFillPrice ?? 0) * 100), openedAt: order.submittedAt,
          providerBidAskStatus: candidateExecution?.providerBidAskStatus ?? "BID_ASK_UNAVAILABLE",
          paperExecutionCost: candidateExecution?.paperExecutionCost ?? "MODELED",
          executionSpreadBps: candidateExecution?.spreadBps ?? null,
        },
        assetClass: order.assetClass, strategyId: order.strategyId, strategyVersion: order.strategyVersion,
        status: order.status, paperLabel: "PAPER", requestedQuantity: order.quantity, filledQuantity: order.filledQuantity,
        averageFillCents: Math.round((order.averageFillPrice ?? 0) * 100),
        feesCents: Math.round(order.fills.reduce((sum, fill) => sum + fill.fee, 0) * 100),
        slippageCents: Math.round(order.fills.reduce((sum, fill) => sum + fill.slippageCost + fill.spreadCost, 0) * 100),
        rejectionReasons: [],
      });
    }
    for (const position of snapshot.positions) {
      await tx.insert(paperPositions).values({
        portfolioId: portfolio.id, userId: user.id, symbol: position.symbol, assetClass: position.assetClass,
        strategyId: position.strategyId, strategyVersion: position.strategyVersion, quantity: position.quantity,
        averageEntryCents: Math.round(position.averageEntryPrice * 100), currentPriceCents: Math.round(position.currentPrice * 100),
        stopCents: position.stopPrice ? Math.round(position.stopPrice * 100) : null,
        targetCents: position.targetPrice ? Math.round(position.targetPrice * 100) : null,
        openedAt: new Date(position.openedAt), status: "OPEN", metadata: { mode: "PAPER",
          highestPrice: position.highestPrice, entryFees: position.entryFees, entrySlippage: position.entrySlippage,
          invalidated: false, regimeChanged: false,
          signalStrength: (objectiveQuality.get(position.symbol)?.signalStrength ?? 0) / 100,
          signalDeteriorationThreshold: 0.35, maxHoldingMs: 7 * 24 * 60 * 60_000,
          capitalGovernorExit: false, manualClose: false },
      });
    }
    const [updatedPortfolio] = await tx.update(paperPortfolios).set({
      cashCents: Math.round(snapshot.cash * 100), equityCents: Math.round(snapshot.equity * 100),
      realizedPnlCents: Math.round(snapshot.realizedPnL * 100), unrealizedPnlCents: Math.round(snapshot.unrealizedPnL * 100),
      highWaterMarkCents: Math.round(snapshot.highWaterMark * 100),
      currentDrawdownBps: Math.round(snapshot.currentDrawdown * 10_000), maxDrawdownBps: Math.round(snapshot.maxDrawdown * 10_000),
      cycleVersion: sql`${paperPortfolios.cycleVersion} + 1`,
      updatedAt: new Date(),
    }).where(and(
      eq(paperPortfolios.id, portfolio.id),
      eq(paperPortfolios.userId, user.id),
      eq(paperPortfolios.cycleVersion, portfolio.cycleVersion),
    )).returning();
    if (!updatedPortfolio) throw new Error("PAPER_CYCLE_CONFLICT_RETRY");
    });
    if (structuredResearch) {
      await db.insert(economicResearchRecords).values({
        userId: user.id, opportunityClass: "MARKET_PAPER_CANDIDATE", question: "Manual paper-cycle research",
        decision: "NO_TRADE", evidence: [structuredResearch], freshness: "CURRENT_CANDIDATE",
        uncertainty: "MODEL_OUTPUT_NOT_TRADE_AUTHORIZATION", assumptions: [], modelsUsed: ["OPENAI", "GROK"],
        dataUsed: ["TWELVE_DATA"],
      });
    }
    const [run] = await db.insert(autonomousPaperRuns).values({ userId: user.id, status: "COMPLETED",
      outcome: result.outcome, provider: "TWELVE_DATA", completedAt: new Date(), candidatesEvaluated: result.candidatesEvaluated,
      candidatesRejected: result.candidatesRejected, tradesTaken: result.tradesTaken, noTradeDecisions: result.noTradeDecisions,
      summary: { mode: "PAPER", inspected, rejectionReasons: result.rejectionReasons } }).returning();
    res.status(201).json({ ...run, mode: "PAPER", result, liveTradingEnabled: false });
  } catch (error) {
    if (error instanceof Error && error.message === "PAPER_CYCLE_CONFLICT_RETRY") {
      return bad(res, "PAPER_CYCLE_CONFLICT_RETRY", 409);
    }
    next(error);
  }
});

export default router;