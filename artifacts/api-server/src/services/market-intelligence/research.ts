import type { DataFreshness } from "./types";

export interface ResearchGateInput {
  cacheKey: string;
  candidateQuality: number;
  tradeSignificance: number;
  dataCompleteness: number;
  strategySupport: number;
  freshness: DataFreshness;
  estimatedCostUsd: number;
  informationVersion: string;
}
export interface ResearchCacheEntry<T = unknown> {
  value: T;
  createdAt: string;
  informationVersion: string;
}
export type ResearchGateDecision<T = unknown> =
  | { action: "ANALYZE"; reason: "QUALIFIED"; cached: null }
  | { action: "REUSE_CACHE"; reason: "RECENT_UNCHANGED_RESEARCH"; cached: T }
  | { action: "SKIP"; reason: string; cached: null };

export interface AIResearchGateConfig {
  minimumCandidateQuality: number;
  minimumTradeSignificance: number;
  minimumDataCompleteness: number;
  minimumStrategySupport: number;
  maximumCostUsd: number;
  cacheTtlMs: number;
}

const GATE_DEFAULTS: AIResearchGateConfig = {
  minimumCandidateQuality: 70, minimumTradeSignificance: 40, minimumDataCompleteness: 0.9,
  minimumStrategySupport: 0.7, maximumCostUsd: 0.1, cacheTtlMs: 30 * 60_000,
};

export class AIResearchGate<T = unknown> {
  private readonly cache = new Map<string, ResearchCacheEntry<T>>();
  constructor(private readonly config: AIResearchGateConfig = GATE_DEFAULTS) {}

  put(key: string, value: T, informationVersion: string, createdAt = new Date()): void {
    this.cache.set(key, { value: structuredClone(value), informationVersion, createdAt: createdAt.toISOString() });
  }

  evaluate(input: ResearchGateInput, now = new Date()): ResearchGateDecision<T> {
    const numeric = [
      input.candidateQuality, input.tradeSignificance, input.dataCompleteness,
      input.strategySupport, input.estimatedCostUsd,
    ];
    if (numeric.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Invalid research gate input");
    if (!["LIVE_OR_CURRENT", "DELAYED"].includes(input.freshness)) return { action: "SKIP", reason: "DATA_NOT_FRESH", cached: null };
    if (input.candidateQuality < this.config.minimumCandidateQuality) return { action: "SKIP", reason: "CANDIDATE_QUALITY_LOW", cached: null };
    if (input.tradeSignificance < this.config.minimumTradeSignificance) return { action: "SKIP", reason: "TRADE_SIGNIFICANCE_LOW", cached: null };
    if (input.dataCompleteness < this.config.minimumDataCompleteness) return { action: "SKIP", reason: "INCOMPLETE_DATA", cached: null };
    if (input.strategySupport < this.config.minimumStrategySupport) return { action: "SKIP", reason: "STRATEGY_SUPPORT_LOW", cached: null };
    if (input.estimatedCostUsd > this.config.maximumCostUsd) return { action: "SKIP", reason: "COST_LIMIT", cached: null };
    const cached = this.cache.get(input.cacheKey);
    if (cached && cached.informationVersion === input.informationVersion &&
        now.getTime() - Date.parse(cached.createdAt) <= this.config.cacheTtlMs) {
      return { action: "REUSE_CACHE", reason: "RECENT_UNCHANGED_RESEARCH", cached: structuredClone(cached.value) };
    }
    return { action: "ANALYZE", reason: "QUALIFIED", cached: null };
  }
}

export interface GrokMarketResearch {
  provider: "GROK";
  summary: string;
  bullishEvidence: readonly string[];
  bearishEvidence: readonly string[];
  catalysts: readonly string[];
  risks: readonly string[];
  uncertainties: readonly string[];
  freshness: DataFreshness;
  sourceReferences: readonly string[];
}
export interface OpenAIMarketAnalysis {
  provider: "OPENAI";
  thesis: string;
  counterThesis: string;
  riskFactors: readonly string[];
  missingEvidence: readonly string[];
  invalidationConditions: readonly string[];
  evidenceQuality: number;
}
export interface BullCase { evidence: readonly string[]; thesis: string; confidence: number }
export interface BearCase { evidence: readonly string[]; counterThesis: string; confidence: number }
export type ModelAgreementState =
  | "STRONG_AGREEMENT" | "PARTIAL_AGREEMENT" | "MIXED" | "STRONG_DISAGREEMENT" | "INSUFFICIENT_INFORMATION";
export interface StructuredModelView { direction: "BULLISH" | "BEARISH" | "NEUTRAL"; confidence: number; evidenceCount: number }

export function modelAgreement(openAI: StructuredModelView | null, grok: StructuredModelView | null): ModelAgreementState {
  if (!openAI || !grok || openAI.evidenceCount === 0 || grok.evidenceCount === 0) return "INSUFFICIENT_INFORMATION";
  if (openAI.direction !== grok.direction && openAI.direction !== "NEUTRAL" && grok.direction !== "NEUTRAL") {
    return openAI.confidence >= 0.7 && grok.confidence >= 0.7 ? "STRONG_DISAGREEMENT" : "MIXED";
  }
  if (openAI.direction === grok.direction) {
    return openAI.confidence >= 0.8 && grok.confidence >= 0.8 ? "STRONG_AGREEMENT" : "PARTIAL_AGREEMENT";
  }
  return "MIXED";
}

export interface Synthesis {
  decision: "QUALIFIED" | "NO_TRADE";
  agreement: ModelAgreementState;
  maximumRiskMultiplier: number;
  rationaleSummary: readonly string[];
}

export function synthesizeResearch(
  bull: BullCase, bear: BearCase, openAI: StructuredModelView | null, grok: StructuredModelView | null,
): Synthesis {
  const agreement = modelAgreement(openAI, grok);
  const maximumRiskMultiplier = agreement === "STRONG_DISAGREEMENT" ? 0
    : agreement === "MIXED" || agreement === "INSUFFICIENT_INFORMATION" ? 0.5 : agreement === "PARTIAL_AGREEMENT" ? 0.75 : 1;
  return {
    decision: maximumRiskMultiplier === 0 || bear.confidence > bull.confidence ? "NO_TRADE" : "QUALIFIED",
    agreement, maximumRiskMultiplier,
    rationaleSummary: [`Bull evidence: ${bull.evidence.length}`, `Bear evidence: ${bear.evidence.length}`, `Agreement: ${agreement}`],
  };
}