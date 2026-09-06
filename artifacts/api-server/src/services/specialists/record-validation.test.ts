import { describe, expect, it } from "vitest";
import { validateFinanceRecord, validateRecordData } from "../../routes/specialists";

const validStrategy = {
  id: "strategy-1",
  name: "Paper momentum",
  version: "1.0",
  status: "DRAFT",
  family: "MOMENTUM",
  assetUniverse: ["SPY"],
  timeframe: "1D",
  entryRules: ["Close above moving average"],
  exitRules: ["Close below moving average"],
  riskRules: ["Paper only"],
  requiredData: ["daily close"],
  allowedRegimes: ["BULL_TREND"],
  performanceMetrics: {},
  validationStage: "IDEA",
};

describe("specialist record write validation", () => {
  it("normalizes finance provenance to MANUAL", () => {
    expect(validateFinanceRecord("FINANCIAL_ACCOUNT", {
      name: "Cash",
      type: "CASH",
      currency: "USD",
      source: "CONNECTED",
      balanceCents: 12_345,
      balanceAsOf: "2026-09-06",
    })).toMatchObject({ source: "MANUAL", balanceCents: 12_345 });
  });

  it("rejects fractional cents and invalid finance dates", () => {
    expect(() => validateFinanceRecord("FINANCIAL_ACCOUNT", {
      name: "Cash",
      type: "CASH",
      currency: "USD",
      balanceCents: 123.45,
    })).toThrow(/integer number of USD cents/);
    expect(() => validateFinanceRecord("RECURRING_BILL", {
      name: "Rent",
      amountCents: 100_000,
      nextDueDate: "2026-02-30",
      frequency: "MONTHLY",
      active: true,
    })).toThrow(/valid calendar date/);
  });

  it("rejects non-paper outcomes", () => {
    expect(() => validateRecordData("MARKETS", "PAPER_TRADE_OUTCOME", {
      strategyId: "strategy-1",
      tradeId: "trade-1",
      openedAt: "2026-09-01T14:00:00.000Z",
      closedAt: "2026-09-01T15:00:00.000Z",
      pnl: 10,
      returnPercent: 0.01,
      mode: "LIVE",
    })).toThrow(/Only paper-trade outcomes/);
  });

  it("rejects strategies created directly in a live stage", () => {
    expect(() => validateRecordData("MARKETS", "STRATEGY_DEFINITION", {
      ...validStrategy,
      validationStage: "LIMITED_LIVE",
    })).toThrow(/LIVE_VALIDATION_NOT_AUTHORIZED/);
  });
});