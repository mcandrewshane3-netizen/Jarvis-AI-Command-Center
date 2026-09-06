export type CommerceContentKind =
  | "POSITIONING" | "CONTENT_IDEA" | "HOOK" | "VIDEO_SCRIPT" | "CAPTION"
  | "CREATIVE_VARIANT" | "CONTENT_CALENDAR" | "AB_VARIANT";

export interface CommerceContentRequest {
  kind: CommerceContentKind;
  instruction: string;
  productFacts: readonly string[];
  substantiatedClaims?: readonly string[];
  sourceMaterial?: readonly { text: string; permission: "OWNED" | "LICENSED" | "PUBLIC_DOMAIN" }[];
}

export type CommerceContentDecision =
  | { allowed: true; status: "DRAFT_ONLY"; publishingAuthorized: false; safeFacts: string[] }
  | { allowed: false; status: "REJECTED"; publishingAuthorized: false; reasons: string[] };

const CONTENT_GUARDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(fake|fabricat(?:e|ed)|invent)\b.{0,30}\b(reviews?|testimonials?|customers?)\b/i, "FAKE_SOCIAL_PROOF"],
  [/\b(pretend|pose|impersonate|act)\b.{0,30}\b(customer|buyer|reviewer)\b/i, "CUSTOMER_IMPERSONATION"],
  [/\b(steal|copy|rip|reupload)\b.{0,40}\b(creator|copyright|video|content)\b/i, "UNAUTHORIZED_CREATOR_CONTENT"],
  [/\b(guarantee[ds]?|cures?|clinically proven|risk[- ]free)\b/i, "UNSUBSTANTIATED_PRODUCT_CLAIM"],
];

/** Applies policy before any future model call. It neither generates nor publishes content. */
export class CommerceContentEngine {
  evaluate(request: CommerceContentRequest): CommerceContentDecision {
    if (!request.instruction.trim()) throw new Error("Content instruction is required");
    const reasons = CONTENT_GUARDS
      .filter(([pattern]) => pattern.test(request.instruction))
      .map(([, reason]) => reason);
    if ((request.sourceMaterial ?? []).some(({ permission }) => !["OWNED", "LICENSED", "PUBLIC_DOMAIN"].includes(permission))) {
      reasons.push("SOURCE_PERMISSION_REQUIRED");
    }
    const substantiated = new Set(request.substantiatedClaims ?? []);
    const unsupportedFacts = request.productFacts.filter((fact) =>
      /\b(guarantee[ds]?|cures?|clinically proven|risk[- ]free)\b/i.test(fact) && !substantiated.has(fact));
    if (unsupportedFacts.length) reasons.push("UNSUBSTANTIATED_PRODUCT_CLAIM");
    if (reasons.length) {
      return { allowed: false, status: "REJECTED", publishingAuthorized: false, reasons: [...new Set(reasons)] };
    }
    return {
      allowed: true,
      status: "DRAFT_ONLY",
      publishingAuthorized: false,
      safeFacts: [...request.productFacts],
    };
  }
}