import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, riskProfiles, specialistRecords, users } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  SPECIALIST_DOMAINS,
  SPECIALIST_REGISTRY,
  createActionPlan,
  routeSpecialists,
  updateActionStepStatus,
  type ActionImpact,
  type ActionPlan,
  type ActionStatus,
  type SpecialistDomain,
} from "../services/specialists/registry";
import {
  billsDueInRange,
  cashAvailableAfterBills,
  incomeChangeScenario,
  monthlyBudgetSummary,
  projectSavingsGoal,
  weeklyBudgetSummary,
  type BudgetCategory,
  type ExpenseEntry,
  type FinancialAccount,
  type RecurringBill,
  type SavingsGoal,
} from "../services/specialists/finance";
import {
  CapitalGovernor,
  CapitalSurvivalEngine,
  CapitalSurvivalScore,
  MarketRegimeEngine,
  PaperStrategyLab,
  StrategyPerformanceTracker,
  TradeQualityEngine,
  TradingJournal,
  validateStrategyDefinition,
  validateStrategyTransition,
  type PaperTradeOutcome,
  type StrategyDefinition,
} from "../services/markets/engines";

const router: IRouter = Router();
router.use(requireAuth);

const RECORD_TYPES: Readonly<Record<SpecialistDomain, readonly string[]>> = {
  GENERAL: ["ACTION_PLAN"],
  FINANCE: [
    "FINANCIAL_ACCOUNT",
    "INCOME_SOURCE",
    "RECURRING_BILL",
    "DEBT",
    "SAVINGS_GOAL",
    "EXPENSE_ENTRY",
    "BUDGET_CATEGORY",
    "CASH_FLOW_PROJECTION",
  ],
  RESEARCH: ["RESEARCH_RESULT"],
  CAREER: ["CAREER_PROFILE", "RESUME", "JOB_APPLICATION", "INTERVIEW_PREP"],
  WORK: ["WORK_DOCUMENT", "WORK_PROJECT"],
  BUSINESS: [
    "BUSINESS_PROJECT",
    "BUSINESS_MODEL",
    "OFFER",
    "CUSTOMER_SEGMENT",
    "PRICING_PLAN",
    "STARTUP_BUDGET",
    "REVENUE_MODEL",
    "MARKETING_CHANNEL",
    "SOP",
    "KPI",
    "BUSINESS_TASK",
    "BUSINESS_RISK",
  ],
  SOFTWARE: [
    "SOFTWARE_PROJECT",
    "REQUIREMENT",
    "FEATURE",
    "USER_STORY",
    "ARCHITECTURE_DECISION",
    "DATA_MODEL",
    "API_CONTRACT",
    "SOFTWARE_TASK",
    "TEST_CASE",
    "BUG",
    "RELEASE",
  ],
  MARKETS: ["STRATEGY_DEFINITION", "PAPER_TRADE_OUTCOME", "TRADING_JOURNAL_ENTRY"],
  PERSONAL: ["PERSONAL_PLAN"],
  AUTOMATIONS: ["AUTOMATION_PREPARATION"],
};

