import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./jarvis";

export const projectEconomicEntries = pgTable(
  "project_economic_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    bucket: text("bucket").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    source: text("source").notNull().default("MANUAL"),
    verified: boolean("verified").notNull().default(false),
    description: text("description").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_economic_entries_user_bucket_idx").on(table.userId, table.bucket),
    index("project_economic_entries_user_occurred_idx").on(table.userId, table.occurredAt),
  ],
);

export const paperPortfolios = pgTable(
  "paper_portfolios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    startingCapitalCents: integer("starting_capital_cents").notNull(),
    cashCents: integer("cash_cents").notNull(),
    equityCents: integer("equity_cents").notNull(),
    realizedPnlCents: integer("realized_pnl_cents").notNull().default(0),
    unrealizedPnlCents: integer("unrealized_pnl_cents").notNull().default(0),
    highWaterMarkCents: integer("high_water_mark_cents").notNull(),
    currentDrawdownBps: integer("current_drawdown_bps").notNull().default(0),
    maxDrawdownBps: integer("max_drawdown_bps").notNull().default(0),
    allocations: jsonb("allocations").$type<Record<string, number>>().notNull().default({}),
    maxPaperRiskPerTradeBps: integer("max_paper_risk_per_trade_bps").notNull().default(100),
    dailyPaperLossLimitCents: integer("daily_paper_loss_limit_cents").notNull().default(0),
    cycleVersion: integer("cycle_version").notNull().default(0),
    status: text("status").notNull().default("ACTIVE_PAPER"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("paper_portfolios_user_id_idx").on(table.userId)],
);

/** Provider observations are shared facts, never modeled execution prices. */
export const marketBars = pgTable(
  "market_bars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    interval: text("interval").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    freshness: text("freshness").notNull(),
  },
  (table) => [
    uniqueIndex("market_bars_candle_key_idx").on(
      table.provider, table.symbol, table.assetClass, table.interval, table.timestamp,
    ),
    index("market_bars_retention_idx").on(table.retrievedAt),
    index("market_bars_lookup_idx").on(table.symbol, table.interval, table.timestamp),
  ],
);

/** Returns the oldest allowed retrieval time for bounded market-bar retention. */
export function marketBarRetentionCutoff(retentionDays = 90, now = new Date()): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error("VALID_MARKET_BAR_RETENTION_DAYS_REQUIRED");
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

export const paperPositions = pgTable(
  "paper_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    portfolioId: uuid("portfolio_id").references(() => paperPortfolios.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    averageEntryCents: integer("average_entry_cents").notNull(),
    currentPriceCents: integer("current_price_cents").notNull(),
    stopCents: integer("stop_cents"),
    targetCents: integer("target_cents"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    status: text("status").notNull().default("OPEN"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("paper_positions_user_status_idx").on(table.userId, table.status),
    index("paper_positions_portfolio_symbol_idx").on(table.portfolioId, table.symbol),
  ],
);

export const paperExecutions = pgTable(
  "paper_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    portfolioId: uuid("portfolio_id").references(() => paperPortfolios.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    orderIntent: jsonb("order_intent").$type<Record<string, unknown>>().notNull(),
    assetClass: text("asset_class").notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    status: text("status").notNull(),
    paperLabel: text("paper_label").notNull().default("PAPER"),
    requestedQuantity: doublePrecision("requested_quantity").notNull(),
    filledQuantity: doublePrecision("filled_quantity").notNull().default(0),
    averageFillCents: integer("average_fill_cents"),
    feesCents: integer("fees_cents").notNull().default(0),
    slippageCents: integer("slippage_cents").notNull().default(0),
    grossPnlCents: integer("gross_pnl_cents"),
    netPnlCents: integer("net_pnl_cents"),
    exitReason: text("exit_reason"),
    rejectionReasons: text("rejection_reasons").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("paper_executions_user_created_idx").on(table.userId, table.createdAt),
    index("paper_executions_user_strategy_idx").on(table.userId, table.strategyId),
  ],
);

export const autonomousPaperRuns = pgTable(
  "autonomous_paper_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    status: text("status").notNull(),
    outcome: text("outcome").notNull(),
    provider: text("provider"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    candidatesEvaluated: integer("candidates_evaluated").notNull().default(0),
    candidatesRejected: integer("candidates_rejected").notNull().default(0),
    tradesTaken: integer("trades_taken").notNull().default(0),
    noTradeDecisions: integer("no_trade_decisions").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("autonomous_paper_runs_user_started_idx").on(table.userId, table.startedAt),
    uniqueIndex("autonomous_paper_runs_user_idempotency_idx").on(table.userId, table.idempotencyKey),
  ],
);

