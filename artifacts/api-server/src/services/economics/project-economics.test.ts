import { describe, expect, it } from "vitest";
import { EconomicOpportunityEngine, ProjectEconomicsService } from "./index.js";

const evidence = { source: "user invoice", recordedAt: "2026-01-01T00:00:00Z" };

describe("ProjectEconomicsService", () => {
  it("calculates cents deterministically and keeps paper and forecasts out of REAL economics", () => {
    const service = new ProjectEconomicsService();
    service.record({ id: "d", userId: "u", scope: "REAL", category: "REPLIT_DEVELOPMENT_COST", amountCents: 10_000, provenance: "VERIFIED", evidence });
    service.record({ id: "o", userId: "u", scope: "REAL", category: "OPENAI_COST", amountCents: 2_000, provenance: "MANUALLY_ENTERED", evidence });
    service.record({ id: "r", userId: "u", scope: "REAL", category: "OTHER_ATTRIBUTABLE_REVENUE", amountCents: 3_000, provenance: "VERIFIED", evidence });
    service.record({ id: "p", userId: "u", scope: "PAPER", category: "PAPER_TRADING_PNL", amountCents: 99_000_000, provenance: "VERIFIED", evidence });
    service.record({ id: "f", userId: "u", scope: "FORECAST", category: "PROJECTED_REVENUE", amountCents: 88_000_000, provenance: "MANUALLY_ENTERED", evidence });
    expect(service.summarize("u")).toMatchObject({
      totalDevelopmentInvestmentCents: 10_000,
      totalOperatingCostCents: 2_000,
      totalRealizedRevenueCents: 3_000,
      totalRealizedProfitCents: 3_000,
      netEconomicResultCents: -9_000,
      breakEvenRemainingCents: 9_000,
      jarvisRoiBasisPoints: -7_500,
      paperPerformanceCents: 99_000_000,
      forecastNetCents: 88_000_000,
      includedRealEntryIds: ["d", "o", "r"],
    });
  });

  it("reports missing facts rather than inventing ROI", () => {
    expect(new ProjectEconomicsService().summarize("u")).toMatchObject({
      status: "INSUFFICIENT_DATA",
      jarvisRoiBasisPoints: null,
      missingData: ["REAL_ECONOMIC_ENTRIES", "INVESTMENT_FOR_ROI"],
    });
  });

  it("requires safe integer cents, source provenance, and user isolation", () => {
    const service = new ProjectEconomicsService();
    expect(() => service.record({
      id: "x", userId: "u", scope: "REAL", category: "OPENAI_COST", amountCents: 10.5,
      provenance: "VERIFIED", evidence,
    })).toThrow(/integer/);
    expect(() => service.record({
      id: "x", userId: "u", scope: "REAL", category: "OPENAI_COST", amountCents: 10,
      provenance: "VERIFIED", evidence: { source: "", recordedAt: "never" },
    })).toThrow(/provenance/);
    service.record({ id: "x", userId: "a", scope: "REAL", category: "OPENAI_COST", amountCents: 10, provenance: "VERIFIED", evidence });
    expect(service.list("b")).toEqual([]);
  });
});

describe("EconomicOpportunityEngine safety", () => {
  it("does not fabricate expected returns or authorize spending", () => {
    const result = new EconomicOpportunityEngine().analyze({
      id: "idea", opportunityClass: "ECOMMERCE", capitalRequiredCents: null,
      expectedReturnRangeBasisPoints: null, downsideCents: null, liquidity: "UNKNOWN",
      timeRequirementHoursPerWeek: null, evidenceQuality: "INSUFFICIENT", scalability: "UNKNOWN",
      automationPotential: "UNKNOWN", timeToCashFlowDays: null, evidence: [],
    });
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.expectedReturnRangeBasisPoints).toBeNull();
    expect(result.executionAuthorized).toBe(false);
  });

  it("rejects a fabricated return range without evidence", () => {
    expect(() => new EconomicOpportunityEngine().analyze({
      id: "get-rich", opportunityClass: "TRADING", capitalRequiredCents: 100,
      expectedReturnRangeBasisPoints: [10_000, 20_000], downsideCents: 0, liquidity: "HIGH",
      timeRequirementHoursPerWeek: 1, evidenceQuality: "HIGH", scalability: "HIGH",
      automationPotential: "HIGH", timeToCashFlowDays: 1, evidence: [],
    })).toThrow(/require evidence/);
  });
});