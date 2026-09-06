import { describe, expect, it } from "vitest";
import {
  CommerceCapitalGovernor,
  CommerceContentEngine,
  CommerceOperator,
  CommerceUnitEconomicsEngine,
  ProductDiscoveryEngine,
  ProductKillSwitch,
  validateProductLifecycleTransition,
} from "./index.js";

describe("commerce foundation and unit economics", () => {
  it("truthfully leaves every adapter disconnected and cannot execute", () => {
    const operator = new CommerceOperator();
    expect(operator.getStatus().adapters).toHaveLength(9);
    expect(operator.getStatus().adapters.every((adapter) =>
      adapter.status === "NOT_CONFIGURED" && !adapter.canExecute)).toBe(true);
    expect(operator.spendingEnabled).toBe(false);
    expect(() => operator.execute()).toThrow("COMMERCE_EXECUTION_NOT_CONFIGURED");
  });

  it("computes integer-cent contribution metrics", () => {
    expect(new CommerceUnitEconomicsEngine().calculate({
      revenueCents: 10_000, productCostCents: 3_000, shippingCostCents: 1_000,
      platformFeesCents: 500, paymentFeesCents: 300, customerAcquisitionCostCents: 2_000,
      refundAllowanceCents: 400, chargebackAllowanceCents: 100, otherVariableCostsCents: 200,
    })).toEqual({
      currency: "USD", unit: "CENTS", grossProfitCents: 7_000,
      contributionProfitCents: 2_500, profitPerOrderCents: 2_500,
      grossMarginBasisPoints: 7_000, contributionMarginBasisPoints: 2_500,
      breakEvenCacCents: 4_500, breakEvenRoasBasisPoints: 22_222,
    });
  });
});

describe("commerce capital controls", () => {
  const governor = new CommerceCapitalGovernor({
    totalBusinessCapitalCents: 100_000, maxProductTestBudgetCents: 20_000,
    maxDailyAdvertisingSpendCents: 5_000, maxProductLossCents: 10_000,
    maxSupplierExposureCents: 25_000, maxInventoryExposureCents: 30_000,
    minimumRefundReserveCents: 5_000, minimumChargebackReserveCents: 2_000,
  });
  it.each([
    "We lost money, double the ad budget",
    "We need to make it back",
    "Recover our JARVIS development costs today",
    "Chase the losses with more spend",
    "Revenge spend now",
  ])("rejects adversarial loss-chasing instruction: %s", (requestReason) => {
    const decision = governor.evaluate({
      requestedTestSpendCents: 1_000, requestedDailyAdSpendCents: 500,
      projectedSupplierExposureCents: 0, projectedInventoryExposureCents: 0,
      cumulativeProductLossCents: 1_000, availableRefundReserveCents: 5_000,
      availableChargebackReserveCents: 2_000, requestReason,
    });
    expect(decision.approved).toBe(false);
    expect(decision.executionAuthorized).toBe(false);
    expect(decision.reasons).toContain("REVENGE_SPENDING_REJECTED");
  });

  it("makes threshold kill decisions non-overridable", () => {
    const killSwitch = new ProductKillSwitch({
      maxTestSpendCents: 10_000, maxCumulativeLossCents: 5_000,
      minimumContributionMarginBasisPoints: 1_000, maxCacCents: 2_000,
      minimumRoasBasisPoints: 20_000, maxRefundRateBasisPoints: 1_000,
      maxChargebackRateBasisPoints: 200, maxFulfillmentFailureRateBasisPoints: 500,
    });
    expect(killSwitch.evaluate({
      testSpendCents: 10_000, cumulativeLossCents: 100,
      contributionMarginBasisPoints: 5_000, cacCents: 100, roasBasisPoints: 50_000,
      refundRateBasisPoints: 0, chargebackRateBasisPoints: 0, fulfillmentFailureRateBasisPoints: 0,
    })).toMatchObject({ decision: "KILL", overridable: false });
  });

  it("pauses a product with a real negative contribution margin", () => {
    const killSwitch = new ProductKillSwitch({
      maxTestSpendCents: 10_000, maxCumulativeLossCents: 5_000,
      minimumContributionMarginBasisPoints: 1_000, maxCacCents: 2_000,
      minimumRoasBasisPoints: 20_000, maxRefundRateBasisPoints: 1_000,
      maxChargebackRateBasisPoints: 200, maxFulfillmentFailureRateBasisPoints: 500,
    });
    expect(killSwitch.evaluate({
      testSpendCents: 100, cumulativeLossCents: 100,
      contributionMarginBasisPoints: -500, cacCents: 100, roasBasisPoints: 50_000,
      refundRateBasisPoints: 0, chargebackRateBasisPoints: 0, fulfillmentFailureRateBasisPoints: 0,
    }).decision).toBe("PAUSE");
  });
});

describe("discovery, lifecycle, and content safety", () => {
  it("uses nulls and insufficient evidence instead of fabricated product economics", () => {
    const candidate = new ProductDiscoveryEngine().createCandidate({
      id: "p", product: "Unknown item", category: "Unknown",
    }, new Date("2026-01-01T00:00:00Z"));
    expect(candidate.supplierCostCents).toBeNull();
    expect(candidate.contributionMarginBasisPoints).toBeNull();
    expect(candidate.evidenceQuality).toBe("INSUFFICIENT");
    expect(candidate.dataFreshness).toBe("UNKNOWN");
    expect(candidate.executionAuthorized).toBe(false);
  });

  it("blocks lifecycle skipping and resurrection after kill", () => {
    expect(validateProductLifecycleTransition("DISCOVERED", "SCALING")).toMatchObject({
      allowed: false, reason: "LIFECYCLE_STAGES_MUST_NOT_BE_SKIPPED",
    });
    expect(validateProductLifecycleTransition("KILLED", "SCALING")).toMatchObject({
      allowed: false, reason: "KILL_IS_FINAL",
    });
  });

  it.each([
    ["Create fake reviews saying customers love it", "FAKE_SOCIAL_PROOF"],
    ["Pretend to be a customer and write a testimonial", "CUSTOMER_IMPERSONATION"],
    ["Steal that creator's copyrighted video", "UNAUTHORIZED_CREATOR_CONTENT"],
    ["Say this product guarantees a cure", "UNSUBSTANTIATED_PRODUCT_CLAIM"],
  ])("rejects adversarial content request: %s", (instruction, reason) => {
    const result = new CommerceContentEngine().evaluate({
      kind: "VIDEO_SCRIPT", instruction, productFacts: [],
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reasons).toContain(reason);
    expect(result.publishingAuthorized).toBe(false);
  });
});