export const paperOperationsSessions = pgTable(
  "paper_operations_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    status: text("status").notNull().default("STOPPED"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    startingPaperEquityCents: integer("starting_paper_equity_cents").notNull().default(0),
    currentPaperEquityCents: integer("current_paper_equity_cents").notNull().default(0),
    highWaterMarkCents: integer("high_water_mark_cents").notNull().default(0),
    drawdownBps: integer("drawdown_bps").notNull().default(0),
    realizedPaperPnlCents: integer("realized_paper_pnl_cents").notNull().default(0),
    unrealizedPaperPnlCents: integer("unrealized_paper_pnl_cents").notNull().default(0),
    paperTradeCount: integer("paper_trade_count").notNull().default(0),
    noTradeCount: integer("no_trade_count").notNull().default(0),
    candidateCount: integer("candidate_count").notNull().default(0),
    aiResearchCount: integer("ai_research_count").notNull().default(0),
    marketDataRequests: integer("market_data_requests").notNull().default(0),
    rateLimitEvents: integer("rate_limit_events").notNull().default(0),
    failedCycles: integer("failed_cycles").notNull().default(0),
    successfulCycles: integer("successful_cycles").notNull().default(0),
    dailyAiResearchCallBudget: integer("daily_ai_research_call_budget").notNull().default(4),
    maxAiReviewedCandidatesPerCycle: integer("max_ai_reviewed_candidates_per_cycle").notNull().default(1),
    aiResearchCallsToday: integer("ai_research_calls_today").notNull().default(0),
    aiBudgetDate: text("ai_budget_date"),
    lastCycleAt: timestamp("last_cycle_at", { withTimezone: true }),
    lastSuccessfulCycleAt: timestamp("last_successful_cycle_at", { withTimezone: true }),
    nextExpectedCycleAt: timestamp("next_expected_cycle_at", { withTimezone: true }),
    cycleLeaseUntil: timestamp("cycle_lease_until", { withTimezone: true }),
    lastOutcome: text("last_outcome"),
    lastErrorCode: text("last_error_code"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("paper_operations_sessions_user_idx").on(table.userId),
    index("paper_operations_sessions_due_idx").on(table.status, table.nextExpectedCycleAt),
  ],
);

export const operationsNotificationEvents = pgTable(
  "operations_notification_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull().default("INFO"),
    status: text("status").notNull().default("PENDING"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("operations_notifications_user_occurred_idx").on(table.userId, table.occurredAt),
    index("operations_notifications_status_idx").on(table.status, table.occurredAt),
  ],
);

export const strategyRegistryEntries = pgTable(
  "strategy_registry_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    validationStage: text("validation_stage").notNull(),
    activationState: text("activation_state").notNull(),
    experimentState: text("experiment_state").notNull().default("NONE"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("strategy_registry_user_version_idx").on(table.userId, table.strategyId, table.strategyVersion),
    index("strategy_registry_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const strategyPerformances = pgTable(
  "strategy_performances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    symbol: text("symbol").notNull().default("PORTFOLIO"),
    assetClass: text("asset_class").notNull(),
    regime: text("regime").notNull().default("UNKNOWN"),
    timeframe: text("timeframe").notNull().default("1h"),
    evaluationStage: text("evaluation_stage").notNull().default("OOS"),
    measuredPeriod: text("measured_period").notNull(),
    mode: text("mode").notNull().default("PAPER"),
    sampleSize: integer("sample_size").notNull().default(0), // compatibility summary
    tradeCount: integer("trade_count").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    netPnlCents: integer("net_pnl_cents").notNull().default(0),
    grossPnlCents: integer("gross_pnl_cents").notNull().default(0),
    expectancyCents: doublePrecision("expectancy_cents").notNull().default(0),
    winRate: doublePrecision("win_rate").notNull().default(0),
    averageWinnerCents: doublePrecision("average_winner_cents").notNull().default(0),
    averageLoserCents: doublePrecision("average_loser_cents").notNull().default(0),
    profitFactor: doublePrecision("profit_factor"),
    feesCents: integer("fees_cents").notNull().default(0),
    slippageCents: integer("slippage_cents").notNull().default(0),
    maxDrawdownBps: integer("max_drawdown_bps").notNull().default(0),
    averageHoldMs: doublePrecision("average_hold_ms").notNull().default(0),
    riskAdjustedReturn: doublePrecision("risk_adjusted_return"),
    sampleStatus: text("sample_status").notNull().default("INSUFFICIENT"),
    measuredAt: timestamp("measured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("strategy_performance_snapshot_idx").on(
      table.userId, table.strategyId, table.strategyVersion, table.symbol, table.assetClass,
      table.regime, table.timeframe, table.evaluationStage, table.measuredPeriod,
    ),
    index("strategy_performance_user_measured_idx").on(table.userId, table.measuredAt),
  ],
);

export const strategyDecisionOutcomes = pgTable(
  "strategy_decision_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    runId: uuid("run_id").references(() => autonomousPaperRuns.id, { onDelete: "set null" }),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    decision: text("decision").notNull(), // TRADE or NO_TRADE
    reasonCode: text("reason_code").notNull(),
    rationale: jsonb("rationale").$type<Record<string, string | number | boolean>>().notNull().default({}),
    outcome: jsonb("outcome").$type<Record<string, string | number | boolean>>(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
  },
  (table) => [
    index("strategy_decisions_user_decided_idx").on(table.userId, table.decidedAt),
    index("strategy_decisions_user_strategy_idx").on(table.userId, table.strategyId, table.strategyVersion),
  ],
);

export const learningArtifacts = pgTable(
  "learning_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    kind: text("kind").notNull(),
    artifact: jsonb("artifact").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("learning_artifacts_user_created_idx").on(table.userId, table.createdAt)],
);

