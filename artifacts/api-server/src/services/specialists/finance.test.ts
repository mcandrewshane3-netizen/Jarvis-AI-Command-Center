import { describe, expect, it } from "vitest";
import {
  billsDueInRange,
  cashAvailableAfterBills,
  incomeChangeScenario,
  monthlyBudgetSummary,
  projectSavingsGoal,
  weeklyBudgetSummary,
  type BudgetCategory,
  type ExpenseEntry,
  type RecurringBill,
} from "./finance";

const rent: RecurringBill = {
  id: "rent",
  name: "Rent",
  source: "MANUAL",
  amountCents: 125_000,
  nextDueDate: "2026-01-31",
  frequency: "MONTHLY",
  active: true,
};

describe("finance specialist", () => {
  it("retrieves deterministic inclusive bill occurrences without losing the monthly anchor day", () => {
    expect(billsDueInRange({
      bills: [rent],
      startDate: "2026-02-01",
      endDate: "2026-03-31",
    })).toEqual({
      status: "OK",
      value: [
        { billId: "rent", name: "Rent", source: "MANUAL", dueDate: "2026-02-28", amountCents: 125_000 },
        { billId: "rent", name: "Rent", source: "MANUAL", dueDate: "2026-03-31", amountCents: 125_000 },
      ],
    });
  });

  it("calculates monthly and weekly budget math in integer cents", () => {
    const categories: BudgetCategory[] = [
      { id: "food-m", name: "Food monthly", source: "MANUAL", limitCents: 50_000, period: "MONTHLY" },
      { id: "food-w", name: "Food weekly", source: "MANUAL", limitCents: 12_000, period: "WEEKLY" },
    ];
    const expenses: ExpenseEntry[] = [
      { id: "e1", categoryId: "food-m", description: "Groceries", source: "MANUAL", amountCents: 12_345, occurredOn: "2026-02-03" },
      { id: "e2", categoryId: "food-w", description: "Lunch", source: "MANUAL", amountCents: 2_501, occurredOn: "2026-02-04" },
      { id: "e3", categoryId: "food-m", description: "Next month", source: "MANUAL", amountCents: 999, occurredOn: "2026-03-01" },
    ];
    const monthly = monthlyBudgetSummary({ month: "2026-02", categories, expenses });
    const weekly = weeklyBudgetSummary({ weekStart: "2026-02-02", categories, expenses });
    expect(monthly.status === "OK" && monthly.value.totalRemainingCents).toBe(37_655);
    expect(weekly.status === "OK" && weekly.value.totalRemainingCents).toBe(9_499);
  });

  it("keeps manual provenance and uses only the supplied account balance", () => {
    const result = cashAvailableAfterBills({
      accounts: [{
        id: "checking",
        name: "Checking",
        type: "CHECKING",
        currency: "USD",
        source: "MANUAL",
        balanceCents: 200_000,
        balanceAsOf: "2026-02-01",
      }],
      bills: [rent],
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
    expect(result).toEqual({
      status: "OK",
      value: {
        asOfDate: "2026-02-01",
        throughDate: "2026-02-28",
        openingCashCents: 200_000,
        expectedIncomeCents: 0,
        expectedBillsCents: 125_000,
        projectedCashCents: 75_000,
        sourceAccountIds: ["checking"],
      },
    });
  });

  it("never fabricates a missing balance or bill amount", () => {
    expect(cashAvailableAfterBills({
      bills: [],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    })).toEqual({ status: "DATA_REQUIRED", missingInputs: ["accounts"] });
    expect(cashAvailableAfterBills({
      accounts: [{ id: "a", name: "Unknown", type: "CHECKING", currency: "USD", source: "CONNECTED" }],
      bills: [],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    })).toEqual({ status: "DATA_REQUIRED", missingInputs: ["accounts.a.balanceCents"] });
    expect(billsDueInRange({
      bills: [{ ...rent, amountCents: undefined }],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    })).toEqual({ status: "DATA_REQUIRED", missingInputs: ["bills.rent.amountCents"] });
  });

  it("projects savings and income scenarios deterministically", () => {
    expect(projectSavingsGoal({
      goal: {
        id: "reserve",
        name: "Reserve",
        source: "MANUAL",
        targetAmountCents: 100_000,
        currentAmountCents: 25_000,
        monthlyContributionCents: 20_000,
      },
      asOfDate: "2026-01-31",
    })).toEqual({
      status: "OK",
      value: {
        goalId: "reserve",
        remainingCents: 75_000,
        monthsRequired: 4,
        projectedCompletionDate: "2026-05-31",
        reachesTarget: true,
      },
    });
    const scenario = incomeChangeScenario({
      baselineMonthlyIncomeCents: 500_000,
      monthlyOutflowCents: 350_000,
      changeBasisPoints: -1_000,
    });
    expect(scenario.status === "OK" && scenario.value).toMatchObject({
      scenarioMonthlyIncomeCents: 450_000,
      changeCents: -50_000,
      baselineRemainderCents: 150_000,
      scenarioRemainderCents: 100_000,
    });
  });

  it("returns explicit missing inputs instead of assuming zero", () => {
    expect(projectSavingsGoal({
      goal: { id: "g", name: "Goal", source: "MANUAL", targetAmountCents: 10_000 },
      asOfDate: "2026-01-01",
    })).toEqual({
      status: "DATA_REQUIRED",
      missingInputs: ["goal.currentAmountCents", "goal.monthlyContributionCents"],
    });
    expect(incomeChangeScenario({ baselineMonthlyIncomeCents: 100_000 })).toEqual({
      status: "DATA_REQUIRED",
      missingInputs: ["monthlyOutflowCents", "scenarioMonthlyIncomeCentsOrChangeBasisPoints"],
    });
  });
});