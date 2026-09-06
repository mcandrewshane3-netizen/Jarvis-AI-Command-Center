export interface CommerceCapitalLimits {
  totalBusinessCapitalCents: number;
  maxProductTestBudgetCents: number;
  maxDailyAdvertisingSpendCents: number;
  maxProductLossCents: number;
  maxSupplierExposureCents: number;
  maxInventoryExposureCents: number;
  minimumRefundReserveCents: number;
  minimumChargebackReserveCents: number;
}

export interface CommerceCapitalRequest {
  requestedTestSpendCents: number;
  requestedDailyAdSpendCents: number;
  projectedSupplierExposureCents: number;
  projectedInventoryExposureCents: number;
  cumulativeProductLossCents: number;
  availableRefundReserveCents: number;
  availableChargebackReserveCents: number;
  requestReason?: string;
}

export interface CommerceCapitalDecision {
  approved: boolean;
  executionAuthorized: false;
  reasons: string[];
}

function validateCentRecord(record: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(record)) {
    if (field === "requestReason") continue;
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${field} must be non-negative integer cents`);
  }
}

export class CommerceCapitalGovernor {
  constructor(private readonly limits: CommerceCapitalLimits) {
    validateCentRecord(limits as unknown as Record<string, unknown>);
  }

  evaluate(request: CommerceCapitalRequest): CommerceCapitalDecision {
    validateCentRecord(request as unknown as Record<string, unknown>);
    const reasons: string[] = [];
    const combinedCommitment = request.requestedTestSpendCents + request.projectedSupplierExposureCents +
      request.projectedInventoryExposureCents + this.limits.minimumRefundReserveCents +
      this.limits.minimumChargebackReserveCents;
    if (combinedCommitment > this.limits.totalBusinessCapitalCents) reasons.push("TOTAL_CAPITAL_LIMIT");
    if (request.requestedTestSpendCents > this.limits.maxProductTestBudgetCents) reasons.push("PRODUCT_TEST_BUDGET_LIMIT");
    if (request.requestedDailyAdSpendCents > this.limits.maxDailyAdvertisingSpendCents) reasons.push("DAILY_AD_SPEND_LIMIT");
    if (request.cumulativeProductLossCents >= this.limits.maxProductLossCents) reasons.push("PRODUCT_LOSS_LIMIT");
    if (request.projectedSupplierExposureCents > this.limits.maxSupplierExposureCents) reasons.push("SUPPLIER_EXPOSURE_LIMIT");
    if (request.projectedInventoryExposureCents > this.limits.maxInventoryExposureCents) reasons.push("INVENTORY_EXPOSURE_LIMIT");
    if (request.availableRefundReserveCents < this.limits.minimumRefundReserveCents) reasons.push("REFUND_RESERVE_REQUIRED");
    if (request.availableChargebackReserveCents < this.limits.minimumChargebackReserveCents) reasons.push("CHARGEBACK_RESERVE_REQUIRED");
    if (/\b(recover|make it back|double|chase|revenge|increase risk after loss)\b/i.test(request.requestReason ?? "")) {
      reasons.push("REVENGE_SPENDING_REJECTED");
    }
    return { approved: reasons.length === 0, executionAuthorized: false, reasons };
  }
}

export interface ProductKillLimits {
  maxTestSpendCents: number;
  maxCumulativeLossCents: number;
  minimumContributionMarginBasisPoints: number;
  maxCacCents: number;
  minimumRoasBasisPoints: number;
  maxRefundRateBasisPoints: number;
  maxChargebackRateBasisPoints: number;
  maxFulfillmentFailureRateBasisPoints: number;
}

export interface ProductPerformance {
  testSpendCents: number;
  cumulativeLossCents: number;
  contributionMarginBasisPoints: number;
  cacCents: number;
  roasBasisPoints: number;
  refundRateBasisPoints: number;
  chargebackRateBasisPoints: number;
  fulfillmentFailureRateBasisPoints: number;
}

export type ProductKillDecision = "CONTINUE_TEST" | "REDUCE" | "PAUSE" | "KILL";

export class ProductKillSwitch {
  constructor(private readonly limits: ProductKillLimits) {
    for (const [field, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value)) throw new Error(`${field} must be an integer`);
      if (field !== "minimumContributionMarginBasisPoints" && value < 0) {
        throw new Error(`${field} must be non-negative`);
      }
    }
  }

  evaluate(performance: ProductPerformance): { decision: ProductKillDecision; reasons: string[]; overridable: false } {
    for (const [field, value] of Object.entries(performance)) {
      if (!Number.isSafeInteger(value)) throw new Error(`${field} must be an integer`);
      if (field !== "contributionMarginBasisPoints" && value < 0) {
        throw new Error(`${field} must be non-negative`);
      }
    }
    const kill: string[] = [];
    if (performance.testSpendCents >= this.limits.maxTestSpendCents) kill.push("MAX_TEST_SPEND");
    if (performance.cumulativeLossCents >= this.limits.maxCumulativeLossCents) kill.push("MAX_CUMULATIVE_LOSS");
    if (performance.chargebackRateBasisPoints > this.limits.maxChargebackRateBasisPoints) kill.push("CHARGEBACK_RATE");
    if (performance.fulfillmentFailureRateBasisPoints > this.limits.maxFulfillmentFailureRateBasisPoints) kill.push("FULFILLMENT_FAILURE_RATE");
    if (kill.length) return { decision: "KILL", reasons: kill, overridable: false };
    const pause: string[] = [];
    if (performance.contributionMarginBasisPoints < this.limits.minimumContributionMarginBasisPoints) pause.push("CONTRIBUTION_MARGIN");
    if (performance.refundRateBasisPoints > this.limits.maxRefundRateBasisPoints) pause.push("REFUND_RATE");
    if (pause.length) return { decision: "PAUSE", reasons: pause, overridable: false };
    const reduce: string[] = [];
    if (performance.cacCents > this.limits.maxCacCents) reduce.push("CAC");
    if (performance.roasBasisPoints < this.limits.minimumRoasBasisPoints) reduce.push("ROAS");
    return { decision: reduce.length ? "REDUCE" : "CONTINUE_TEST", reasons: reduce, overridable: false };
  }
}