export const learningReviews = pgTable(
  "learning_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    cadence: text("cadence").notNull(),
    period: text("period").notNull(),
    review: jsonb("review").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("learning_reviews_user_cadence_period_idx").on(table.userId, table.cadence, table.period)],
);

export const researchValueEvents = pgTable(
  "research_value_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    researchRecordId: uuid("research_record_id"),
    // Unknown provider billing is deliberately null, never represented as a made-up zero.
    costCents: integer("cost_cents"),
    baselineOutcomeCents: integer("baseline_outcome_cents").notNull().default(0),
    researchedOutcomeCents: integer("researched_outcome_cents").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("research_value_events_user_occurred_idx").on(table.userId, table.occurredAt)],
);

export const economicResearchRecords = pgTable(
  "economic_research_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    opportunityClass: text("opportunity_class").notNull(),
    question: text("question").notNull(),
    decision: text("decision").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull().default([]),
    freshness: text("freshness").notNull(),
    uncertainty: text("uncertainty").notNull(),
    assumptions: text("assumptions").array().notNull().default([]),
    modelsUsed: text("models_used").array().notNull().default([]),
    dataUsed: text("data_used").array().notNull().default([]),
    outcomeLater: jsonb("outcome_later").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("economic_research_records_user_class_idx").on(table.userId, table.opportunityClass)],
);

export const insertProjectEconomicEntrySchema = createInsertSchema(projectEconomicEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPaperPortfolioSchema = createInsertSchema(paperPortfolios).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPaperPositionSchema = createInsertSchema(paperPositions).omit({ id: true, updatedAt: true });
export const insertPaperExecutionSchema = createInsertSchema(paperExecutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectEconomicEntry = typeof projectEconomicEntries.$inferSelect;
export type PaperPortfolio = typeof paperPortfolios.$inferSelect;
export type PaperPosition = typeof paperPositions.$inferSelect;
export type PaperExecution = typeof paperExecutions.$inferSelect;
export type AutonomousPaperRun = typeof autonomousPaperRuns.$inferSelect;
export type PaperOperationsSession = typeof paperOperationsSessions.$inferSelect;
export type OperationsNotificationEvent = typeof operationsNotificationEvents.$inferSelect;
export type EconomicResearchRecord = typeof economicResearchRecords.$inferSelect;
export type MarketBar = typeof marketBars.$inferSelect;
export type StrategyRegistryEntry = typeof strategyRegistryEntries.$inferSelect;
export type StrategyPerformance = typeof strategyPerformances.$inferSelect;
export type StrategyDecisionOutcome = typeof strategyDecisionOutcomes.$inferSelect;
export type LearningArtifact = typeof learningArtifacts.$inferSelect;
export type LearningReview = typeof learningReviews.$inferSelect;
export type ResearchValueEvent = typeof researchValueEvents.$inferSelect;