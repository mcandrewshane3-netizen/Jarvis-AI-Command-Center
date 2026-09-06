import { Router, type IRouter } from "express";
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  autonomousPaperRuns, db, economicResearchRecords, learningArtifacts, learningReviews, marketBars, paperExecutions,
  marketBarRetentionCutoff, operationsNotificationEvents, paperOperationsSessions, paperPortfolios, paperPositions,
  projectEconomicEntries, researchValueEvents, riskProfiles, strategyDecisionOutcomes, strategyPerformances,
  strategyRegistryEntries, users,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  CommerceCapitalGovernor, CommerceOperator, CommerceUnitEconomicsEngine, ProductKillSwitch,
} from "../services/commerce";
import { ProjectEconomicsService, type EconomicScope, type ProjectEconomicEntry } from "../services/economics";
import {
  AIResearchGate, BacktestEngine, createExecutableStrategy, DailyLearningReview, INITIAL_STRATEGIES, JarvisLearningEngine, MarketDataQualityService, OpportunityScanner, TradeQualityEngine,
  TwelveDataProvider, TradingUniverse, AUTONOMOUS_CRYPTO_CORE_UNIVERSE, synthesizeResearch, type MarketDataProvider,
  WeeklyStrategyReview,
} from "../services/market-intelligence";
import {
  AutonomousPaperTradingService, CapitalGovernor, ExitEngine, LiveReadinessEvaluator, PaperBroker, PaperPortfolio,
  StrategyPerformanceTracker, TradingReviewService,
} from "../services/paper-trading";
import { OpenAIProvider, type AIProvider } from "../services/ai/provider";
import { GrokProvider } from "../services/ai/xai-provider";
import { RiskEngine } from "../services/trading/risk-engine";

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
async function ensureOperationsSession(localUserId: string) {
  const [portfolio] = await db.select().from(paperPortfolios)
    .where(eq(paperPortfolios.userId, localUserId)).limit(1);
  if (!portfolio) return null;
  const [session] = await db.insert(paperOperationsSessions).values({
    userId: localUserId,
    startingPaperEquityCents: portfolio.equityCents,
    currentPaperEquityCents: portfolio.equityCents,
    highWaterMarkCents: portfolio.highWaterMarkCents,
    drawdownBps: portfolio.currentDrawdownBps,
    realizedPaperPnlCents: portfolio.realizedPnlCents,
    unrealizedPaperPnlCents: portfolio.unrealizedPnlCents,
  }).onConflictDoUpdate({
    target: paperOperationsSessions.userId,
    set: { updatedAt: new Date() },
  }).returning();
  return session;
}
async function recordOperationsEvent(
  localUserId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  severity = "INFO",
) {
  await db.insert(operationsNotificationEvents).values({
    userId: localUserId, eventType, severity, payload,
  });
}
async function reserveAiResearchBudget(localUserId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-budget:${localUserId}`}))`);
    const [session] = await tx.select().from(paperOperationsSessions)
      .where(eq(paperOperationsSessions.userId, localUserId)).limit(1);
    if (!session) return false;
    const today = new Date().toISOString().slice(0, 10);
    const used = session.aiBudgetDate === today ? session.aiResearchCallsToday : 0;
    if (used >= session.dailyAiResearchCallBudget || session.maxAiReviewedCandidatesPerCycle < 1) return false;
    await tx.update(paperOperationsSessions).set({
      aiBudgetDate: today,
      aiResearchCallsToday: used + 1,
      aiResearchCount: sql`${paperOperationsSessions.aiResearchCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(paperOperationsSessions.id, session.id));
    return true;
  });
}
async function updateOperationsAfterRun(
  localUserId: string,
  run: typeof autonomousPaperRuns.$inferSelect,
  metrics: { marketDataRequests: number; rateLimitEvents: number },
) {
  const [portfolio] = await db.select().from(paperPortfolios)
    .where(eq(paperPortfolios.userId, localUserId)).limit(1);
  if (!portfolio) return;
  await ensureOperationsSession(localUserId);
  await db.update(paperOperationsSessions).set({
    currentPaperEquityCents: portfolio.equityCents,
    highWaterMarkCents: portfolio.highWaterMarkCents,
    drawdownBps: portfolio.currentDrawdownBps,
    realizedPaperPnlCents: portfolio.realizedPnlCents,
    unrealizedPaperPnlCents: portfolio.unrealizedPnlCents,
    paperTradeCount: sql`${paperOperationsSessions.paperTradeCount} + ${run.tradesTaken}`,
    noTradeCount: sql`${paperOperationsSessions.noTradeCount} + ${run.noTradeDecisions}`,
    candidateCount: sql`${paperOperationsSessions.candidateCount} + ${run.candidatesEvaluated}`,
    marketDataRequests: sql`${paperOperationsSessions.marketDataRequests} + ${metrics.marketDataRequests}`,
    rateLimitEvents: sql`${paperOperationsSessions.rateLimitEvents} + ${metrics.rateLimitEvents}`,
    successfulCycles: sql`${paperOperationsSessions.successfulCycles} + 1`,
    lastCycleAt: run.completedAt ?? new Date(),
    lastSuccessfulCycleAt: run.completedAt ?? new Date(),
    nextExpectedCycleAt: new Date(Date.now() + 60 * 60_000),
    cycleLeaseUntil: null,
    lastOutcome: run.outcome,
    lastErrorCode: null,
    updatedAt: new Date(),
  }).where(eq(paperOperationsSessions.userId, localUserId));
}
async function persistAutonomousRun(
  claimId: string | null,
  values: typeof autonomousPaperRuns.$inferInsert,
) {
  if (claimId) {
    const [updated] = await db.update(autonomousPaperRuns).set(values)
      .where(eq(autonomousPaperRuns.id, claimId)).returning();
    return updated;
  }
  const [created] = await db.insert(autonomousPaperRuns).values(values).returning();
  return created;
}
function userId(req: unknown) { return (req as AuthenticatedRequest).clerkUserId; }
function bad(res: Parameters<Parameters<IRouter["post"]>[1]>[1], error: string, status = 400) {
  res.status(status).json({ error });
}
function isRateLimitFailure(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { status?: unknown; message?: unknown };
  return value.status === 429 ||
    (typeof value.message === "string" && /rate.?limit|quota|429/i.test(value.message));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function cents(value: unknown, signed = false): value is number {
  return Number.isSafeInteger(value) && (signed || (value as number) >= 0);
}
function validAllocations(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  const allowed = new Set(["STOCK", "ETF", "CRYPTO"]);
  const entries = Object.entries(value);
  return entries.every(([key, amount]) => allowed.has(key) && typeof amount === "number" &&
    Number.isFinite(amount) && amount >= 0 && amount <= 1) &&
    entries.reduce((sum, [, amount]) => sum + Number(amount), 0) <= 1;
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
      marketData: { provider: health.provider, configured: health.configured, status: health.status,
        requestBudget: health.requestBudget ?? null },
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
    const provider = configuredProvider();
    const bars = await provider.getBars(await assetFromQuery(req), interval, size);
    // Persist provider facts separately from modeled PAPER execution costs.
    await db.insert(marketBars).values(bars.bars.map((bar) => ({
      provider: bars.provider, symbol: bars.asset.symbol, assetClass: bars.asset.assetClass,
      interval: bars.interval, timestamp: new Date(bar.timestamp), open: bar.open, high: bar.high,
      low: bar.low, close: bar.close, volume: bar.volume, retrievedAt: new Date(bars.retrievedAt),
      freshness: bars.freshness,
    }))).onConflictDoUpdate({
      target: [marketBars.provider, marketBars.symbol, marketBars.assetClass, marketBars.interval, marketBars.timestamp],
      set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`,
        close: sql`excluded.close`, volume: sql`excluded.volume`, retrievedAt: sql`excluded.retrieved_at`,
        freshness: sql`excluded.freshness` },
    });
    res.json(bars);
  } catch (error) { next(error); }
});

