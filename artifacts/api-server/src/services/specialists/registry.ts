import type { ProviderCapability } from "../ai/provider";
import { isCurrentTradableMarketRequest } from "../current-market-intent";

export const SPECIALIST_DOMAINS = [
  "GENERAL",
  "FINANCE",
  "RESEARCH",
  "CAREER",
  "WORK",
  "BUSINESS",
  "SOFTWARE",
  "MARKETS",
  "PERSONAL",
  "AUTOMATIONS",
] as const;

export type SpecialistDomain = (typeof SPECIALIST_DOMAINS)[number];

export type StructuredOutputSchema = {
  type: "object";
  required: readonly string[];
  properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  additionalProperties: false;
};

export type SpecialistDeclaration = {
  id: SpecialistDomain;
  name: string;
  supportedIntents: readonly string[];
  relevantTools: readonly string[];
  contextCategories: readonly string[];
  preferredProviderCapabilities: readonly ProviderCapability[];
  structuredOutputSchemas: Readonly<Record<string, StructuredOutputSchema>>;
  safetyConstraints: readonly string[];
  autonomousActionsAllowed: boolean;
  confirmationRequired: boolean;
};

const answerSchema = (domain: SpecialistDomain): StructuredOutputSchema => ({
  type: "object",
  required: ["summary", "recommendations", "risks"],
  properties: {
    summary: { type: "string", description: `${domain} analysis summary` },
    recommendations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
});

const actionPlanSchema: StructuredOutputSchema = {
  type: "object",
  required: ["goal", "actions"],
  properties: {
    goal: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "impact"],
        properties: {
          description: { type: "string" },
          impact: { enum: ["LOW", "MEDIUM", "HIGH"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

function declaration(input: Omit<SpecialistDeclaration, "structuredOutputSchemas">): SpecialistDeclaration {
  return {
    ...input,
    structuredOutputSchemas: {
      analysis: answerSchema(input.id),
      actionPlan: actionPlanSchema,
    },
  };
}

export const SPECIALIST_REGISTRY: Readonly<Record<SpecialistDomain, SpecialistDeclaration>> = {
  GENERAL: declaration({
    id: "GENERAL",
    name: "General Coordinator",
    supportedIntents: ["general questions", "planning", "cross-domain coordination"],
    relevantTools: ["knowledge_search"],
    contextCategories: ["PROFILE", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "STRUCTURED_OUTPUT"],
    safetyConstraints: ["State uncertainty and never imply an unavailable capability."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  FINANCE: declaration({
    id: "FINANCE",
    name: "Personal Finance Specialist",
    supportedIntents: ["budgeting", "cash flow", "debt", "saving", "personal financial planning"],
    relevantTools: ["financial_calculator", "account_reader"],
    contextCategories: ["FINANCE", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "STRUCTURED_OUTPUT", "TOOL_USE"],
    safetyConstraints: ["Never move money or claim account access without an authorized tool.", "Present analysis, not guaranteed financial outcomes."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  RESEARCH: declaration({
    id: "RESEARCH",
    name: "Research Specialist",
    supportedIntents: ["fact finding", "source comparison", "investigation", "evidence review"],
    relevantTools: ["web_search", "document_search"],
    contextCategories: ["PROJECT", "PREFERENCE"],
    preferredProviderCapabilities: ["WEB_RESEARCH", "LONG_CONTEXT", "REASONING"],
    safetyConstraints: ["Distinguish sourced facts, inference, and uncertainty.", "Do not fabricate citations."],
    autonomousActionsAllowed: false,
    confirmationRequired: false,
  }),
  CAREER: declaration({
    id: "CAREER",
    name: "Career Specialist",
    supportedIntents: ["job search", "resume", "interviews", "compensation", "career change"],
    relevantTools: ["document_search", "job_search"],
    contextCategories: ["CAREER", "PROFILE", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "LONG_CONTEXT", "STRUCTURED_OUTPUT"],
    safetyConstraints: ["Do not submit applications or represent the user without confirmation."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  WORK: declaration({
    id: "WORK",
    name: "Work Specialist",
    supportedIntents: ["tasks", "projects", "meetings", "deadlines", "work prioritization"],
    relevantTools: ["calendar_reader", "task_manager"],
    contextCategories: ["WORK", "PROJECT", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "FUNCTION_CALLING", "STRUCTURED_OUTPUT"],
    safetyConstraints: ["Do not send messages, alter calendars, or modify tasks without confirmation."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  BUSINESS: declaration({
    id: "BUSINESS",
    name: "Business Specialist",
    supportedIntents: ["business planning", "operations", "pricing", "sales", "company strategy"],
    relevantTools: ["financial_calculator", "document_search", "web_search"],
    contextCategories: ["BUSINESS", "PROJECT", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "STRUCTURED_OUTPUT", "LONG_CONTEXT"],
    safetyConstraints: ["Identify assumptions and avoid guarantees about commercial outcomes.", "Contracts and external commitments require confirmation."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  SOFTWARE: declaration({
    id: "SOFTWARE",
    name: "Software Engineering Specialist",
    supportedIntents: ["coding", "debugging", "architecture", "APIs", "security review"],
    relevantTools: ["code_search", "file_editor", "test_runner"],
    contextCategories: ["SOFTWARE", "PROJECT", "WORK"],
    preferredProviderCapabilities: ["CODING", "TOOL_USE", "LONG_CONTEXT"],
    safetyConstraints: ["Preserve security boundaries and do not claim code was executed unless a tool confirms it.", "Destructive changes require confirmation."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  MARKETS: declaration({
    id: "MARKETS",
    name: "Markets Specialist",
    supportedIntents: ["stocks", "securities", "market data", "portfolio analysis", "investment research"],
    relevantTools: ["market_data", "web_search"],
    contextCategories: ["MARKETS", "PREFERENCE"],
    preferredProviderCapabilities: ["WEB_RESEARCH", "REASONING", "TOOL_USE"],
    safetyConstraints: ["Never place or imply a trade.", "Label stale or unavailable market data and avoid guaranteed returns."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  PERSONAL: declaration({
    id: "PERSONAL",
    name: "Personal Organization Specialist",
    supportedIntents: ["habits", "routines", "personal planning", "family reminders"],
    relevantTools: ["calendar_reader", "reminder_manager"],
    contextCategories: ["PERSONAL", "PROFILE", "PREFERENCE"],
    preferredProviderCapabilities: ["REASONING", "FUNCTION_CALLING"],
    safetyConstraints: ["Use private information only when relevant and never claim a reminder was created without tool evidence."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
  AUTOMATIONS: declaration({
    id: "AUTOMATIONS",
    name: "Automations Specialist",
    supportedIntents: ["workflows", "triggers", "schedules", "recurring rules"],
    relevantTools: ["automation_manager", "scheduler"],
    contextCategories: ["AUTOMATIONS", "PROJECT", "PREFERENCE"],
    preferredProviderCapabilities: ["FUNCTION_CALLING", "TOOL_USE", "STRUCTURED_OUTPUT"],
    safetyConstraints: ["Automations must be bounded, auditable, and reversible.", "Never claim background execution or monitoring.", "Creation and activation require confirmation."],
    autonomousActionsAllowed: false,
    confirmationRequired: true,
  }),
};

export const specialists = SPECIALIST_REGISTRY;

const DOMAIN_PATTERNS: Readonly<Record<Exclude<SpecialistDomain, "GENERAL">, RegExp>> = {
  FINANCE: /\b(budget|budgeting|cash ?flow|debt|loan|mortgage|saving|savings|paycheck|personal finances?|financial|expenses?|retirement)\b/i,
  RESEARCH: /\b(research|investigate|evidence|sources?|fact[- ]?check|due diligence|compare|study|find out|latest|explain|history|adoption|roadmap|regulation|analysts?)\b/i,
  CAREER: /\b(career|resume|cv|job search|job offer|interview|salary negotiation|promotion|recruiter|employment)\b/i,
  WORK: /\b(work tasks?|work project|deadline|meeting|coworker|client|prioriti[sz]e|project plan|deliverable)\b/i,
  BUSINESS: /\b(business|startup|company strategy|business plan|revenue|pricing|customers?|sales|operations|go-to-market|market fit|profit margin)\b/i,
  SOFTWARE: /\b(code|coding|software|typescript|javascript|python|api|database|debug|bug|deploy|repository|architecture|programming)\b/i,
  MARKETS: /\b(stocks?|shares?|securit(?:y|ies)|ticker|options?|bonds?|portfolio|brokerage|trade|trading|market (?:price|data|news)|invest(?:ing|ment|or))\b/i,
  PERSONAL: /\b(personal|habit|routine|family|home|meal plan|wellbeing|remind me|birthday)\b/i,
  AUTOMATIONS: /\b(automat(?:e|ion|ions)|workflow|trigger|recurring|schedule automatically|every (?:day|week|month)|background job)\b/i,
};

const DOMAIN_PRIORITY: readonly SpecialistDomain[] = [
  "CAREER", "FINANCE", "SOFTWARE", "MARKETS", "RESEARCH",
  "BUSINESS", "WORK", "PERSONAL", "AUTOMATIONS",
];

export type SpecialistRoute = {
  primary: SpecialistDomain;
  collaborators: SpecialistDomain[];
  specialists: SpecialistDomain[];
  contextCategories: string[];
};

function matchedDomains(request: string): SpecialistDomain[] {
  return DOMAIN_PRIORITY.filter((domain) =>
    domain !== "GENERAL" && (
      DOMAIN_PATTERNS[domain].test(request) ||
      (domain === "MARKETS" && isCurrentTradableMarketRequest(request))
    )
  );
}

/**
 * Routes solely from the supplied text. Ordering and collaboration are stable,
 * so identical text always produces the same route.
 */
export function routeSpecialists(request: string): SpecialistRoute {
  const matches = matchedDomains(request);
  const primary = matches[0] ?? "GENERAL";
  const allowedPairs = new Set([
    "BUSINESS:FINANCE", "CAREER:FINANCE", "BUSINESS:RESEARCH",
    "BUSINESS:SOFTWARE", "MARKETS:RESEARCH",
  ]);
  const specialists = [primary];
  for (const candidate of matches) {
    if (candidate === primary) continue;
    const pair = [primary, candidate].sort().join(":");
    if (allowedPairs.has(pair)) specialists.push(candidate);
  }
  const uniqueSpecialists = [...new Set(specialists)];
  return {
    primary,
    collaborators: uniqueSpecialists.slice(1),
    specialists: uniqueSpecialists,
    contextCategories: getContextCategories(uniqueSpecialists),
  };
}

export const routeSpecialistIntent = routeSpecialists;

export function getContextCategories(domains: readonly SpecialistDomain[]): string[] {
  return [...new Set(domains.flatMap((domain) => SPECIALIST_REGISTRY[domain].contextCategories))];
}

export type SpecialistContextItem = {
  category: string;
  content: string;
  enabled?: boolean;
};

/** Selects only category-allowed context; content is never broadened from GENERAL. */
export function minimizeContext<T extends SpecialistContextItem>(
  items: readonly T[],
  route: Pick<SpecialistRoute, "contextCategories">,
): T[] {
  const allowed = new Set(route.contextCategories);
  return items.filter((item) => item.enabled !== false && allowed.has(item.category));
}

export type ActionStatus =
  | "PLANNED"
  | "READY"
  | "REQUIRES_USER"
  | "AUTHORIZED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type ActionImpact = "LOW" | "MEDIUM" | "HIGH";

export type ToolConfirmation = {
  tool: string;
  executionId: string;
  confirmedAt: string;
};

export type ActionPlanStep = {
  id: string;
  specialist: SpecialistDomain;
  description: string;
  impact: ActionImpact;
  status: ActionStatus;
  requiresUser: boolean;
  requiresTool: boolean;
  userConfirmed: boolean;
  toolConfirmation?: ToolConfirmation;
  error?: string;
};

export type ActionDependency = {
  stepId: string;
  dependsOn: string;
};

export type ActionPlan = {
  id: string;
  goal: string;
  specialists: SpecialistDomain[];
  steps: ActionPlanStep[];
  dependencies: ActionDependency[];
  status: ActionStatus;
  requiresUser: boolean;
  requiresTool: boolean;
  risk: ActionImpact;
  nextAction: string | null;
  backgroundAutonomy: false;
};

export function createActionPlan(input: {
  id: string;
  goal: string;
  steps: Array<Omit<ActionPlanStep, "status" | "requiresUser" | "requiresTool" | "userConfirmed" | "toolConfirmation"> & {
    requiresUser?: boolean;
    requiresTool?: boolean;
  }>;
  dependencies?: ActionDependency[];
  nextAction?: string | null;
}): ActionPlan {
  const steps = input.steps.map((step) => {
    const requiresUser = step.impact === "HIGH" || step.requiresUser === true;
    return {
      ...step,
      requiresUser,
      requiresTool: step.requiresTool ?? true,
      userConfirmed: false,
      status: requiresUser ? "REQUIRES_USER" as const : "READY" as const,
    };
  });
  const requiresUser = steps.some((step) => step.requiresUser);
  return {
    id: input.id,
    goal: input.goal,
    specialists: [...new Set(steps.map((step) => step.specialist))],
    steps,
    dependencies: [...(input.dependencies ?? [])],
    status: requiresUser ? "REQUIRES_USER" : "READY",
    requiresUser,
    requiresTool: steps.some((step) => step.requiresTool),
    risk: steps.some((step) => step.impact === "HIGH")
      ? "HIGH"
      : steps.some((step) => step.impact === "MEDIUM") ? "MEDIUM" : "LOW",
    nextAction: input.nextAction ?? steps[0]?.description ?? null,
    backgroundAutonomy: false,
  };
}

export type ActionStatusUpdate = {
  status: ActionStatus;
  userConfirmed?: boolean;
  toolConfirmation?: ToolConfirmation;
  error?: string;
};

function planStatus(steps: readonly ActionPlanStep[]): ActionStatus {
  if (steps.some((step) => step.status === "FAILED")) return "FAILED";
  if (steps.every((step) => step.status === "COMPLETED")) return "COMPLETED";
  if (steps.some((step) => step.status === "RUNNING")) return "RUNNING";
  if (steps.some((step) => step.status === "REQUIRES_USER")) return "REQUIRES_USER";
  if (steps.some((step) => step.status === "AUTHORIZED")) return "AUTHORIZED";
  if (steps.every((step) => step.status === "PLANNED")) return "PLANNED";
  return "READY";
}

export function updateActionStepStatus(
  plan: ActionPlan,
  stepId: string,
  update: ActionStatusUpdate,
): ActionPlan {
  const index = plan.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error("ACTION_STEP_NOT_FOUND");
  const current = plan.steps[index];
  const userConfirmed = current.userConfirmed || update.userConfirmed === true;
  if (current.requiresUser && !current.userConfirmed && update.userConfirmed === true &&
      update.status !== "AUTHORIZED" && update.status !== "READY") {
    throw new Error("CONFIRMATION_MUST_AUTHORIZE_STEP");
  }
  if (current.requiresUser && !userConfirmed && update.status !== "REQUIRES_USER") {
    throw new Error("USER_CONFIRMATION_REQUIRED");
  }
  if (update.status === "COMPLETED" && !update.toolConfirmation) {
    throw new Error("TOOL_CONFIRMATION_REQUIRED");
  }
  if (update.status === "COMPLETED" &&
      (!update.toolConfirmation?.tool || !update.toolConfirmation.executionId || !update.toolConfirmation.confirmedAt)) {
    throw new Error("INVALID_TOOL_CONFIRMATION");
  }
  const next: ActionPlanStep = {
    ...current,
    status: update.status,
    userConfirmed,
    ...(update.toolConfirmation ? { toolConfirmation: update.toolConfirmation } : {}),
    ...(update.error ? { error: update.error } : {}),
  };
  const steps = plan.steps.map((step, stepIndex) => stepIndex === index ? next : step);
  return {
    ...plan,
    backgroundAutonomy: false,
    steps,
    status: planStatus(steps),
    nextAction: steps.find((step) => step.status !== "COMPLETED" && step.status !== "FAILED")?.description ?? null,
  };
}

/** Backwards-friendly verb for callers updating one typed action-plan step. */
export const updateActionStatus = updateActionStepStatus;

export type PreparationStatus =
  | "QUEUED"
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "WAITING_FOR_TOOL"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED";

export type Preparation = {
  id: string;
  description: string;
  status: PreparationStatus;
  backgroundAutonomy: false;
};

export function createPreparation(id: string, description: string): Preparation {
  return { id, description, status: "QUEUED", backgroundAutonomy: false };
}

export function updatePreparationStatus(
  preparation: Preparation,
  status: PreparationStatus,
): Preparation {
  return { ...preparation, status, backgroundAutonomy: false };
}