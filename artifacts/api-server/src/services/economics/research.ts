export type EconomicOpportunityClass =
  | "TRADING" | "ECOMMERCE" | "SOFTWARE" | "SERVICE_BUSINESS" | "REAL_ESTATE" | "OTHER";

export interface EconomicEvidenceReference {
  source: string;
  retrievedAt: string;
  summary: string;
  authority: "OFFICIAL" | "REGULATORY" | "COMPANY" | "REPORTING" | "WEB" | "SOCIAL";
}

export interface EconomicResearchRecord {
  id: string;
  userId: string;
  question: string;
  decision: string | null;
  sources: readonly EconomicEvidenceReference[];
  freshness: "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
  conflictingEvidence: readonly string[];
  uncertainty: readonly string[];
  assumptions: readonly string[];
  modelsUsed: readonly string[];
  dataUsed: readonly string[];
  outcomeLater: string | null;
  recordedAt: string;
}

export interface EconomicOpportunityInput {
  id: string;
  opportunityClass: EconomicOpportunityClass;
  capitalRequiredCents: number | null;
  expectedReturnRangeBasisPoints: readonly [number, number] | null;
  downsideCents: number | null;
  liquidity: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  timeRequirementHoursPerWeek: number | null;
  evidenceQuality: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  scalability: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  automationPotential: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  timeToCashFlowDays: number | null;
  evidence: readonly EconomicEvidenceReference[];
}

export interface EconomicOpportunityAnalysis extends EconomicOpportunityInput {
  status: "ANALYZED" | "INSUFFICIENT_EVIDENCE";
  executionAuthorized: false;
  missingData: string[];
}

/** Analytical only: preserves supplied facts and never supplies an expected return. */
export class EconomicOpportunityEngine {
  analyze(input: EconomicOpportunityInput): EconomicOpportunityAnalysis {
    if (!input.id.trim()) throw new Error("Opportunity id is required");
    for (const value of [input.capitalRequiredCents, input.downsideCents]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Money must be non-negative integer cents");
    }
    if (input.expectedReturnRangeBasisPoints &&
        (!input.evidence.length || input.expectedReturnRangeBasisPoints.some((value) => !Number.isSafeInteger(value)) ||
         input.expectedReturnRangeBasisPoints[0] > input.expectedReturnRangeBasisPoints[1])) {
      throw new Error("Expected return ranges require evidence and a valid range");
    }
    const missingData: string[] = [];
    if (input.capitalRequiredCents === null) missingData.push("CAPITAL_REQUIRED");
    if (input.expectedReturnRangeBasisPoints === null) missingData.push("EXPECTED_RETURN_RANGE");
    if (input.downsideCents === null) missingData.push("DOWNSIDE");
    if (!input.evidence.length || input.evidenceQuality === "INSUFFICIENT") missingData.push("SUPPORTING_EVIDENCE");
    return {
      ...structuredClone(input),
      status: missingData.length ? "INSUFFICIENT_EVIDENCE" : "ANALYZED",
      executionAuthorized: false,
      missingData,
    };
  }
}