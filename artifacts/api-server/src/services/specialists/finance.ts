/**
 * Finance-domain values are deliberately JSON-native. Dates are ISO 8601
 * calendar-date strings and every USD amount is an integer number of cents.
 * Optional monetary fields mean "not supplied"; they must never be treated as
 * zero by a calculation.
 */
export type FinancialDataSource = "MANUAL" | "CONNECTED";
export type IsoDate = string;
export type UsdCents = number;

export type FinancialAccount = {
  id: string;
  name: string;
  type: "CHECKING" | "SAVINGS" | "CASH" | "CREDIT" | "OTHER";
  currency: "USD";
  source: FinancialDataSource;
  balanceCents?: UsdCents;
  balanceAsOf?: IsoDate;
};

export type IncomeSource = {
  id: string;
  name: string;
  source: FinancialDataSource;
  amountCents?: UsdCents;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "ANNUAL";
  active: boolean;
};

export type RecurringBill = {
  id: string;
  name: string;
  source: FinancialDataSource;
  amountCents?: UsdCents;
  nextDueDate: IsoDate;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
  active: boolean;
};

export type Debt = {
  id: string;
  name: string;
  source: FinancialDataSource;
  balanceCents?: UsdCents;
  minimumPaymentCents?: UsdCents;
  annualPercentageRateBasisPoints?: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  source: FinancialDataSource;
  targetAmountCents?: UsdCents;
  currentAmountCents?: UsdCents;
  monthlyContributionCents?: UsdCents;
  targetDate?: IsoDate;
};

export type ExpenseEntry = {
  id: string;
  categoryId: string;
  description: string;
  source: FinancialDataSource;
  amountCents?: UsdCents;
  occurredOn: IsoDate;
};

export type BudgetCategory = {
  id: string;
  name: string;
  source: FinancialDataSource;
  limitCents?: UsdCents;
  period: "WEEKLY" | "MONTHLY";
};

export type CashFlowProjection = {
  asOfDate: IsoDate;
  throughDate: IsoDate;
  openingCashCents: UsdCents;
  expectedIncomeCents: UsdCents;
  expectedBillsCents: UsdCents;
  projectedCashCents: UsdCents;
  sourceAccountIds: string[];
};

export type DataRequired = {
  status: "DATA_REQUIRED";
  missingInputs: string[];
};

export type CalculationSuccess<T> = {
  status: "OK";
  value: T;
};

export type CalculationResult<T> = CalculationSuccess<T> | DataRequired;

export type BillOccurrence = {
  billId: string;
  name: string;
  source: FinancialDataSource;
  dueDate: IsoDate;
  amountCents: UsdCents;
};

export type BudgetCategorySummary = {
  categoryId: string;
  name: string;
  limitCents: UsdCents;
  spentCents: UsdCents;
  remainingCents: UsdCents;
};

export type BudgetSummary = {
  period: "WEEKLY" | "MONTHLY";
  startDate: IsoDate;
  endDate: IsoDate;
  totalLimitCents: UsdCents;
  totalSpentCents: UsdCents;
  totalRemainingCents: UsdCents;
  categories: BudgetCategorySummary[];
};

function ok<T>(value: T): CalculationSuccess<T> {
  return { status: "OK", value };
}

function dataRequired(inputs: string[]): DataRequired {
  return { status: "DATA_REQUIRED", missingInputs: [...new Set(inputs)].sort() };
}

function requireCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${field} must be an integer number of USD cents`);
  }
}

function parseDate(value: IsoDate, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must be an ISO date in YYYY-MM-DD form`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid ISO date`);
  }
  return date;
}

function iso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addUtcMonthsFromAnchor(anchor: Date, months: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const day = anchor.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function billDate(anchor: Date, frequency: RecurringBill["frequency"], occurrence: number): Date {
  switch (frequency) {
    case "WEEKLY":
      return addUtcDays(anchor, occurrence * 7);
    case "BIWEEKLY":
      return addUtcDays(anchor, occurrence * 14);
    case "MONTHLY":
      return addUtcMonthsFromAnchor(anchor, occurrence);
    case "QUARTERLY":
      return addUtcMonthsFromAnchor(anchor, occurrence * 3);
    case "ANNUAL":
      return addUtcMonthsFromAnchor(anchor, occurrence * 12);
  }
}

/**
 * Returns all active bill occurrences in an inclusive range. `nextDueDate` is
 * the earliest known future occurrence, so this function never invents older
 * historical occurrences.
 */
export function billsDueInRange(input: {
  bills?: RecurringBill[];
  startDate: IsoDate;
  endDate: IsoDate;
}): CalculationResult<BillOccurrence[]> {
  const start = parseDate(input.startDate, "startDate");
  const end = parseDate(input.endDate, "endDate");
  if (start > end) throw new RangeError("startDate must not be after endDate");
  if (!input.bills) return dataRequired(["bills"]);

  const missing = input.bills
    .filter((bill) => bill.active && bill.amountCents === undefined)
    .map((bill) => `bills.${bill.id}.amountCents`);
  if (missing.length) return dataRequired(missing);

  const occurrences: BillOccurrence[] = [];
  for (const bill of input.bills) {
    if (!bill.active) continue;
    requireCents(bill.amountCents!, `bills.${bill.id}.amountCents`);
    const anchor = parseDate(bill.nextDueDate, `bills.${bill.id}.nextDueDate`);
    for (let index = 0; ; index += 1) {
      const due = billDate(anchor, bill.frequency, index);
      if (due > end) break;
      if (due >= start) {
        occurrences.push({
          billId: bill.id,
          name: bill.name,
          source: bill.source,
          dueDate: iso(due),
          amountCents: bill.amountCents!,
        });
      }
    }
  }
  occurrences.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.billId.localeCompare(b.billId));
  return ok(occurrences);
}

function summarizeBudget(input: {
  period: BudgetCategory["period"];
  startDate: IsoDate;
  endDate: IsoDate;
  categories?: BudgetCategory[];
  expenses?: ExpenseEntry[];
}): CalculationResult<BudgetSummary> {
  parseDate(input.startDate, "startDate");
  parseDate(input.endDate, "endDate");
  const missing: string[] = [];
  if (!input.categories) missing.push("categories");
  if (!input.expenses) missing.push("expenses");
  const includedCategoryIds = new Set(
    (input.categories ?? [])
      .filter((category) => category.period === input.period)
      .map((category) => category.id),
  );
  for (const category of input.categories ?? []) {
    if (category.period === input.period && category.limitCents === undefined) {
      missing.push(`categories.${category.id}.limitCents`);
    }
  }
  for (const expense of input.expenses ?? []) {
    if (
      includedCategoryIds.has(expense.categoryId) &&
      expense.occurredOn >= input.startDate &&
      expense.occurredOn <= input.endDate &&
      expense.amountCents === undefined
    ) {
      missing.push(`expenses.${expense.id}.amountCents`);
    }
  }
  if (missing.length) return dataRequired(missing);

  const categories = input.categories!.filter((category) => category.period === input.period);
  const summaries = categories.map((category) => {
    requireCents(category.limitCents!, `categories.${category.id}.limitCents`);
    const spentCents = input.expenses!
      .filter((expense) =>
        expense.categoryId === category.id &&
        expense.occurredOn >= input.startDate &&
        expense.occurredOn <= input.endDate)
      .reduce((total, expense) => {
        requireCents(expense.amountCents!, `expenses.${expense.id}.amountCents`);
        return total + expense.amountCents!;
      }, 0);
    return {
      categoryId: category.id,
      name: category.name,
      limitCents: category.limitCents!,
      spentCents,
      remainingCents: category.limitCents! - spentCents,
    };
  });
  return ok({
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
    totalLimitCents: summaries.reduce((sum, category) => sum + category.limitCents, 0),
    totalSpentCents: summaries.reduce((sum, category) => sum + category.spentCents, 0),
    totalRemainingCents: summaries.reduce((sum, category) => sum + category.remainingCents, 0),
    categories: summaries,
  });
}

export function monthlyBudgetSummary(input: {
  month: string;
  categories?: BudgetCategory[];
  expenses?: ExpenseEntry[];
}): CalculationResult<BudgetSummary> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new TypeError("month must be in YYYY-MM form");
  const start = parseDate(`${input.month}-01`, "month");
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return summarizeBudget({
    period: "MONTHLY",
    startDate: iso(start),
    endDate: iso(end),
    categories: input.categories,
    expenses: input.expenses,
  });
}

export function weeklyBudgetSummary(input: {
  weekStart: IsoDate;
  categories?: BudgetCategory[];
  expenses?: ExpenseEntry[];
}): CalculationResult<BudgetSummary> {
  const start = parseDate(input.weekStart, "weekStart");
  return summarizeBudget({
    period: "WEEKLY",
    startDate: input.weekStart,
    endDate: iso(addUtcDays(start, 6)),
    categories: input.categories,
    expenses: input.expenses,
  });
}

export function cashAvailableAfterBills(input: {
  accounts?: FinancialAccount[];
  bills?: RecurringBill[];
  startDate: IsoDate;
  endDate: IsoDate;
}): CalculationResult<CashFlowProjection> {
  const missing: string[] = [];
  if (!input.accounts) missing.push("accounts");
  for (const account of input.accounts ?? []) {
    if (account.balanceCents === undefined) missing.push(`accounts.${account.id}.balanceCents`);
  }
  const due = billsDueInRange({
    bills: input.bills,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (due.status === "DATA_REQUIRED") missing.push(...due.missingInputs);
  if (missing.length) return dataRequired(missing);
  if (due.status === "DATA_REQUIRED") return due;

  const openingCashCents = input.accounts!.reduce((total, account) => {
    requireCents(account.balanceCents!, `accounts.${account.id}.balanceCents`);
    return total + account.balanceCents!;
  }, 0);
  const expectedBillsCents = due.value.reduce((total, bill) => total + bill.amountCents, 0);
  return ok({
    asOfDate: input.startDate,
    throughDate: input.endDate,
    openingCashCents,
    expectedIncomeCents: 0,
    expectedBillsCents,
    projectedCashCents: openingCashCents - expectedBillsCents,
    sourceAccountIds: input.accounts!.map((account) => account.id),
  });
}

export type SavingsGoalProjection = {
  goalId: string;
  remainingCents: UsdCents;
  monthsRequired: number;
  projectedCompletionDate: IsoDate;
  reachesTarget: boolean;
};

export function projectSavingsGoal(input: {
  goal?: SavingsGoal;
  asOfDate: IsoDate;
}): CalculationResult<SavingsGoalProjection> {
  parseDate(input.asOfDate, "asOfDate");
  if (!input.goal) return dataRequired(["goal"]);
  const missing = (["targetAmountCents", "currentAmountCents", "monthlyContributionCents"] as const)
    .filter((field) => input.goal?.[field] === undefined)
    .map((field) => `goal.${field}`);
  if (missing.length) return dataRequired(missing);
  const goal = input.goal;
  requireCents(goal.targetAmountCents!, "goal.targetAmountCents");
  requireCents(goal.currentAmountCents!, "goal.currentAmountCents");
  requireCents(goal.monthlyContributionCents!, "goal.monthlyContributionCents");
  const remainingCents = Math.max(0, goal.targetAmountCents! - goal.currentAmountCents!);
  if (remainingCents > 0 && goal.monthlyContributionCents! <= 0) {
    return dataRequired(["goal.monthlyContributionCentsGreaterThanZero"]);
  }
  const monthsRequired = remainingCents === 0 ? 0 : Math.ceil(remainingCents / goal.monthlyContributionCents!);
  return ok({
    goalId: goal.id,
    remainingCents,
    monthsRequired,
    projectedCompletionDate: iso(addUtcMonthsFromAnchor(parseDate(input.asOfDate, "asOfDate"), monthsRequired)),
    reachesTarget: true,
  });
}

export type IncomeChangeScenario = {
  baselineMonthlyIncomeCents: UsdCents;
  scenarioMonthlyIncomeCents: UsdCents;
  changeCents: UsdCents;
  monthlyOutflowCents: UsdCents;
  baselineRemainderCents: UsdCents;
  scenarioRemainderCents: UsdCents;
};

/**
 * `changeBasisPoints` is a percentage delta (100 basis points = 1%). Rounding
 * to the nearest cent is deterministic and happens only at the final amount.
 */
export function incomeChangeScenario(input: {
  baselineMonthlyIncomeCents?: UsdCents;
  monthlyOutflowCents?: UsdCents;
  scenarioMonthlyIncomeCents?: UsdCents;
  changeBasisPoints?: number;
}): CalculationResult<IncomeChangeScenario> {
  const missing: string[] = [];
  if (input.baselineMonthlyIncomeCents === undefined) missing.push("baselineMonthlyIncomeCents");
  if (input.monthlyOutflowCents === undefined) missing.push("monthlyOutflowCents");
  if (input.scenarioMonthlyIncomeCents === undefined && input.changeBasisPoints === undefined) {
    missing.push("scenarioMonthlyIncomeCentsOrChangeBasisPoints");
  }
  if (missing.length) return dataRequired(missing);
  requireCents(input.baselineMonthlyIncomeCents!, "baselineMonthlyIncomeCents");
  requireCents(input.monthlyOutflowCents!, "monthlyOutflowCents");
  if (input.changeBasisPoints !== undefined && !Number.isSafeInteger(input.changeBasisPoints)) {
    throw new TypeError("changeBasisPoints must be an integer");
  }
  const scenarioMonthlyIncomeCents = input.scenarioMonthlyIncomeCents ??
    Math.round(input.baselineMonthlyIncomeCents! * (10_000 + input.changeBasisPoints!) / 10_000);
  requireCents(scenarioMonthlyIncomeCents, "scenarioMonthlyIncomeCents");
  return ok({
    baselineMonthlyIncomeCents: input.baselineMonthlyIncomeCents!,
    scenarioMonthlyIncomeCents,
    changeCents: scenarioMonthlyIncomeCents - input.baselineMonthlyIncomeCents!,
    monthlyOutflowCents: input.monthlyOutflowCents!,
    baselineRemainderCents: input.baselineMonthlyIncomeCents! - input.monthlyOutflowCents!,
    scenarioRemainderCents: scenarioMonthlyIncomeCents - input.monthlyOutflowCents!,
  });
}

// Verb-first aliases keep the calculation API discoverable for callers.
export const getBillsDueInRange = billsDueInRange;
export const calculateMonthlyBudgetSummary = monthlyBudgetSummary;
export const calculateWeeklyBudgetSummary = weeklyBudgetSummary;
export const calculateCashAvailableAfterBills = cashAvailableAfterBills;
export const calculateSavingsGoalProjection = projectSavingsGoal;
export const calculateIncomeChangeScenario = incomeChangeScenario;