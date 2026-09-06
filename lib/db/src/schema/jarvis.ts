import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  index,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const memoryCategory = pgEnum("memory_category", [
  "PROFILE",
  "PREFERENCE",
  "PROJECT",
  "WORK",
  "FINANCE",
  "MARKETS",
  "PERSONAL",
  "RESEARCH",
  "CAREER",
  "BUSINESS",
  "SOFTWARE",
  "AUTOMATIONS",
  "TEMPORARY",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  preferredName: text("preferred_name").notNull().default("Shane"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = pgTable(
  "user_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    assistantName: text("assistant_name").notNull().default("JARVIS"),
    aiProvider: text("ai_provider").notNull().default("openai"),
    aiModel: text("ai_model").notNull().default("gpt-5.6-terra"),
    intelligenceMode: text("intelligence_mode").notNull().default("SMART"),
    providerMode: text("provider_mode").notNull().default("AUTO"),
    currency: text("currency").notNull().default("USD"),
    briefingPreferences: jsonb("briefing_preferences").$type<Record<string, unknown>>().notNull().default({}),
    disabledMemoryCategories: text("disabled_memory_categories").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_settings_user_id_idx").on(table.userId)],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull().default("New conversation"),
  domain: text("domain").notNull().default("GENERAL"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  domain: text("domain"),
  toolActivity: jsonb("tool_activity").$type<Record<string, unknown>[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  category: memoryCategory("category").notNull(),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(3),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  project: text("project").notNull().default("Inbox"),
  completed: boolean("completed").notNull().default(false),
  priority: integer("priority").notNull().default(3),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const specialistRecords = pgTable(
  "specialist_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    specialist: text("specialist").notNull(),
    recordType: text("record_type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    source: text("source").notNull().default("MANUAL"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("specialist_records_user_specialist_idx").on(table.userId, table.specialist),
    index("specialist_records_user_type_idx").on(table.userId, table.recordType),
  ],
);

export const riskProfiles = pgTable(
  "risk_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    maxPositionDollars: doublePrecision("max_position_dollars").notNull().default(5000),
    maxPositionPercent: doublePrecision("max_position_percent").notNull().default(0.1),
    maxRiskPerTradeDollars: doublePrecision("max_risk_per_trade_dollars").notNull().default(200),
    maxRiskPerTradePercent: doublePrecision("max_risk_per_trade_percent").notNull().default(0.01),
    maxDailyLossDollars: doublePrecision("max_daily_loss_dollars").notNull().default(1000),
    maxDailyLossPercent: doublePrecision("max_daily_loss_percent").notNull().default(0.02),
    maxOpenPositions: integer("max_open_positions").notNull().default(10),
    maxTradesPerDay: integer("max_trades_per_day").notNull().default(10),
    maxTotalExposure: doublePrecision("max_total_exposure").notNull().default(50000),
    minimumCashReserve: doublePrecision("minimum_cash_reserve").notNull().default(5000),
    allowedAssetClasses: text("allowed_asset_classes").array().notNull().default(["EQUITY"]),
    allowedSymbols: text("allowed_symbols").array().notNull().default([]),
    blockedSymbols: text("blocked_symbols").array().notNull().default([]),
    requireStopLoss: boolean("require_stop_loss").notNull().default(true),
    executionMode: text("execution_mode").notNull().default("RESEARCH_ONLY"),
    killSwitch: boolean("kill_switch").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("risk_profiles_user_id_idx").on(table.userId)],
);

export const paperOrders = pgTable("paper_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  intent: jsonb("intent").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull(),
  rejectionReasons: text("rejection_reasons").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  domain: text("domain").notNull(),
  intelligenceMode: text("intelligence_mode").notNull(),
  providerMode: text("provider_mode").notNull(),
  providers: text("providers").array().notNull().default([]),
  models: text("models").array().notNull().default([]),
  contextCategories: text("context_categories").array().notNull().default([]),
  status: text("status").notNull().default("RUNNING"),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});