const ACTION_STATUSES = new Set<ActionStatus>([
  "PLANNED",
  "READY",
  "REQUIRES_USER",
  "AUTHORIZED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

function isSpecialistDomain(value: unknown): value is SpecialistDomain {
  return typeof value === "string" && SPECIALIST_DOMAINS.includes(value as SpecialistDomain);
}

function isRecordType(specialist: SpecialistDomain, value: unknown): value is string {
  return typeof value === "string" && RECORD_TYPES[specialist].includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsProhibitedReasoning(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedReasoning);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    ["chainofthought", "chain_of_thought", "internalreasoning", "hiddenreasoning"].includes(key.toLowerCase()) ||
    containsProhibitedReasoning(nested));
}

function requireText(data: Record<string, unknown>, field: string) {
  if (typeof data[field] !== "string" || !data[field].trim()) {
    throw new TypeError(`${field} is required`);
  }
}

function requireBoolean(data: Record<string, unknown>, field: string) {
  if (typeof data[field] !== "boolean") throw new TypeError(`${field} must be boolean`);
}

function requireEnum(data: Record<string, unknown>, field: string, allowed: readonly string[]) {
  if (typeof data[field] !== "string" || !allowed.includes(data[field])) {
    throw new TypeError(`${field} must be one of ${allowed.join(", ")}`);
  }
}

function requireIsoDate(data: Record<string, unknown>, field: string, optional = false) {
  const value = data[field];
  if (value === undefined && optional) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid calendar date`);
  }
}

function requireCents(
  data: Record<string, unknown>,
  field: string,
  options: { optional?: boolean; signed?: boolean } = {},
) {
  const value = data[field];
  if (value === undefined && options.optional) return;
  if (!Number.isSafeInteger(value) || (!options.signed && (value as number) < 0)) {
    throw new TypeError(`${field} must be a safe${options.signed ? "" : " non-negative"} integer number of USD cents`);
  }
}

export function validateFinanceRecord(recordType: string, candidate: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...candidate, source: "MANUAL" };
  switch (recordType) {
    case "FINANCIAL_ACCOUNT":
      requireText(data, "name");
      requireEnum(data, "type", ["CHECKING", "SAVINGS", "CASH", "CREDIT", "OTHER"]);
      requireEnum(data, "currency", ["USD"]);
      requireCents(data, "balanceCents", { optional: true, signed: true });
      requireIsoDate(data, "balanceAsOf", true);
      break;
    case "INCOME_SOURCE":
      requireText(data, "name");
      requireCents(data, "amountCents", { optional: true });
      requireEnum(data, "frequency", ["WEEKLY", "BIWEEKLY", "MONTHLY", "ANNUAL"]);
      requireBoolean(data, "active");
      break;
    case "RECURRING_BILL":
      requireText(data, "name");
      requireCents(data, "amountCents", { optional: true });
      requireIsoDate(data, "nextDueDate");
      requireEnum(data, "frequency", ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]);
      requireBoolean(data, "active");
      break;
    case "DEBT":
      requireText(data, "name");
      requireCents(data, "balanceCents", { optional: true });
      requireCents(data, "minimumPaymentCents", { optional: true });
      requireCents(data, "annualPercentageRateBasisPoints", { optional: true });
      break;
    case "SAVINGS_GOAL":
      requireText(data, "name");
      requireCents(data, "targetAmountCents", { optional: true });
      requireCents(data, "currentAmountCents", { optional: true });
      requireCents(data, "monthlyContributionCents", { optional: true });
      requireIsoDate(data, "targetDate", true);
      break;
    case "EXPENSE_ENTRY":
      requireText(data, "categoryId");
      requireText(data, "description");
      requireCents(data, "amountCents", { optional: true });
      requireIsoDate(data, "occurredOn");
      break;
    case "BUDGET_CATEGORY":
      requireText(data, "name");
      requireCents(data, "limitCents", { optional: true });
      requireEnum(data, "period", ["WEEKLY", "MONTHLY"]);
      break;
    case "CASH_FLOW_PROJECTION":
      requireIsoDate(data, "asOfDate");
      requireIsoDate(data, "throughDate");
      requireCents(data, "openingCashCents", { signed: true });
      requireCents(data, "expectedIncomeCents");
      requireCents(data, "expectedBillsCents");
      requireCents(data, "projectedCashCents", { signed: true });
      if (!Array.isArray(data["sourceAccountIds"]) ||
          data["sourceAccountIds"].some((id: unknown) => typeof id !== "string" || !id)) {
        throw new TypeError("sourceAccountIds must be a string array");
      }
      break;
    default:
      throw new TypeError("Unsupported finance record type");
  }
  return data;
}

function validatePaperOutcome(candidate: Record<string, unknown>): PaperTradeOutcome {
  const outcome = {
    strategyId: candidate.strategyId,
    tradeId: candidate.tradeId,
    openedAt: candidate.openedAt,
    closedAt: candidate.closedAt,
    pnl: candidate.pnl,
    returnPercent: candidate.returnPercent,
    mode: candidate.mode,
  } as PaperTradeOutcome;
  new StrategyPerformanceTracker().recordOutcome(outcome);
  return outcome;
}

export function validateRecordData(
  specialist: SpecialistDomain,
  recordType: string,
  candidate: Record<string, unknown>,
) {
  if (specialist === "FINANCE") return validateFinanceRecord(recordType, candidate);
  if (specialist === "MARKETS" && recordType === "STRATEGY_DEFINITION") {
    const strategy = validateStrategyDefinition(candidate);
    if (strategy.validationStage === "LIMITED_LIVE" || strategy.validationStage === "SCALED") {
      throw new TypeError("LIVE_VALIDATION_NOT_AUTHORIZED");
    }
    return strategy as unknown as Record<string, unknown>;
  }
  if (specialist === "MARKETS" && recordType === "PAPER_TRADE_OUTCOME") {
    return validatePaperOutcome(candidate) as unknown as Record<string, unknown>;
  }
  if (specialist === "MARKETS" && recordType === "TRADING_JOURNAL_ENTRY") {
    return new TradingJournal().record(candidate as never) as unknown as Record<string, unknown>;
  }
  return candidate;
}

async function getLocalUser(clerkUserId: string) {
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  if (created) return created;
  const [concurrent] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!concurrent) throw new Error("LOCAL_USER_PROVISIONING_FAILED");
  return concurrent;
}

function clerkUserId(req: unknown) {
  return (req as AuthenticatedRequest).clerkUserId;
}

function recordData<T>(record: typeof specialistRecords.$inferSelect): T {
  return {
    ...record.data,
    id: record.id,
    source: record.source,
  } as T;
}

function safeTitle(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
}

function badRequest(res: Parameters<Parameters<IRouter["post"]>[1]>[1], error: string) {
  res.status(400).json({ error });
}

router.get("/specialists/registry", (_req, res) => {
  res.json({
    identity: "JARVIS",
    specialists: SPECIALIST_DOMAINS.map((id) => SPECIALIST_REGISTRY[id]),
  });
});

router.post("/specialists/route", (req, res) => {
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request) {
    badRequest(res, "REQUEST_REQUIRED");
    return;
  }
  res.json(routeSpecialists(request));
});

router.get("/specialists/status", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.userId, user.id));
    const counts = Object.fromEntries(SPECIALIST_DOMAINS.map((domain) => [
      domain,
      records.filter((record) => record.specialist === domain).length,
    ]));
    res.json({
      identity: "JARVIS",
      counts,
      totalRecords: records.length,
      financeDataStatus: counts.FINANCE > 0 ? "MANUAL_DATA" : "NO_DATA",
      marketsMode: "RESEARCH_ONLY",
      externalActions: "NOT_CONNECTED",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/specialists/:specialist/records", async (req, res, next) => {
  try {
    const specialist = req.params.specialist.toUpperCase();
    if (!isSpecialistDomain(specialist)) {
      badRequest(res, "INVALID_SPECIALIST");
      return;
    }
    const user = await getLocalUser(clerkUserId(req));
    const rows = await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.userId, user.id))
      .orderBy(desc(specialistRecords.updatedAt));
    const requestedType = typeof req.query.type === "string" ? req.query.type.toUpperCase() : null;
    res.json(rows.filter((row) =>
      row.specialist === specialist && (!requestedType || row.recordType === requestedType)));
  } catch (error) {
    next(error);
  }
});

router.post("/specialists/:specialist/records", async (req, res, next) => {
  try {
    const specialist = req.params.specialist.toUpperCase();
    if (!isSpecialistDomain(specialist)) {
      badRequest(res, "INVALID_SPECIALIST");
      return;
    }
    const recordType = typeof req.body?.recordType === "string" ? req.body.recordType.toUpperCase() : "";
    if (!isRecordType(specialist, recordType)) {
      badRequest(res, "INVALID_RECORD_TYPE");
      return;
    }
    if (specialist === "GENERAL" && recordType === "ACTION_PLAN") {
      res.status(409).json({ error: "USE_ACTION_PLAN_ENDPOINT" });
      return;
    }
    if (!isPlainObject(req.body?.data) || containsProhibitedReasoning(req.body.data)) {
      badRequest(res, "INVALID_RECORD_DATA");
      return;
    }
    let data: Record<string, unknown>;
    try {
      data = validateRecordData(specialist, recordType, req.body.data);
    } catch (error) {
      badRequest(res, error instanceof Error ? error.message : "INVALID_RECORD_DATA");
      return;
    }
    const user = await getLocalUser(clerkUserId(req));
    const [record] = await db.insert(specialistRecords).values({
      userId: user.id,
      specialist,
      recordType,
      title: safeTitle(req.body?.title, recordType.replaceAll("_", " ")),
      status: typeof req.body?.status === "string" ? req.body.status.slice(0, 40) : "ACTIVE",
      source: "MANUAL",
      data,
    }).returning();
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.patch("/specialists/:specialist/records/:id", async (req, res, next) => {
  try {
    const specialist = req.params.specialist.toUpperCase();
    if (!isSpecialistDomain(specialist)) {
      badRequest(res, "INVALID_SPECIALIST");
      return;
    }
    if (req.body?.data !== undefined &&
        (!isPlainObject(req.body.data) || containsProhibitedReasoning(req.body.data))) {
      badRequest(res, "INVALID_RECORD_DATA");
      return;
    }
    const user = await getLocalUser(clerkUserId(req));
    const [existing] = await db
      .select()
      .from(specialistRecords)
      .where(and(
        eq(specialistRecords.id, req.params.id),
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.specialist, specialist),
      ))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "SPECIALIST_RECORD_NOT_FOUND" });
      return;
    }
    if (existing.recordType === "ACTION_PLAN") {
      res.status(409).json({ error: "USE_ACTION_PLAN_STEP_ENDPOINT" });
      return;
    }
    let data: Record<string, unknown>;
    try {
      data = validateRecordData(specialist, existing.recordType, req.body?.data ?? existing.data);
    } catch (error) {
      badRequest(res, error instanceof Error ? error.message : "INVALID_RECORD_DATA");
      return;
    }
    const [record] = await db
      .update(specialistRecords)
      .set({
        title: req.body?.title === undefined ? existing.title : safeTitle(req.body.title, existing.title),
        status: typeof req.body?.status === "string" ? req.body.status.slice(0, 40) : existing.status,
        data,
        updatedAt: new Date(),
      })
      .where(eq(specialistRecords.id, existing.id))
      .returning();
    res.json(record);
  } catch (error) {
    next(error);
  }
});

router.delete("/specialists/:specialist/records/:id", async (req, res, next) => {
  try {
    const specialist = req.params.specialist.toUpperCase();
    if (!isSpecialistDomain(specialist)) {
      badRequest(res, "INVALID_SPECIALIST");
      return;
    }
    const user = await getLocalUser(clerkUserId(req));
    const [removed] = await db
      .delete(specialistRecords)
      .where(and(
        eq(specialistRecords.id, req.params.id),
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.specialist, specialist),
      ))
      .returning();
    if (!removed) {
      res.status(404).json({ error: "SPECIALIST_RECORD_NOT_FOUND" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/finance/summary", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = (await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.userId, user.id)))
      .filter((record) => record.specialist === "FINANCE");
    const accounts = records.filter((record) => record.recordType === "FINANCIAL_ACCOUNT").map(recordData<FinancialAccount>);
    const bills = records.filter((record) => record.recordType === "RECURRING_BILL").map(recordData<RecurringBill>);
    const categories = records.filter((record) => record.recordType === "BUDGET_CATEGORY").map(recordData<BudgetCategory>);
    const expenses = records.filter((record) => record.recordType === "EXPENSE_ENTRY").map(recordData<ExpenseEntry>);
    const goals = records.filter((record) => record.recordType === "SAVINGS_GOAL").map(recordData<SavingsGoal>);
    const today = new Date().toISOString().slice(0, 10);
    const oneWeek = new Date(`${today}T00:00:00.000Z`);
    oneWeek.setUTCDate(oneWeek.getUTCDate() + 7);
    const startDate = typeof req.query.start === "string" ? req.query.start : today;
    const endDate = typeof req.query.end === "string" ? req.query.end : oneWeek.toISOString().slice(0, 10);
    const month = typeof req.query.month === "string" ? req.query.month : today.slice(0, 7);
    const billsDue = billsDueInRange({ bills: bills.length ? bills : undefined, startDate, endDate });
    const monthlyBudget = monthlyBudgetSummary({
      month,
      categories: categories.length ? categories : undefined,
      expenses: expenses.length ? expenses : undefined,
    });
    const cashAfterBills = cashAvailableAfterBills({
      accounts: accounts.length ? accounts : undefined,
      bills: bills.length ? bills : undefined,
      startDate,
      endDate,
    });
    res.json({
      connectionStatus: "NOT_CONNECTED",
      dataStatus: records.length ? "MANUAL_DATA" : "NO_DATA",
      source: records.length ? "MANUAL" : null,
      counts: Object.fromEntries(RECORD_TYPES.FINANCE.map((type) => [
        type,
        records.filter((record) => record.recordType === type).length,
      ])),
      metrics: {
        totalCashCents: cashAfterBills.status === "OK" ? cashAfterBills.value.openingCashCents : null,
        monthlyBudgetCents: monthlyBudget.status === "OK" ? monthlyBudget.value.totalLimitCents : null,
        billsDueCents: billsDue.status === "OK"
          ? billsDue.value.reduce((total, bill) => total + bill.amountCents, 0)
          : null,
        cashAfterBillsCents: cashAfterBills.status === "OK" ? cashAfterBills.value.projectedCashCents : null,
      },
      billsDue,
      monthlyBudget,
      cashAfterBills,
      savingsGoals: goals.map((goal) => projectSavingsGoal({ goal, asOfDate: today })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/finance/bills-due", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const bills = (await db
      .select()
      .from(specialistRecords)
      .where(and(
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.specialist, "FINANCE"),
        eq(specialistRecords.recordType, "RECURRING_BILL"),
      ))).map(recordData<RecurringBill>);
    const startDate = typeof req.query.start === "string" ? req.query.start : "";
    const endDate = typeof req.query.end === "string" ? req.query.end : "";
    if (!startDate || !endDate) {
      badRequest(res, "START_AND_END_DATES_REQUIRED");
      return;
    }
    res.json({ source: bills.length ? "MANUAL" : null, result: billsDueInRange({ bills: bills.length ? bills : undefined, startDate, endDate }) });
  } catch (error) {
    next(error);
  }
});

router.get("/finance/budget", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = (await db
      .select()
      .from(specialistRecords)
      .where(and(eq(specialistRecords.userId, user.id), eq(specialistRecords.specialist, "FINANCE"))));
    const categories = records
      .filter((record) => record.recordType === "BUDGET_CATEGORY")
      .map(recordData<BudgetCategory>);
    const expenses = records
      .filter((record) => record.recordType === "EXPENSE_ENTRY")
      .map(recordData<ExpenseEntry>);
    const result = req.query.period === "WEEKLY"
      ? weeklyBudgetSummary({
          weekStart: typeof req.query.start === "string" ? req.query.start : "",
          categories: categories.length ? categories : undefined,
          expenses: expenses.length ? expenses : undefined,
        })
      : monthlyBudgetSummary({
          month: typeof req.query.month === "string" ? req.query.month : "",
          categories: categories.length ? categories : undefined,
          expenses: expenses.length ? expenses : undefined,
        });
    res.json({ source: records.length ? "MANUAL" : null, result });
  } catch (error) {
    next(error);
  }
});

router.get("/finance/cash-available", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = (await db
      .select()
      .from(specialistRecords)
      .where(and(eq(specialistRecords.userId, user.id), eq(specialistRecords.specialist, "FINANCE"))));
    const accounts = records
      .filter((record) => record.recordType === "FINANCIAL_ACCOUNT")
      .map(recordData<FinancialAccount>);
    const bills = records
      .filter((record) => record.recordType === "RECURRING_BILL")
      .map(recordData<RecurringBill>);
    const startDate = typeof req.query.start === "string" ? req.query.start : "";
    const endDate = typeof req.query.end === "string" ? req.query.end : "";
    if (!startDate || !endDate) {
      badRequest(res, "START_AND_END_DATES_REQUIRED");
      return;
    }
    res.json({
      source: records.length ? "MANUAL" : null,
      result: cashAvailableAfterBills({
        accounts: accounts.length ? accounts : undefined,
        bills: bills.length ? bills : undefined,
        startDate,
        endDate,
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/finance/savings-goals/:id/projection", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const [record] = await db
      .select()
      .from(specialistRecords)
      .where(and(
        eq(specialistRecords.id, req.params.id),
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.specialist, "FINANCE"),
        eq(specialistRecords.recordType, "SAVINGS_GOAL"),
      ))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "SAVINGS_GOAL_NOT_FOUND" });
      return;
    }
    const asOfDate = typeof req.query.asOf === "string" ? req.query.asOf : new Date().toISOString().slice(0, 10);
    res.json({ source: "MANUAL", result: projectSavingsGoal({ goal: recordData<SavingsGoal>(record), asOfDate }) });
  } catch (error) {
    next(error);
  }
});

router.post("/finance/income-scenario", (req, res, next) => {
  try {
    res.json({
      source: "USER_SCENARIO",
      result: incomeChangeScenario({
        baselineMonthlyIncomeCents: req.body?.baselineMonthlyIncomeCents,
        monthlyOutflowCents: req.body?.monthlyOutflowCents,
        scenarioMonthlyIncomeCents: req.body?.scenarioMonthlyIncomeCents,
        changeBasisPoints: req.body?.changeBasisPoints,
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/action-plans", async (req, res, next) => {
  try {
    const goal = typeof req.body?.goal === "string" ? req.body.goal.trim() : "";
    if (!goal || !Array.isArray(req.body?.steps) || req.body.steps.length === 0) {
      badRequest(res, "GOAL_AND_STEPS_REQUIRED");
      return;
    }
    const route = routeSpecialists(goal);
    const plan = createActionPlan({
      id: randomUUID(),
      goal,
      steps: req.body.steps.slice(0, 50).map((step: Record<string, unknown>) => {
        const specialist = isSpecialistDomain(step.specialist) ? step.specialist : route.primary;
        const impact: ActionImpact = step.impact === "HIGH" || step.impact === "MEDIUM" ? step.impact : "LOW";
        return {
          id: randomUUID(),
          specialist,
          description: safeTitle(step.description, "Untitled action"),
          impact,
          requiresUser: step.requiresUser === true,
          requiresTool: step.requiresTool !== false,
        };
      }),
      dependencies: Array.isArray(req.body.dependencies) ? req.body.dependencies : [],
    });
    const user = await getLocalUser(clerkUserId(req));
    const [record] = await db.insert(specialistRecords).values({
      userId: user.id,
      specialist: "GENERAL",
      recordType: "ACTION_PLAN",
      title: goal.slice(0, 160),
      status: plan.status,
      source: "MANUAL",
      data: plan as unknown as Record<string, unknown>,
    }).returning();
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.patch("/action-plans/:id/steps/:stepId", async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!ACTION_STATUSES.has(status)) {
      badRequest(res, "INVALID_ACTION_STATUS");
      return;
    }
    if (status === "COMPLETED") {
      res.status(409).json({ error: "TOOL_CONFIRMATION_UNAVAILABLE" });
      return;
    }
    const user = await getLocalUser(clerkUserId(req));
    const [record] = await db
      .select()
      .from(specialistRecords)
      .where(and(
        eq(specialistRecords.id, req.params.id),
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.recordType, "ACTION_PLAN"),
      ))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "ACTION_PLAN_NOT_FOUND" });
      return;
    }
    const plan = updateActionStepStatus(record.data as unknown as ActionPlan, req.params.stepId, {
      status,
      userConfirmed: req.body?.userConfirmed === true,
      error: typeof req.body?.error === "string" ? req.body.error.slice(0, 240) : undefined,
    });
    const [updated] = await db
      .update(specialistRecords)
      .set({ status: plan.status, data: plan as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(specialistRecords.id, record.id))
      .returning();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post("/markets/regime/evaluate", (req, res, next) => {
  try {
    res.json({ mode: "RESEARCH_ONLY", result: new MarketRegimeEngine().classify(req.body) });
  } catch (error) {
    next(error);
  }
});

router.post("/markets/trade-quality/evaluate", (req, res, next) => {
  try {
    res.json({ mode: "RESEARCH_ONLY", result: new TradeQualityEngine().evaluate(req.body) });
  } catch (error) {
    next(error);
  }
});

router.post("/markets/capital-survival/evaluate", (req, res, next) => {
  try {
    res.json({
      mode: "RESEARCH_ONLY",
      score: new CapitalSurvivalScore().evaluate(req.body?.scoreInputs),
      posture: req.body?.postureInputs ? new CapitalSurvivalEngine().evaluate(req.body.postureInputs) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/markets/capital-governor/evaluate", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const [profile] = await db.select().from(riskProfiles).where(eq(riskProfiles.userId, user.id)).limit(1);
    if (!profile) {
      res.status(409).json({ error: "RISK_PROFILE_REQUIRED" });
      return;
    }
    const equity = Number(req.body?.equity);
    if (!Number.isFinite(equity) || equity <= 0) {
      badRequest(res, "VALID_EQUITY_REQUIRED");
      return;
    }
    const governor = new CapitalGovernor({
      maxGrossExposurePercent: Math.min(1, profile.maxTotalExposure / equity),
      maxSymbolConcentrationPercent: profile.maxPositionPercent,
      maxDrawdownPercent: Math.max(profile.maxDailyLossPercent, 0.05),
    });
    res.json({
      mode: "RESEARCH_ONLY",
      brokerageExecution: false,
      result: governor.evaluate(req.body),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/markets/strategies/:id/transition", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const [record] = await db
      .select()
      .from(specialistRecords)
      .where(and(
        eq(specialistRecords.id, req.params.id),
        eq(specialistRecords.userId, user.id),
        eq(specialistRecords.recordType, "STRATEGY_DEFINITION"),
      ))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "STRATEGY_NOT_FOUND" });
      return;
    }
    const strategy = validateStrategyDefinition(record.data);
    const decision = validateStrategyTransition(strategy.validationStage, req.body?.validationStage);
    if (!decision.allowed) {
      res.status(409).json({ error: decision.reason, decision });
      return;
    }
    const updatedStrategy: StrategyDefinition = { ...strategy, validationStage: decision.to };
    const [updated] = await db
      .update(specialistRecords)
      .set({ data: updatedStrategy as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(specialistRecords.id, record.id))
      .returning();
    res.json({ mode: "RESEARCH_ONLY", record: updated });
  } catch (error) {
    next(error);
  }
});

router.get("/markets/strategies/:id/performance", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.userId, user.id));
    const tracker = new StrategyPerformanceTracker();
    for (const record of records.filter((item) => item.recordType === "PAPER_TRADE_OUTCOME")) {
      const outcome = record.data as unknown as PaperTradeOutcome;
      if (outcome.strategyId === req.params.id) tracker.recordOutcome(outcome);
    }
    res.json({ mode: "PAPER", performance: tracker.summarize(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/markets/paper-lab/evaluate", (req, res, next) => {
  try {
    res.json({ mode: "PAPER", result: new PaperStrategyLab().evaluate(req.body?.history) });
  } catch (error) {
    next(error);
  }
});

router.get("/markets/intelligence/status", async (req, res, next) => {
  try {
    const user = await getLocalUser(clerkUserId(req));
    const records = (await db
      .select()
      .from(specialistRecords)
      .where(eq(specialistRecords.userId, user.id)))
      .filter((record) => record.specialist === "MARKETS");
    res.json({
      mode: "RESEARCH_ONLY",
      marketData: "NOT_CONNECTED",
      brokerage: "NOT_CONNECTED",
      strategyEngine: {
        status: "READY",
        strategies: records.filter((record) => record.recordType === "STRATEGY_DEFINITION").length,
        liveValidationAuthorized: false,
      },
      marketRegimeEngine: new MarketRegimeEngine().classify(undefined),
      tradeQualityEngine: new TradeQualityEngine().evaluate(undefined),
      capitalSurvivalEngine: new CapitalSurvivalScore().evaluate(undefined),
      capitalGovernor: {
        status: "READY",
        decision: "DATA_REQUIRED",
        executionAuthority: false,
      },
      strategyPerformanceTracker: {
        status: "READY",
        paperOutcomes: records.filter((record) => record.recordType === "PAPER_TRADE_OUTCOME").length,
      },
      tradingJournal: {
        status: "READY",
        entries: records.filter((record) => record.recordType === "TRADING_JOURNAL_ENTRY").length,
      },
      paperStrategyLab: {
        status: "READY",
        evaluation: "DATA_REQUIRED",
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;