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
    cycleVersion: integer("cycle_version").notNull().default(0),
    status: text("status").notNull().default("ACTIVE_PAPER"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("paper_portfolios_user_id_idx").on(table.userId)],
);

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
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("autonomous_paper_runs_user_started_idx").on(table.userId, table.startedAt)],
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
export type EconomicResearchRecord = typeof economicResearchRecords.$inferSelect;