import type { SpecialistDomain } from "./registry";

export type RecordSource = "MANUAL" | "CONNECTED" | "SYSTEM";
export type ConfidenceBand = "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";

export type EvidenceItem = {
  claim: string;
  sourceTitle?: string;
  sourceUrl?: string;
  checkedAt?: string;
  verified: boolean;
};

export type ResearchResult = {
  topic: string;
  summary: string;
  keyFindings: string[];
  evidence: EvidenceItem[];
  conflictingEvidence: EvidenceItem[];
  uncertainties: string[];
  sources: Array<{ title: string; url?: string }>;
  dateChecked: string;
  confidenceBand: ConfidenceBand;
};

export type CareerRole = {
  employer: string;
  title: string;
  startDate?: string;
  endDate?: string;
  achievements: string[];
};

export type CareerProfile = {
  source: "USER_PROVIDED";
  workHistory: CareerRole[];
  skills: string[];
  certifications: string[];
  industries: string[];
  equipment: string[];
  software: string[];
  achievements: string[];
  preferredJobs: string[];
  locations: string[];
  salaryTargets: Array<{ currency: string; minimum?: number; target?: number }>;
};

export type BusinessActionStatus =
  | "PLANNED"
  | "READY"
  | "REQUIRES_USER"
  | "AUTHORIZED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type BusinessProject = {
  name: string;
  objective: string;
  assumptions: string[];
  targetCustomers: string[];
  status: BusinessActionStatus;
  nextActions: string[];
};

export type BusinessModel = {
  customerProblem: string;
  solution: string;
  valueProposition: string;
  channels: string[];
  revenueStreams: string[];
  costStructure: string[];
};

export type Offer = {
  name: string;
  customerSegment: string;
  deliverables: string[];
  priceCents?: number;
  currency: "USD";
};

export type PricingPlan = {
  name: string;
  priceCents?: number;
  billingPeriod: "ONE_TIME" | "WEEKLY" | "MONTHLY" | "ANNUAL";
  assumptions: string[];
};

export type StartupBudget = {
  currency: "USD";
  items: Array<{ name: string; amountCents: number; required: boolean }>;
};

export type StandardOperatingProcedure = {
  name: string;
  purpose: string;
  steps: string[];
  owner: string;
  reviewCadence?: string;
};

export type BusinessKpi = {
  name: string;
  definition: string;
  target?: number;
  actual?: number;
  unit: string;
  asOf?: string;
};

export type BusinessRisk = {
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH";
  mitigation: string;
};

export type SoftwareProject = {
  name: string;
  purpose: string;
  projectBoundary: "CURRENT_JARVIS" | "UNRELATED_PROJECT";
  status: "PLANNING" | "READY" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  requirements: string[];
};

export type SoftwareRequirement = {
  projectId: string;
  description: string;
  priority: "MUST" | "SHOULD" | "COULD" | "WONT";
  acceptanceCriteria: string[];
};

export type SoftwareFeature = {
  projectId: string;
  name: string;
  userStories: string[];
  dependencies: string[];
};

export type ArchitectureDecision = {
  projectId: string;
  title: string;
  context: string;
  decision: string;
  consequences: string[];
};

export type ApiContract = {
  projectId: string;
  method: string;
  path: string;
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
};

export type SpecialistRecordEnvelope<T extends Record<string, unknown>> = {
  id: string;
  specialist: SpecialistDomain;
  recordType: string;
  title: string;
  status: string;
  source: RecordSource;
  data: T;
  createdAt: string;
  updatedAt: string;
};