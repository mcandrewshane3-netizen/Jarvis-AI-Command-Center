export type EconomicScope = "REAL" | "PAPER" | "FORECAST";
export type EconomicProvenance = "VERIFIED" | "MANUALLY_ENTERED";

export type RealEconomicCategory =
  | "REPLIT_DEVELOPMENT_COST"
  | "REPLIT_OPERATING_COST"
  | "OPENAI_COST"
  | "XAI_COST"
  | "MARKET_DATA_COST"
  | "INFRASTRUCTURE_COST"
  | "COMMERCE_SOFTWARE_COST"
  | "ADVERTISING_COST"
  | "OTHER_OPERATING_EXPENSE"
  | "REALIZED_TRADING_PNL"
  | "REALIZED_COMMERCE_PNL"
  | "OTHER_ATTRIBUTABLE_REVENUE"
  | "REALIZED_COST_SAVING";

export type PaperEconomicCategory = "PAPER_TRADING_PNL" | "PAPER_COMMERCE_PNL";
export type ForecastEconomicCategory = "PROJECTED_REVENUE" | "PROJECTED_SAVING" | "PROJECTED_COST";

export interface EconomicEvidence {
  source: string;
  recordedAt: string;
  externalReference?: string;
  note?: string;
}

interface EconomicEntryBase {
  id: string;
  userId: string;
  amountCents: number;
  provenance: EconomicProvenance;
  evidence: EconomicEvidence;
}

export type ProjectEconomicEntry =
  | (EconomicEntryBase & { scope: "REAL"; category: RealEconomicCategory })
  | (EconomicEntryBase & { scope: "PAPER"; category: PaperEconomicCategory })
  | (EconomicEntryBase & { scope: "FORECAST"; category: ForecastEconomicCategory });

export interface ProjectEconomicsRepository {
  insert(entry: ProjectEconomicEntry): void;
  listByUser(userId: string): readonly ProjectEconomicEntry[];
}

/** A dependency-free repository for tests/local use. Production can supply a persistent repository. */
export class InMemoryProjectEconomicsRepository implements ProjectEconomicsRepository {
  private readonly entries = new Map<string, ProjectEconomicEntry[]>();

  insert(entry: ProjectEconomicEntry): void {
    const current = this.entries.get(entry.userId) ?? [];
    if (current.some(({ id }) => id === entry.id)) throw new Error("Duplicate economic entry id");
    current.push(structuredClone(entry));
    this.entries.set(entry.userId, current);
  }

  listByUser(userId: string): readonly ProjectEconomicEntry[] {
    return structuredClone(this.entries.get(userId) ?? []);
  }
}

export interface ProjectEconomicsSummary {
  currency: "USD";
  unit: "CENTS";
  totalDevelopmentInvestmentCents: number;
  totalOperatingCostCents: number;
  totalRealizedRevenueCents: number;
  totalRealizedProfitCents: number;
  netEconomicResultCents: number;
  breakEvenRemainingCents: number;
  jarvisRoiBasisPoints: number | null;
  paperPerformanceCents: number;
  forecastNetCents: number;
  status: "COMPLETE" | "INSUFFICIENT_DATA";
  missingData: string[];
  includedRealEntryIds: string[];
}

const DEVELOPMENT = new Set<RealEconomicCategory>(["REPLIT_DEVELOPMENT_COST"]);
const OPERATING = new Set<RealEconomicCategory>([
  "REPLIT_OPERATING_COST", "OPENAI_COST", "XAI_COST", "MARKET_DATA_COST", "INFRASTRUCTURE_COST",
  "COMMERCE_SOFTWARE_COST", "ADVERTISING_COST", "OTHER_OPERATING_EXPENSE",
]);
const REALIZED = new Set<RealEconomicCategory>([
  "REALIZED_TRADING_PNL", "REALIZED_COMMERCE_PNL", "OTHER_ATTRIBUTABLE_REVENUE", "REALIZED_COST_SAVING",
]);

function requireCents(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error("amountCents must be a safe integer");
}

function validateEntry(entry: ProjectEconomicEntry): void {
  if (!entry.id.trim() || !entry.userId.trim()) throw new Error("id and userId are required");
  requireCents(entry.amountCents);
  if (entry.amountCents < 0 && !["REALIZED_TRADING_PNL", "REALIZED_COMMERCE_PNL", "PAPER_TRADING_PNL", "PAPER_COMMERCE_PNL"].includes(entry.category)) {
    throw new Error("Costs and gross revenue entries cannot be negative");
  }
  if (!["VERIFIED", "MANUALLY_ENTERED"].includes(entry.provenance)) throw new Error("Invalid provenance");
  if (!entry.evidence.source.trim() || !Number.isFinite(Date.parse(entry.evidence.recordedAt))) {
    throw new Error("Truthful source provenance and timestamp are required");
  }
  if (entry.scope === "REAL" && !DEVELOPMENT.has(entry.category) && !OPERATING.has(entry.category) && !REALIZED.has(entry.category)) {
    throw new Error("Invalid REAL category");
  }
}

export class ProjectEconomicsService {
  constructor(private readonly repository: ProjectEconomicsRepository = new InMemoryProjectEconomicsRepository()) {}

  record(entry: ProjectEconomicEntry): ProjectEconomicEntry {
    validateEntry(entry);
    this.repository.insert(entry);
    return structuredClone(entry);
  }

  list(userId: string, scope?: EconomicScope): ProjectEconomicEntry[] {
    if (!userId.trim()) throw new Error("userId is required");
    return this.repository.listByUser(userId).filter((entry) => !scope || entry.scope === scope);
  }

  summarize(userId: string): ProjectEconomicsSummary {
    const entries = this.list(userId);
    const real = entries.filter((entry): entry is Extract<ProjectEconomicEntry, { scope: "REAL" }> => entry.scope === "REAL");
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    const development = sum(real.filter((entry) => DEVELOPMENT.has(entry.category)).map((entry) => entry.amountCents));
    const operating = sum(real.filter((entry) => OPERATING.has(entry.category)).map((entry) => entry.amountCents));
    const realized = sum(real.filter((entry) => REALIZED.has(entry.category)).map((entry) => entry.amountCents));
    const investment = development + operating;
    const net = realized - investment;
    const missingData = real.length === 0 ? ["REAL_ECONOMIC_ENTRIES"] : [];
    if (investment === 0) missingData.push("INVESTMENT_FOR_ROI");
    const paper = sum(entries.filter((entry) => entry.scope === "PAPER").map((entry) => entry.amountCents));
    const forecast = sum(entries.filter((entry) => entry.scope === "FORECAST").map((entry) =>
      entry.category === "PROJECTED_COST" ? -entry.amountCents : entry.amountCents));
    return {
      currency: "USD",
      unit: "CENTS",
      totalDevelopmentInvestmentCents: development,
      totalOperatingCostCents: operating,
      totalRealizedRevenueCents: realized,
      totalRealizedProfitCents: realized,
      netEconomicResultCents: net,
      breakEvenRemainingCents: Math.max(0, -net),
      jarvisRoiBasisPoints: investment === 0 ? null : Math.trunc((net * 10_000) / investment),
      paperPerformanceCents: paper,
      forecastNetCents: forecast,
      status: missingData.length ? "INSUFFICIENT_DATA" : "COMPLETE",
      missingData,
      includedRealEntryIds: real.map(({ id }) => id),
    };
  }
}