router.post("/economic-engine/paper/portfolio", async (req, res, next) => {
  try {
    if (!cents(req.body?.startingCapitalCents) || req.body.startingCapitalCents <= 0) return bad(res, "EXPLICIT_STARTING_CAPITAL_CENTS_REQUIRED");
    if (req.body?.allocations !== undefined && !validAllocations(req.body.allocations)) return bad(res, "INVALID_PAPER_ALLOCATIONS");
    if (req.body?.maxPaperRiskPerTradeBps !== undefined &&
      (!Number.isInteger(req.body.maxPaperRiskPerTradeBps) || req.body.maxPaperRiskPerTradeBps < 1 || req.body.maxPaperRiskPerTradeBps > 1_000)) {
      return bad(res, "INVALID_MAX_PAPER_RISK_PER_TRADE");
    }
    if (req.body?.dailyPaperLossLimitCents !== undefined &&
      (!cents(req.body.dailyPaperLossLimitCents))) return bad(res, "INVALID_DAILY_PAPER_LOSS_LIMIT");
    const user = await getLocalUser(userId(req));
    const [existing] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1);
    if (existing) return bad(res, "PAPER_PORTFOLIO_ALREADY_CONFIGURED", 409);
    const capital = req.body.startingCapitalCents;
    const [portfolio] = await db.insert(paperPortfolios).values({ userId: user.id, currency: "USD", startingCapitalCents: capital,
      cashCents: capital, equityCents: capital, highWaterMarkCents: capital,
      allocations: req.body.allocations ?? { STOCK: 0.5, ETF: 0.3, CRYPTO: 0.2 },
      maxPaperRiskPerTradeBps: req.body.maxPaperRiskPerTradeBps ?? 100,
      dailyPaperLossLimitCents: req.body.dailyPaperLossLimitCents ?? 0,
      status: "ACTIVE_PAPER" }).returning();
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
router.get("/economic-engine/paper/strategies/registry", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const rows = await db.select().from(strategyRegistryEntries)
      .where(eq(strategyRegistryEntries.userId, user.id)).orderBy(desc(strategyRegistryEntries.updatedAt));
    // Registry defaults are inspectable definitions, not authorization to trade.
    res.json({ mode: "PAPER_ONLY", entries: rows.length ? rows : INITIAL_STRATEGIES.map((definition) => ({
      strategyId: definition.id, strategyVersion: definition.version, definition,
      validationStage: definition.validationStage, activationState: "CHALLENGER", experimentState: "NONE",
    })) });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/strategies/health", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const performance = await db.select().from(strategyPerformances)
      .where(eq(strategyPerformances.userId, user.id)).orderBy(desc(strategyPerformances.measuredAt));
    res.json({ mode: "PAPER_ONLY", performance });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/decisions", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const rows = await db.select().from(strategyDecisionOutcomes)
      .where(eq(strategyDecisionOutcomes.userId, user.id)).orderBy(desc(strategyDecisionOutcomes.decidedAt)).limit(200);
    res.json({ mode: "PAPER_ONLY", decisions: rows });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/learning", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const [artifacts, reviews, valueEvents] = await Promise.all([
      db.select().from(learningArtifacts).where(eq(learningArtifacts.userId, user.id)).orderBy(desc(learningArtifacts.createdAt)).limit(200),
      db.select().from(learningReviews).where(eq(learningReviews.userId, user.id)).orderBy(desc(learningReviews.createdAt)).limit(100),
      db.select().from(researchValueEvents).where(eq(researchValueEvents.userId, user.id)).orderBy(desc(researchValueEvents.occurredAt)).limit(200),
    ]);
    res.json({ mode: "PAPER_ONLY", artifacts, reviews, researchValueEvents: valueEvents });
  } catch (error) { next(error); }
});
router.get("/economic-engine/paper/learning/:cadence", async (req, res, next) => {
  try {
    const cadence = req.params.cadence.toUpperCase();
    if (!["DAILY", "WEEKLY"].includes(cadence)) return bad(res, "INVALID_REVIEW_CADENCE");
    const user = await getLocalUser(userId(req));
    const rows = await db.select().from(learningReviews).where(and(
      eq(learningReviews.userId, user.id), eq(learningReviews.cadence, cadence),
    )).orderBy(desc(learningReviews.createdAt)).limit(100);
    res.json({ mode: "PAPER_ONLY", cadence, reviews: rows });
  } catch (error) { next(error); }
});
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
router.get("/economic-engine/paper/operations", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const session = await ensureOperationsSession(user.id);
    const notifications = await db.select().from(operationsNotificationEvents)
      .where(eq(operationsNotificationEvents.userId, user.id))
      .orderBy(desc(operationsNotificationEvents.occurredAt)).limit(20);
    res.json({ session, notifications, paperOnly: true, liveTradingEnabled: false });
  } catch (error) { next(error); }
});
router.patch("/economic-engine/paper/operations/budget", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const session = await ensureOperationsSession(user.id);
    if (!session) return bad(res, "PAPER_PORTFOLIO_NOT_CONFIGURED", 409);
    const dailyBudget = Math.trunc(Number(req.body?.dailyAiResearchCallBudget));
    const perCycle = Math.trunc(Number(req.body?.maxAiReviewedCandidatesPerCycle));
    if (!Number.isFinite(dailyBudget) || dailyBudget < 0 || dailyBudget > 100 ||
        !Number.isFinite(perCycle) || perCycle < 0 || perCycle > 5) {
      return bad(res, "INVALID_AI_BUDGET");
    }
    const [updated] = await db.update(paperOperationsSessions).set({
      dailyAiResearchCallBudget: dailyBudget,
      maxAiReviewedCandidatesPerCycle: perCycle,
      updatedAt: new Date(),
    }).where(eq(paperOperationsSessions.id, session.id)).returning();
    res.json(updated);
  } catch (error) { next(error); }
});
router.post("/economic-engine/paper/operations/:action", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const session = await ensureOperationsSession(user.id);
    if (!session) return bad(res, "PAPER_PORTFOLIO_NOT_CONFIGURED", 409);
    const action = String(req.params.action).toUpperCase();
    if (!["START", "PAUSE", "RESUME", "STOP", "KILL"].includes(action)) {
      return bad(res, "INVALID_OPERATIONS_ACTION");
    }
    const status = action === "START" || action === "RESUME"
      ? "RUNNING"
      : action === "PAUSE" ? "PAUSED" : action === "KILL" ? "KILLED" : "STOPPED";
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`paper-control:${user.id}`}))`);
      const [risk] = await tx.select().from(riskProfiles).where(eq(riskProfiles.userId, user.id)).limit(1);
      if ((action === "START" || action === "RESUME") && risk?.killSwitch) {
        throw new Error("KILL_SWITCH_ACTIVE");
      }
      if (action === "KILL") {
        await tx.insert(riskProfiles).values({
          userId: user.id, executionMode: "RESEARCH_ONLY", killSwitch: true,
        }).onConflictDoUpdate({
          target: riskProfiles.userId,
          set: { killSwitch: true, executionMode: "RESEARCH_ONLY", updatedAt: now },
        });
      }
      const [row] = await tx.update(paperOperationsSessions).set({
        status,
        ...(action === "START" ? { startedAt: now, stoppedAt: null } : {}),
        ...(action === "STOP" || action === "KILL" ? { stoppedAt: now } : {}),
        nextExpectedCycleAt: status === "RUNNING" ? now : null,
        cycleLeaseUntil: null,
        updatedAt: now,
      }).where(eq(paperOperationsSessions.id, session.id)).returning();
      await tx.insert(operationsNotificationEvents).values({
        userId: user.id,
        eventType: `PAPER_OPERATIONS_${action}`,
        severity: action === "KILL" ? "CRITICAL" : "INFO",
        payload: { status, mode: "PAPER" },
      });
      return row;
    });
    res.json({ session: updated, paperOnly: true, liveTradingEnabled: false });
  } catch (error) {
    if (error instanceof Error && error.message === "KILL_SWITCH_ACTIVE") {
      return bad(res, "KILL_SWITCH_ACTIVE", 409);
    }
    next(error);
  }
});
router.get("/economic-engine/paper/operations/health", async (req, res, next) => {
  try {
    const user = await getLocalUser(userId(req));
    const session = await ensureOperationsSession(user.id);
    const [risk, portfolio] = await Promise.all([
      db.select().from(riskProfiles).where(eq(riskProfiles.userId, user.id)).limit(1).then((rows) => rows[0]),
      db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, user.id)).limit(1).then((rows) => rows[0]),
    ]);
    const providerHealth = await configuredProvider().getProviderHealth();
    const openAI = runtime.openAIProvider().status();
    const grok = runtime.grokProvider().status();
    const costs = await db.select().from(projectEconomicEntries)
      .where(eq(projectEconomicEntries.userId, user.id));
    res.json({
      runtime: "ONLINE",
      scheduler: session?.status ?? "NOT_CONFIGURED",
      lastSuccessfulCycle: session?.lastSuccessfulCycleAt ?? null,
      nextExpectedCycle: session?.nextExpectedCycleAt ?? null,
      marketData: providerHealth,
      openAI: openAI.configured ? "AVAILABLE" : "UNAVAILABLE",
      grok: grok.configured ? "AVAILABLE" : "UNAVAILABLE",
      paperBroker: "PAPER_ONLY",
      learningEngine: "CONTROLLED_EVIDENCE_ONLY",
      database: "AVAILABLE",
      killSwitch: risk?.killSwitch ?? false,
      executionMode: risk?.executionMode ?? "RESEARCH_ONLY",
      liveTradingEnabled: false,
      portfolioConfigured: Boolean(portfolio),
      measuredDevelopmentCostCents: costs.filter((entry) =>
        entry.verified && entry.category === "REPLIT_DEVELOPMENT_COST")
        .reduce((sum, entry) => sum + entry.amountCents, 0),
      measuredOperatingCostCents: costs.filter((entry) =>
        entry.verified && entry.category !== "REPLIT_DEVELOPMENT_COST" &&
        (entry.category.endsWith("_COST") || entry.category === "OTHER_OPERATING_EXPENSE"))
        .reduce((sum, entry) => sum + entry.amountCents, 0),
      estimatedMonthlyRunRateCents: null,
    });
  } catch (error) { next(error); }
});
router.post("/economic-engine/paper/autonomous-cycle", async (req, res, next) => {
  let activeClaimId: string | null = null;
  let marketDataRequestsThisCycle = 0;
  let rateLimitEventsThisCycle = 0;
  try {
    const user = await getLocalUser(userId(req));
    const schedulerInvocation = Boolean(req.header("x-jarvis-scheduler-secret"));
    const session = await ensureOperationsSession(user.id);
    if (schedulerInvocation && session?.status !== "RUNNING") return bad(res, "PAPER_OPERATIONS_NOT_RUNNING", 409);
    const [riskProfile] = await db.select().from(riskProfiles).where(eq(riskProfiles.userId, user.id)).limit(1);
    if (riskProfile?.killSwitch) return bad(res, "KILL_SWITCH_ACTIVE", 409);
    const idempotencyKey = req.header("x-idempotency-key")?.trim().slice(0, 160) || null;
    let recoverableClaimId: string | null = null;
    if (idempotencyKey) {
      const [existingRun] = await db.select().from(autonomousPaperRuns).where(and(
        eq(autonomousPaperRuns.userId, user.id),
        eq(autonomousPaperRuns.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (existingRun) {
        if (existingRun.status === "COMPLETED") {
          return res.status(200).json({
            ...existingRun, replayed: true, mode: "PAPER", liveTradingEnabled: false,
          });
        }
        const stale = existingRun.startedAt.getTime() <= Date.now() - 20 * 60_000;
        if (existingRun.status === "RUNNING" && !stale) {
          return bad(res, "PAPER_CYCLE_ALREADY_RUNNING", 409);
        }
        recoverableClaimId = existingRun.id;
      }
    }
    const provider = configuredProvider(); const health = await provider.getProviderHealth();
    if (!health.configured) return bad(res, "MARKET_DATA_PROVIDER_NOT_CONFIGURED", 409);
    const [portfolio] = await db.select().from(paperPortfolios)
      .where(eq(paperPortfolios.userId, user.id)).limit(1);
    if (!portfolio) return bad(res, "PAPER_PORTFOLIO_NOT_CONFIGURED", 409);
    if (idempotencyKey) {
      if (recoverableClaimId) {
        const staleBefore = new Date(Date.now() - 20 * 60_000);
        const [recovered] = await db.update(autonomousPaperRuns).set({
          status: "RUNNING",
          outcome: "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: null,
          summary: { mode: "PAPER", source: "SCHEDULER", recovered: true },
        }).where(and(
          eq(autonomousPaperRuns.id, recoverableClaimId),
          or(
            eq(autonomousPaperRuns.status, "FAILED"),
            and(
              eq(autonomousPaperRuns.status, "RUNNING"),
              lte(autonomousPaperRuns.startedAt, staleBefore),
            ),
          ),
        )).returning();
        if (!recovered) return bad(res, "PAPER_CYCLE_ALREADY_RUNNING", 409);
        activeClaimId = recovered.id;
      } else {
        const [claim] = await db.insert(autonomousPaperRuns).values({
          userId: user.id,
          status: "RUNNING",
          outcome: "IN_PROGRESS",
          idempotencyKey,
          summary: { mode: "PAPER", source: "SCHEDULER" },
        }).onConflictDoNothing().returning();
        if (!claim) return bad(res, "PAPER_CYCLE_ALREADY_RUNNING", 409);
        activeClaimId = claim.id;
      }
    }
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const closedToday = await db.select().from(paperExecutions).where(and(
      eq(paperExecutions.userId, user.id), eq(paperExecutions.status, "FILLED"),
      gte(paperExecutions.updatedAt, todayStart),
    ));
    const dailyRealizedPnl = closedToday.reduce((total, execution) => total + (execution.netPnlCents ?? 0), 0) / 100;
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
          marketDataRequestsThisCycle += 1;
          const quote = await provider.getQuote(asset, { openPosition: true, priority: "HIGH" });
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
          if (isRateLimitFailure(error)) rateLimitEventsThisCycle += 1;
          markErrors.push({
            symbol: position.symbol,
            reason: isRateLimitFailure(error)
              ? "PROVIDER_LIMIT"
              : error instanceof Error ? error.message.slice(0, 120) : "POSITION_MARK_FAILED",
          });
        }
      }
      if (markErrors.length || !evaluated.length) {
        const run = await persistAutonomousRun(activeClaimId, {
          userId: user.id, status: "COMPLETED", outcome: "NO_TRADE", provider: "TWELVE_DATA",
          completedAt: new Date(), noTradeDecisions: 1, idempotencyKey,
          summary: { mode: "PAPER", reason: "COMPLETE_POSITION_MARKS_REQUIRED", markErrors },
        });
        await updateOperationsAfterRun(user.id, run, {
          marketDataRequests: marketDataRequestsThisCycle,
          rateLimitEvents: rateLimitEventsThisCycle,
        });
        return res.status(201).json({ ...run, mode: "PAPER", liveTradingEnabled: false });
      }
      const accounting = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`paper-control:${user.id}`}))`);
        const [control] = await tx.select().from(riskProfiles)
          .where(eq(riskProfiles.userId, user.id)).limit(1);
        if (control?.killSwitch) throw new Error("KILL_SWITCH_ACTIVE");
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
            const entryPrice = item.position.averageEntryCents / 100;
            const highestPrice = Number(item.position.metadata.highestPrice ?? entryPrice);
            await tx.update(strategyDecisionOutcomes).set({
              outcome: {
                mode: "PAPER",
                status: "CLOSED",
                netPnlCents,
                grossPnlCents,
                feesCents,
                slippageCents,
                exitReason: item.exitReason ?? "PAPER_EXIT",
                maximumFavorableExcursionBps: entryPrice > 0
                  ? Math.round((highestPrice - entryPrice) * 10_000 / entryPrice)
                  : 0,
                observedAdverseExcursionBps: entryPrice > 0
                  ? Math.min(0, Math.round((item.quotePrice - entryPrice) * 10_000 / entryPrice))
                  : 0,
              },
              outcomeAt: new Date(item.marketTimestamp),
            }).where(and(
              eq(strategyDecisionOutcomes.userId, user.id),
              eq(strategyDecisionOutcomes.strategyId, item.position.strategyId),
              eq(strategyDecisionOutcomes.strategyVersion, item.position.strategyVersion),
              eq(strategyDecisionOutcomes.symbol, item.position.symbol),
              eq(strategyDecisionOutcomes.decision, "TRADE"),
              isNull(strategyDecisionOutcomes.outcomeAt),
            ));
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
      const run = await persistAutonomousRun(activeClaimId, {
        userId: user.id,
        status: "COMPLETED",
        outcome: "NO_TRADE",
        provider: "TWELVE_DATA",
        completedAt: new Date(),
        noTradeDecisions: 1,
        idempotencyKey,
        summary: {
          mode: "PAPER",
          reason: accounting.exited.length ? "POSITIONS_EXITED" : "OPEN_POSITIONS_HELD",
          ...accounting,
          markErrors,
        },
      });
      await updateOperationsAfterRun(user.id, run, {
        marketDataRequests: marketDataRequestsThisCycle,
        rateLimitEvents: rateLimitEventsThisCycle,
      });
      return res.status(201).json({ ...run, mode: "PAPER", liveTradingEnabled: false });
    }
    /*
     * This is deliberately a tiny, inspectable universe. We request metadata, bars,
     * quotes, and volume from the configured provider. When provider bid/ask is absent,
     * PAPER execution may use the broker's separately labeled deterministic cost model;
     * those modeled costs are never stored as provider liquidity observations.
     */
    // Discovery is intentionally bounded.  Open positions above always consume the
    // high-priority path before this staggerable, crypto-only core universe.
    const requested = AUTONOMOUS_CRYPTO_CORE_UNIVERSE.map((symbol) => ({ symbol, assetClass: "CRYPTO" as const }));
    // Core is rotated by the CAS version, so a constrained provider budget cannot
    // repeatedly hammer the same cold universe.  Open positions returned earlier
    // always take precedence and use the provider's high-priority option.
    const scanLimit = 2;
    const scanStart = portfolio.cycleVersion % requested.length;
    const scheduled = Array.from({ length: scanLimit }, (_, index) =>
      requested[(scanStart + index) % requested.length]!);
    const deferred = requested.filter((item) => !scheduled.includes(item))
      .map((item) => ({ symbol: item.symbol, reason: "DEFERRED_REQUEST_BUDGET_ROTATION" }));
    const quality = new MarketDataQualityService();
    const universe = new TradingUniverse({ id: "manual-liquid-v1", name: "Manual liquid universe",
      // `requested` bounds discovery. Do not also require the provider's canonical
      // symbol to equal that request: providers legitimately normalize pairs/symbols.
      assetClasses: ["STOCK", "ETF", "CRYPTO"],
      liquidity: { minimumAverageDailyVolume: 1, minimumAverageDailyDollarVolume: 1, maximumSpreadBps: 100 } });
    const inspected: Array<{ symbol: string; reason: string }> = [];
    const candidates: Array<{ symbol: string; assetClass: "STOCK" | "ETF" | "CRYPTO"; referencePrice: number; strategyId: string; strategyVersion: string; score: number; dataTimestamp: string; stopPrice: number; targetPrice: number }> = [];
    const candidateFreshness = new Map<string, "LIVE_OR_CURRENT" | "DELAYED">();
    const objectiveQuality = new Map<string, Record<string, number>>();
    const oosPerformance: Array<{
      strategyId: string; strategyVersion: string; symbol: string; assetClass: string; regime: string;
      timeframe: string; measuredPeriod: string; sampleSize: number; tradeCount: number; wins: number;
      losses: number; netPnlCents: number; grossPnlCents: number; expectancyCents: number;
      winRate: number; averageWinnerCents: number; averageLoserCents: number; profitFactor: number | null;
      feesCents: number; slippageCents: number; maxDrawdownBps: number; averageHoldMs: number;
      riskAdjustedReturn: number | null; sampleStatus: string;
    }> = [];
    const researchAgreement = new Map<string, "STRONG_AGREEMENT" | "PARTIAL_AGREEMENT" | "MIXED" | "STRONG_DISAGREEMENT" | "INSUFFICIENT_INFORMATION">();
    let candidateExecution: {
      assetClass: "STOCK" | "ETF" | "CRYPTO";
      spreadBps: number;
      providerBidAskStatus: "AVAILABLE" | "BID_ASK_UNAVAILABLE";
      paperExecutionCost: "PROVIDER_BID_ASK_DERIVED" | "MODELED";
    } | null = null;
    const modeledSpreadBps = { STOCK: 2, ETF: 1, CRYPTO: 10 } as const;
    for (const item of scheduled) {
      try {
        marketDataRequestsThisCycle += 1;
        const rawAsset = await provider.getAssetMetadata(item.symbol, item.assetClass);
        marketDataRequestsThisCycle += 1;
        const bars = await provider.getBars(rawAsset, "1h", 200);
        marketDataRequestsThisCycle += 1;
        const quote = await provider.getQuote(rawAsset);
        await db.insert(marketBars).values(bars.bars.map((bar) => ({
          provider: bars.provider, symbol: rawAsset.symbol, assetClass: rawAsset.assetClass,
          interval: bars.interval, timestamp: new Date(bar.timestamp), open: bar.open, high: bar.high,
          low: bar.low, close: bar.close, volume: bar.volume, retrievedAt: new Date(bars.retrievedAt),
          freshness: bars.freshness,
        }))).onConflictDoUpdate({
          target: [marketBars.provider, marketBars.symbol, marketBars.assetClass, marketBars.interval, marketBars.timestamp],
          set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`,
            close: sql`excluded.close`, volume: sql`excluded.volume`, retrievedAt: sql`excluded.retrieved_at`,
            freshness: sql`excluded.freshness` },
        });
        await db.delete(marketBars).where(lt(marketBars.retrievedAt, marketBarRetentionCutoff()));
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
          // Costs are properties of the canonical asset returned by the provider,
          // not of the discovery request alias.
          : modeledSpreadBps[rawAsset.assetClass];
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
        const persistedPeerBars = asset.assetClass === "CRYPTO"
          ? await db.select().from(marketBars).where(and(
            eq(marketBars.provider, bars.provider),
            eq(marketBars.assetClass, "CRYPTO"),
            eq(marketBars.interval, bars.interval),
          )).orderBy(desc(marketBars.timestamp)).limit(2_500)
          : [];
        const peerBarsBySymbol = new Map<string, Array<(typeof bars.bars)[number]>>();
        for (const row of persistedPeerBars) {
          const peer = peerBarsBySymbol.get(row.symbol) ?? [];
          peer.push({
            timestamp: row.timestamp.toISOString(),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
          });
          peerBarsBySymbol.set(row.symbol, peer);
        }
        const relativeStrengthUniverse = [...peerBarsBySymbol.entries()].map(([symbol, peerBars]) => ({
          symbol,
          bars: peerBars.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)),
        }));
        const eligibleDefinitions = INITIAL_STRATEGIES.filter((definition) =>
          definition.assetClasses.includes(asset.assetClass) &&
          !["SECTOR_ROTATION", "CATALYST_NEWS"].includes(definition.family));
        const backtests = eligibleDefinitions.map((definition) => ({
          definition,
          result: new BacktestEngine({ startingCapital: portfolio.cashCents / 100, feePerOrder: 0,
            feeRate: 0.0005, slippageBps: 5, trainFraction: 0.7, minimumTrades: 5 })
            .run(bars.bars, createExecutableStrategy(definition, definition.family === "RELATIVE_STRENGTH"
              ? { relativeStrengthUniverse, relativeStrengthSymbol: asset.symbol }
              : {})),
        }));
        for (const tested of backtests) {
          const metrics = tested.result.outOfSample;
          const outOfSampleTrades = tested.result.trades.filter((trade) => trade.sample === "OUT_OF_SAMPLE");
          const regime = candidate.features.trend > 0.002 ? "TRENDING_UP"
            : candidate.features.trend < -0.002 ? "TRENDING_DOWN" : "RANGE_BOUND";
          oosPerformance.push({
            strategyId: tested.definition.id,
            strategyVersion: tested.definition.version,
            symbol: asset.symbol,
            assetClass: asset.assetClass,
            regime,
            timeframe: bars.interval,
            measuredPeriod: `${bars.bars.at(0)!.timestamp}/${bars.bars.at(-1)!.timestamp}`,
            sampleSize: metrics.tradeCount,
            tradeCount: metrics.tradeCount,
            wins: metrics.wins,
            losses: metrics.losses,
            netPnlCents: Number.isFinite(metrics.netReturn) ? Math.round(metrics.netReturn * 100) : 0,
            grossPnlCents: Number.isFinite(metrics.grossReturn) ? Math.round(metrics.grossReturn * 100) : 0,
            expectancyCents: Number.isFinite(metrics.expectancy) ? metrics.expectancy * 100 : 0,
            winRate: Number.isFinite(metrics.winRate) ? metrics.winRate : 0,
            averageWinnerCents: Number.isFinite(metrics.averageWinner) ? metrics.averageWinner * 100 : 0,
            averageLoserCents: Number.isFinite(metrics.averageLoser) ? metrics.averageLoser * 100 : 0,
            profitFactor: metrics.profitFactor !== null && Number.isFinite(metrics.profitFactor)
              ? metrics.profitFactor
              : null,
            feesCents: Number.isFinite(metrics.estimatedFees) ? Math.round(metrics.estimatedFees * 100) : 0,
            slippageCents: Number.isFinite(metrics.estimatedSlippage)
              ? Math.round(metrics.estimatedSlippage * 100)
              : 0,
            maxDrawdownBps: Number.isFinite(metrics.maxDrawdown)
              ? Math.round(metrics.maxDrawdown * 10_000)
              : 0,
            averageHoldMs: Number.isFinite(metrics.averageHoldingMs) ? metrics.averageHoldingMs : 0,
            riskAdjustedReturn: metrics.riskAdjustedReturn !== null && Number.isFinite(metrics.riskAdjustedReturn)
              ? metrics.riskAdjustedReturn
              : null,
            sampleStatus: metrics.sampleStatus,
          });
        }
        const selected = backtests.filter((item) => item.result.outOfSample.sampleStatus === "SUFFICIENT")
          .sort((a, b) => b.result.outOfSample.expectancy - a.result.outOfSample.expectancy ||
            a.definition.id.localeCompare(b.definition.id))[0];
        if (!selected) {
          inspected.push({ symbol: item.symbol, reason: "OUT_OF_SAMPLE_INSUFFICIENT" });
          continue;
        }
        const backtest = selected.result;
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
        if (candidate.score < 70) {
          inspected.push({ symbol: item.symbol, reason: "OBJECTIVE_STRATEGY_EVIDENCE_INSUFFICIENT" }); continue;
        }
        // At most one candidate is allowed into a manually triggered cycle.
        candidates.push({ symbol: asset.symbol, assetClass: asset.assetClass, referencePrice: quote.price,
          strategyId: selected.definition.id, strategyVersion: selected.definition.version, score: candidate.score, dataTimestamp: quote.marketTimestamp,
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
      } catch (error) {
        if (isRateLimitFailure(error)) rateLimitEventsThisCycle += 1;
        inspected.push({
          symbol: item.symbol,
          reason: isRateLimitFailure(error) ? "PROVIDER_LIMIT" : "DATA_UNAVAILABLE",
        });
      }
    }
    const gate = sharedResearchGate;
    let structuredResearch: Record<string, unknown> | null = null;
    let aiReviewedThisCycle = 0;
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
          if (aiReviewedThisCycle >= (session?.maxAiReviewedCandidatesPerCycle ?? 1)) {
            structuredResearch = { status: "AI_CYCLE_BUDGET_EXHAUSTED" };
            return { accepted: false, summary: "AI_BUDGET_EXHAUSTED" };
          }
          if (!await reserveAiResearchBudget(user.id)) {
            structuredResearch = { status: "AI_BUDGET_EXHAUSTED" };
            return { accepted: false, summary: "AI_BUDGET_EXHAUSTED" };
          }
          aiReviewedThisCycle += 1;
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
        const snapshot = paper.snapshot();
        const riskBudget = snapshot.equity * portfolio.maxPaperRiskPerTradeBps / 10_000;
        const unitRisk = Math.abs(candidate.referencePrice - (candidate.stopPrice ?? candidate.referencePrice));
        const quantity = Math.floor(Math.min(
          unitRisk > 0 ? riskBudget / unitRisk : 0,
          snapshot.cash * 0.2 / candidate.referencePrice,
        ));
        if (quantity <= 0) return { approved: false, quantity: 0, reason: "INSUFFICIENT_PAPER_RISK_BUDGET" };
        // This independent, server-side gate precedes survival/governor controls.
        // Zero daily limit explicitly means no dollar daily-loss cap.
        const intentSymbol = candidate.symbol.replace("/", "-");
        const noDailyLimit = portfolio.dailyPaperLossLimitCents === 0;
        const engine = RiskEngine.validate({
          symbol: intentSymbol, assetType: candidate.assetClass === "CRYPTO" ? "CRYPTO" : "EQUITY",
          side: "BUY", quantity, notional: quantity * candidate.referencePrice, orderType: "MARKET",
          stopPrice: candidate.stopPrice, timeInForce: "DAY", reason: "OBJECTIVE_PAPER_SIGNAL", confidence: 1,
        }, {
          equity: snapshot.equity, cash: snapshot.cash, dailyPnl: dailyRealizedPnl,
          openPositions: snapshot.positions.length, tradesToday: closedToday.length,
          totalExposure: snapshot.grossExposure, now: new Date(candidate.dataTimestamp),
        }, {
          maxPositionDollars: snapshot.equity * 0.2, maxPositionPercent: 0.2,
          maxRiskPerTradeDollars: riskBudget, maxRiskPerTradePercent: portfolio.maxPaperRiskPerTradeBps / 10_000,
          maxDailyLossDollars: noDailyLimit ? Number.MAX_SAFE_INTEGER : portfolio.dailyPaperLossLimitCents / 100,
          maxDailyLossPercent: noDailyLimit ? Number.MAX_VALUE : 1,
          maxOpenPositions: 20, maxTradesPerDay: 100, maxTotalExposure: snapshot.equity * 0.8,
          minimumCashReserve: portfolio.startingCapitalCents / 100 * 0.1,
          allowedAssetClasses: ["EQUITY", "CRYPTO"], allowedSymbols: [], blockedSymbols: [],
          allowedTradingHours: { startUtcHour: 0, endUtcHour: 24 }, requireStopLoss: true, killSwitch: false,
        });
        return engine.approved ? { approved: true, quantity } : {
          approved: false, quantity: 0, reason: `RISK_ENGINE:${engine.evaluations.find((item) => !item.passed)?.rule ?? "REJECTED"}`,
        };
      } },
      new CapitalGovernor({ allocations: {
        STOCK: portfolio.allocations.STOCK ?? 0.5, ETF: portfolio.allocations.ETF ?? 0.3,
        CRYPTO: portfolio.allocations.CRYPTO ?? 0.2,
      }, minimumCashReservePercent: 0.1,
        maxGrossExposurePercent: 0.8, maxPositionPercent: 0.2, maxStrategyPercent: 0.3,
        maxCorrelatedExposurePercent: 0.3, maxDrawdownPercent: 0.2, maxLosingStreak: 3, protectedProfitPercent: 0.5 }),
      broker, paper,
    );
    const result = await cycle.runCycle();
    const snapshot = paper.snapshot();
    await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`paper-control:${user.id}`}))`);
    const [control] = await tx.select().from(riskProfiles)
      .where(eq(riskProfiles.userId, user.id)).limit(1);
    if (control?.killSwitch) throw new Error("KILL_SWITCH_ACTIVE");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${portfolio.id}))`);
    for (const definition of INITIAL_STRATEGIES) {
      await tx.insert(strategyRegistryEntries).values({
        userId: user.id, strategyId: definition.id, strategyVersion: definition.version,
        definition: definition as unknown as Record<string, unknown>, validationStage: definition.validationStage,
        activationState: "CHALLENGER", experimentState: "NONE", updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [strategyRegistryEntries.userId, strategyRegistryEntries.strategyId, strategyRegistryEntries.strategyVersion],
        set: { definition: definition as unknown as Record<string, unknown>, updatedAt: new Date() },
      });
    }
    for (const performance of oosPerformance) {
      await tx.insert(strategyPerformances).values({
        userId: user.id, strategyId: performance.strategyId, strategyVersion: performance.strategyVersion,
        symbol: performance.symbol, assetClass: performance.assetClass, regime: performance.regime,
        timeframe: performance.timeframe, evaluationStage: "OOS", measuredPeriod: performance.measuredPeriod,
        mode: "PAPER", sampleSize: performance.sampleSize, tradeCount: performance.tradeCount,
        wins: performance.wins, losses: performance.losses, netPnlCents: performance.netPnlCents,
        grossPnlCents: performance.grossPnlCents, expectancyCents: performance.expectancyCents,
        winRate: performance.winRate, averageWinnerCents: performance.averageWinnerCents,
        averageLoserCents: performance.averageLoserCents, profitFactor: performance.profitFactor,
        feesCents: performance.feesCents, slippageCents: performance.slippageCents,
        maxDrawdownBps: performance.maxDrawdownBps, averageHoldMs: performance.averageHoldMs,
        riskAdjustedReturn: performance.riskAdjustedReturn, sampleStatus: performance.sampleStatus,
        measuredAt: new Date(),
      }).onConflictDoNothing();
    }
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
      const [researchRecord] = await db.insert(economicResearchRecords).values({
        userId: user.id, opportunityClass: "MARKET_PAPER_CANDIDATE", question: "Manual paper-cycle research",
        decision: "NO_TRADE", evidence: [structuredResearch], freshness: "CURRENT_CANDIDATE",
        uncertainty: "MODEL_OUTPUT_NOT_TRADE_AUTHORIZATION", assumptions: [], modelsUsed: ["OPENAI", "GROK"],
        dataUsed: ["TWELVE_DATA"],
      }).returning();
      await db.insert(researchValueEvents).values({
        userId: user.id, researchRecordId: researchRecord.id, costCents: null,
        baselineOutcomeCents: 0, researchedOutcomeCents: 0,
      });
    }
    const run = await persistAutonomousRun(activeClaimId, { userId: user.id, status: "COMPLETED",
      outcome: result.outcome, provider: "TWELVE_DATA", completedAt: new Date(), candidatesEvaluated: result.candidatesEvaluated,
      candidatesRejected: result.candidatesRejected, tradesTaken: result.tradesTaken, noTradeDecisions: result.noTradeDecisions,
      idempotencyKey,
      summary: { mode: "PAPER", inspected, deferred, rejectionReasons: result.rejectionReasons } });
    // A declined candidate is a first-class durable outcome.  The rationale is a
    // concise, inspectable reason code only; it never stores model reasoning.
    if (result.noTradeDecisions > 0) {
      const reasons = new Map(inspected.map((item) => [item.symbol, item.reason]));
      for (const item of scheduled) {
        const candidate = candidates.find((entry) => entry.symbol === item.symbol);
        await db.insert(strategyDecisionOutcomes).values({
          userId: user.id, runId: run.id, strategyId: candidate?.strategyId ?? "NO_EXECUTABLE_STRATEGY",
          strategyVersion: candidate?.strategyVersion ?? "NONE", symbol: item.symbol, assetClass: item.assetClass,
          decision: "NO_TRADE", reasonCode: reasons.get(item.symbol) ??
            Object.keys(result.rejectionReasons)[0] ?? "NO_ELIGIBLE_CANDIDATE",
          rationale: {
            mode: "PAPER",
            candidatesEvaluated: result.candidatesEvaluated,
            ...(candidate ? {
              referencePrice: candidate.referencePrice,
              observationInterval: "1h",
              dataTimestamp: candidate.dataTimestamp,
            } : {}),
          },
        });
      }
    } else {
      for (const candidate of candidates) {
        await db.insert(strategyDecisionOutcomes).values({
          userId: user.id, runId: run.id, strategyId: candidate.strategyId, strategyVersion: candidate.strategyVersion,
          symbol: candidate.symbol, assetClass: candidate.assetClass, decision: "TRADE", reasonCode: "PAPER_FILLED",
          rationale: { mode: "PAPER", score: candidate.score },
        });
      }
    }
    // Complete prior NO_TRADE observations only from later persisted provider bars.
    // The same-cycle bar is earlier than decidedAt and therefore cannot become an
    // outcome; this prevents circular scoring and future-data leakage.
    const pendingNoTrades = await db.select().from(strategyDecisionOutcomes).where(and(
      eq(strategyDecisionOutcomes.userId, user.id),
      eq(strategyDecisionOutcomes.decision, "NO_TRADE"),
      isNull(strategyDecisionOutcomes.outcomeAt),
    )).orderBy(desc(strategyDecisionOutcomes.decidedAt)).limit(100);
    for (const decision of pendingNoTrades) {
      const referencePrice = Number(decision.rationale.referencePrice);
      if (!Number.isFinite(referencePrice) || referencePrice <= 0) continue;
      const observations = await db.select().from(marketBars).where(and(
        eq(marketBars.symbol, decision.symbol),
        eq(marketBars.assetClass, decision.assetClass),
        gt(marketBars.timestamp, decision.decidedAt),
      )).orderBy(desc(marketBars.timestamp)).limit(168);
      if (!observations.length) continue;
      const closes = observations.map((bar) => bar.close);
      const latest = observations[0]!;
      await db.update(strategyDecisionOutcomes).set({
        outcome: {
          mode: "PAPER_OBSERVATION",
          status: "OBSERVED",
          hypotheticalReturnBps: Math.round((latest.close - referencePrice) * 10_000 / referencePrice),
          maximumAdverseExcursionBps: Math.round((Math.min(...closes) - referencePrice) * 10_000 / referencePrice),
          maximumFavorableExcursionBps: Math.round((Math.max(...closes) - referencePrice) * 10_000 / referencePrice),
          observationBars: observations.length,
        },
        outcomeAt: latest.timestamp,
      }).where(and(
        eq(strategyDecisionOutcomes.id, decision.id),
        eq(strategyDecisionOutcomes.userId, user.id),
        isNull(strategyDecisionOutcomes.outcomeAt),
      ));
    }

    // Learning and cadence reviews are derived from accumulated, user-owned
    // persisted evidence. They only emit immutable observations/hypotheses/proposals;
    // they never mutate risk controls, activation state, or trading authorization.
    const persistedPerformances = await db.select().from(strategyPerformances)
      .where(eq(strategyPerformances.userId, user.id))
      .orderBy(desc(strategyPerformances.measuredAt))
      .limit(1_000);
    const completedDecisions = await db.select().from(strategyDecisionOutcomes).where(and(
      eq(strategyDecisionOutcomes.userId, user.id),
      isNotNull(strategyDecisionOutcomes.outcomeAt),
    )).orderBy(desc(strategyDecisionOutcomes.outcomeAt)).limit(1_000);
    const learningByStrategy = new Map<string, ReturnType<JarvisLearningEngine["analyze"]>>();
    for (const definition of INITIAL_STRATEGIES) {
      const decisionOutcomes = completedDecisions
        .filter((decision) => decision.strategyId === definition.id && decision.strategyVersion === definition.version)
        .map((decision) => Number(decision.outcome?.netPnlCents ?? decision.outcome?.hypotheticalReturnBps))
        .filter(Number.isFinite);
      const performanceOutcomes = persistedPerformances
        .filter((performance) => performance.strategyId === definition.id &&
          performance.strategyVersion === definition.version)
        .map((performance) => performance.expectancyCents);
      const learning = new JarvisLearningEngine().analyze({
        strategyId: definition.id,
        strategyVersion: definition.version,
        recentOutcomes: [...decisionOutcomes, ...performanceOutcomes].slice(0, 250),
        minimumSample: 30,
      });
      learningByStrategy.set(`${definition.id}@${definition.version}`, learning);
      await db.insert(learningArtifacts).values({
        userId: user.id,
        strategyId: definition.id,
        strategyVersion: definition.version,
        kind: "PERSISTED_EVIDENCE_REVIEW",
        artifact: learning as unknown as Record<string, unknown>,
      });
    }
    const now = new Date();
    const dayPeriod = now.toISOString().slice(0, 10);
    const weekEndingDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekEndingDate.setUTCDate(weekEndingDate.getUTCDate() + ((7 - weekEndingDate.getUTCDay()) % 7));
    const weekPeriod = weekEndingDate.toISOString().slice(0, 10);
    const combinedLearning = {
      observations: [...learningByStrategy.values()].flatMap((learning) => [...learning.observations]),
      hypotheses: [...learningByStrategy.values()].flatMap((learning) => [...learning.hypotheses]),
      proposals: [...learningByStrategy.values()].flatMap((learning) => [...learning.proposals]),
    };
    const noTradeOutcomes = completedDecisions
      .filter((decision) => decision.decision === "NO_TRADE" &&
        Number.isFinite(Number(decision.outcome?.hypotheticalReturnBps)))
      .map((decision) => ({
        id: decision.id,
        reason: decision.reasonCode,
        hypotheticalReturn: Number(decision.outcome!.hypotheticalReturnBps) / 10_000,
        maximumAdverseExcursion: Number(decision.outcome!.maximumAdverseExcursionBps ?? 0) / 10_000,
      }));
    const dailyReview = new DailyLearningReview().build({
      date: dayPeriod,
      learning: combinedLearning,
      noTradeOutcomes,
    });
    await db.insert(learningReviews).values({
      userId: user.id,
      cadence: "DAILY",
      period: dayPeriod,
      review: dailyReview as unknown as Record<string, unknown>,
    }).onConflictDoUpdate({
      target: [learningReviews.userId, learningReviews.cadence, learningReviews.period],
      set: { review: dailyReview as unknown as Record<string, unknown>, createdAt: new Date() },
    });
    const weeklyStrategyReviews: Array<Record<string, unknown>> = [];
    for (const definition of INITIAL_STRATEGIES) {
      const performance = persistedPerformances.find((entry) =>
        entry.strategyId === definition.id && entry.strategyVersion === definition.version);
      if (!performance) continue;
      const learning = learningByStrategy.get(`${definition.id}@${definition.version}`)!;
      const weeklyReview = new WeeklyStrategyReview().build({
        weekEnding: weekPeriod,
        strategyId: definition.id,
        strategyVersion: definition.version,
        metrics: {
          tradeCount: performance.tradeCount,
          wins: performance.wins,
          losses: performance.losses,
          winRate: performance.winRate,
          averageWinner: performance.averageWinnerCents / 100,
          averageLoser: performance.averageLoserCents / 100,
          expectancy: performance.expectancyCents / 100,
          profitFactor: performance.profitFactor,
          grossReturn: performance.grossPnlCents / 100,
          netReturn: performance.netPnlCents / 100,
          maxDrawdown: performance.maxDrawdownBps / 10_000,
          averageHoldingMs: performance.averageHoldMs,
          estimatedFees: performance.feesCents / 100,
          estimatedSlippage: performance.slippageCents / 100,
          riskAdjustedReturn: performance.riskAdjustedReturn,
          sampleStatus: performance.sampleStatus === "SUFFICIENT"
            ? "SUFFICIENT"
            : "INSUFFICIENT_SAMPLE",
        },
        learning,
      });
      weeklyStrategyReviews.push(weeklyReview as unknown as Record<string, unknown>);
    }
    const weeklyReview = {
      period: weekPeriod,
      cadence: "WEEKLY",
      strategies: weeklyStrategyReviews,
    };
    await db.insert(learningReviews).values({
      userId: user.id,
      cadence: "WEEKLY",
      period: weekPeriod,
      review: weeklyReview,
    }).onConflictDoUpdate({
      target: [learningReviews.userId, learningReviews.cadence, learningReviews.period],
      set: { review: weeklyReview, createdAt: new Date() },
    });
    await updateOperationsAfterRun(user.id, run, {
      marketDataRequests: marketDataRequestsThisCycle,
      rateLimitEvents: rateLimitEventsThisCycle,
    });
    res.status(201).json({ ...run, mode: "PAPER", result, liveTradingEnabled: false });
  } catch (error) {
    if (activeClaimId) {
      await db.update(autonomousPaperRuns).set({
        status: "FAILED",
        outcome: "SYSTEM_ERROR",
        completedAt: new Date(),
        summary: {
          mode: "PAPER",
          retryable: true,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : "SYSTEM_ERROR",
        },
      }).where(eq(autonomousPaperRuns.id, activeClaimId)).catch(() => undefined);
    }
    if (error instanceof Error && error.message === "KILL_SWITCH_ACTIVE") {
      return bad(res, "KILL_SWITCH_ACTIVE", 409);
    }
    if (error instanceof Error && error.message === "PAPER_CYCLE_CONFLICT_RETRY") {
      return bad(res, "PAPER_CYCLE_CONFLICT_RETRY", 409);
    }
    next(error);
  }
});

export default router;