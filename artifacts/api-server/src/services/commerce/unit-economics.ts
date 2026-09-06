export interface CommerceUnitEconomicsInput {
  revenueCents: number;
  productCostCents: number;
  shippingCostCents: number;
  platformFeesCents: number;
  paymentFeesCents: number;
  customerAcquisitionCostCents: number;
  refundAllowanceCents: number;
  chargebackAllowanceCents: number;
  otherVariableCostsCents: number;
}

export interface CommerceUnitEconomicsResult {
  currency: "USD";
  unit: "CENTS";
  grossProfitCents: number;
  contributionProfitCents: number;
  profitPerOrderCents: number;
  grossMarginBasisPoints: number;
  contributionMarginBasisPoints: number;
  breakEvenCacCents: number;
  breakEvenRoasBasisPoints: number | null;
}

export class CommerceUnitEconomicsEngine {
  calculate(input: CommerceUnitEconomicsInput): CommerceUnitEconomicsResult {
    for (const [field, value] of Object.entries(input)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be non-negative integer cents`);
    }
    if (input.revenueCents === 0) throw new Error("revenueCents must be greater than zero");
    const grossProfitCents = input.revenueCents - input.productCostCents;
    const costsExceptCac = input.productCostCents + input.shippingCostCents + input.platformFeesCents +
      input.paymentFeesCents + input.refundAllowanceCents + input.chargebackAllowanceCents +
      input.otherVariableCostsCents;
    const breakEvenCacCents = Math.max(0, input.revenueCents - costsExceptCac);
    const contributionProfitCents = breakEvenCacCents - input.customerAcquisitionCostCents;
    return {
      currency: "USD",
      unit: "CENTS",
      grossProfitCents,
      contributionProfitCents,
      profitPerOrderCents: contributionProfitCents,
      grossMarginBasisPoints: Math.trunc((grossProfitCents * 10_000) / input.revenueCents),
      contributionMarginBasisPoints: Math.trunc((contributionProfitCents * 10_000) / input.revenueCents),
      breakEvenCacCents,
      breakEvenRoasBasisPoints: breakEvenCacCents === 0
        ? null
        : Math.trunc((input.revenueCents * 10_000) / breakEvenCacCents),
    };
  }
}