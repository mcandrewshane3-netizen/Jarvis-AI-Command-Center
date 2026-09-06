export interface ProductEvidence {
  source: string;
  sourceType: "OFFICIAL_API" | "PLATFORM" | "SUPPLIER_CATALOG" | "MARKETPLACE" | "SEARCH_TRENDS" | "REPORTING" | "SOCIAL";
  retrievedAt: string;
  observation: string;
  reference?: string;
}

export interface ProductCandidateInput {
  id: string;
  product: string;
  category: string;
  demandEvidence?: readonly ProductEvidence[];
  competitionEvidence?: readonly ProductEvidence[];
  supplierCostCents?: number | null;
  shippingCostCents?: number | null;
  sellingPriceCents?: number | null;
  platformFeesCents?: number | null;
  paymentFeesCents?: number | null;
  estimatedCacCents?: number | null;
  refundAllowanceCents?: number | null;
  chargebackAllowanceCents?: number | null;
  contributionMarginBasisPoints?: number | null;
  risks?: readonly string[];
}

export interface ProductCandidate {
  id: string;
  product: string;
  category: string;
  demandEvidence: readonly ProductEvidence[];
  competitionEvidence: readonly ProductEvidence[];
  supplierCostCents: number | null;
  shippingCostCents: number | null;
  sellingPriceCents: number | null;
  platformFeesCents: number | null;
  paymentFeesCents: number | null;
  estimatedCacCents: number | null;
  refundAllowanceCents: number | null;
  chargebackAllowanceCents: number | null;
  contributionMarginBasisPoints: number | null;
  risks: readonly string[];
  dataFreshness: "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
  evidenceQuality: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  missingData: readonly string[];
  executionAuthorized: false;
}

const MONEY_FIELDS = [
  "supplierCostCents", "shippingCostCents", "sellingPriceCents", "platformFeesCents", "paymentFeesCents",
  "estimatedCacCents", "refundAllowanceCents", "chargebackAllowanceCents",
] as const;

/** Normalizes only submitted evidence. It does not search, infer prices, or invent economics. */
export class ProductDiscoveryEngine {
  createCandidate(input: ProductCandidateInput, now = new Date()): ProductCandidate {
    if (!input.id.trim() || !input.product.trim() || !input.category.trim()) throw new Error("Product identity is required");
    for (const field of MONEY_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`${field} must be non-negative integer cents`);
      }
    }
    if (input.contributionMarginBasisPoints !== undefined && input.contributionMarginBasisPoints !== null &&
        !Number.isSafeInteger(input.contributionMarginBasisPoints)) {
      throw new Error("contributionMarginBasisPoints must be an integer");
    }
    const evidence = [...(input.demandEvidence ?? []), ...(input.competitionEvidence ?? [])];
    for (const item of evidence) {
      if (!item.source.trim() || !item.observation.trim() || !Number.isFinite(Date.parse(item.retrievedAt))) {
        throw new Error("Evidence requires source, observation, and valid retrieval time");
      }
    }
    const ages = evidence.map((item) => now.getTime() - Date.parse(item.retrievedAt));
    const newestAge = ages.length ? Math.min(...ages) : Number.POSITIVE_INFINITY;
    const dataFreshness = !evidence.length ? "UNKNOWN"
      : newestAge < 0 || newestAge > 90 * 86_400_000 ? "STALE"
      : newestAge > 30 * 86_400_000 ? "AGING"
      : "CURRENT";
    const independentSources = new Set(evidence.map(({ source }) => source)).size;
    const evidenceQuality = independentSources >= 3 ? "HIGH"
      : independentSources === 2 ? "MEDIUM"
      : independentSources === 1 ? "LOW"
      : "INSUFFICIENT";
    const missingData: string[] = MONEY_FIELDS.filter((field) => input[field] === undefined || input[field] === null);
    if (input.contributionMarginBasisPoints === undefined || input.contributionMarginBasisPoints === null) {
      missingData.push("contributionMarginBasisPoints");
    }
    if (!(input.demandEvidence?.length)) missingData.push("demandEvidence");
    if (!(input.competitionEvidence?.length)) missingData.push("competitionEvidence");
    return {
      id: input.id.trim(),
      product: input.product.trim(),
      category: input.category.trim(),
      demandEvidence: structuredClone(input.demandEvidence ?? []),
      competitionEvidence: structuredClone(input.competitionEvidence ?? []),
      supplierCostCents: input.supplierCostCents ?? null,
      shippingCostCents: input.shippingCostCents ?? null,
      sellingPriceCents: input.sellingPriceCents ?? null,
      platformFeesCents: input.platformFeesCents ?? null,
      paymentFeesCents: input.paymentFeesCents ?? null,
      estimatedCacCents: input.estimatedCacCents ?? null,
      refundAllowanceCents: input.refundAllowanceCents ?? null,
      chargebackAllowanceCents: input.chargebackAllowanceCents ?? null,
      contributionMarginBasisPoints: input.contributionMarginBasisPoints ?? null,
      risks: [...(input.risks ?? [])],
      dataFreshness,
      evidenceQuality,
      missingData,
      executionAuthorized: false,
    };
  }
}