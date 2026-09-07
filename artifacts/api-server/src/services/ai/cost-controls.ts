export type CostControlMode = "NORMAL" | "SMART" | "MAX";

const HARD_MIN_OUTPUT_TOKENS = 256;
const HARD_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_PROVIDER_CEILING = 3000;

const MODE_OUTPUT_BUDGETS: Record<CostControlMode, number> = {
  NORMAL: 900,
  SMART: 1800,
  MAX: 3000,
};

export function providerOutputCeiling(raw = process.env.JARVIS_MAX_OUTPUT_TOKENS): number {
  if (!raw) return DEFAULT_PROVIDER_CEILING;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PROVIDER_CEILING;
  return Math.min(HARD_MAX_OUTPUT_TOKENS, Math.max(HARD_MIN_OUTPUT_TOKENS, parsed));
}

export function outputBudgetForMode(mode: CostControlMode, raw?: string): number {
  return Math.min(MODE_OUTPUT_BUDGETS[mode], providerOutputCeiling(raw));
}

export function boundedProviderOutputTokens(requested?: number, raw?: string): number {
  const ceiling = providerOutputCeiling(raw);
  if (!Number.isFinite(requested)) return ceiling;
  return Math.min(ceiling, Math.max(HARD_MIN_OUTPUT_TOKENS, Math.floor(requested!)));
}
