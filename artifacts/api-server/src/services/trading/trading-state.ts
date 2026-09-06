import { canSubmit, type ExecutionMode } from "./risk-engine";

export const EXECUTION_MODES = [
  "RESEARCH_ONLY",
  "APPROVAL_REQUIRED",
  "AGENTIC_AUTO",
] as const satisfies readonly ExecutionMode[];

export type TradingState = {
  executionMode: ExecutionMode;
  killSwitchActive: boolean;
  updatedAt: Date;
};

export type TradingCapabilities = {
  robinhoodConnected: boolean;
  liveExecutionConfigured: boolean;
  agenticAutoAvailable: boolean;
  agenticAutoUnavailableReason: string | null;
};

export type LiveSubmissionDecision = {
  allowed: boolean;
  reason:
    | "ALLOWED"
    | "KILL_SWITCH_ACTIVE"
    | "RESEARCH_ONLY"
    | "RISK_REJECTED"
    | "APPROVAL_REQUIRED"
    | "BROKER_NOT_CONNECTED"
    | "LIVE_EXECUTION_NOT_CONFIGURED";
};

export const TRADING_CAPABILITIES: TradingCapabilities = {
  robinhoodConnected: false,
  liveExecutionConfigured: false,
  agenticAutoAvailable: false,
  agenticAutoUnavailableReason: "ROBINHOOD_NOT_CONNECTED",
};

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === "string" && EXECUTION_MODES.includes(value as ExecutionMode);
}

export function validateExecutionModeTransition(
  requestedMode: unknown,
  capabilities: TradingCapabilities = TRADING_CAPABILITIES,
): { allowed: true; mode: ExecutionMode } | { allowed: false; reason: string } {
  if (!isExecutionMode(requestedMode)) {
    return { allowed: false, reason: "INVALID_EXECUTION_MODE" };
  }
  if (requestedMode === "AGENTIC_AUTO" && !capabilities.agenticAutoAvailable) {
    return {
      allowed: false,
      reason: capabilities.agenticAutoUnavailableReason ?? "AGENTIC_AUTO_UNAVAILABLE",
    };
  }
  return { allowed: true, mode: requestedMode };
}

export function evaluateLiveSubmission(input: {
  state: Pick<TradingState, "executionMode" | "killSwitchActive">;
  riskApproved: boolean;
  userApproved: boolean;
  capabilities?: TradingCapabilities;
}): LiveSubmissionDecision {
  const capabilities = input.capabilities ?? TRADING_CAPABILITIES;
  if (input.state.killSwitchActive) return { allowed: false, reason: "KILL_SWITCH_ACTIVE" };
  if (input.state.executionMode === "RESEARCH_ONLY") return { allowed: false, reason: "RESEARCH_ONLY" };
  if (!input.riskApproved) return { allowed: false, reason: "RISK_REJECTED" };
  if (input.state.executionMode === "APPROVAL_REQUIRED" && !input.userApproved) {
    return { allowed: false, reason: "APPROVAL_REQUIRED" };
  }
  if (!capabilities.robinhoodConnected) return { allowed: false, reason: "BROKER_NOT_CONNECTED" };
  if (!capabilities.liveExecutionConfigured) {
    return { allowed: false, reason: "LIVE_EXECUTION_NOT_CONFIGURED" };
  }
  return {
    allowed: canSubmit(
      input.state.executionMode,
      input.riskApproved,
      input.userApproved,
      input.state.killSwitchActive,
    ),
    reason: "ALLOWED",
  };
}

export function tradingStateContext(
  state: Pick<TradingState, "executionMode" | "killSwitchActive">,
  capabilities: TradingCapabilities = TRADING_CAPABILITIES,
) {
  return {
    executionMode: state.executionMode,
    killSwitchActive: state.killSwitchActive,
    robinhoodConnected: capabilities.robinhoodConnected,
    liveExecutionConfigured: capabilities.liveExecutionConfigured,
  };
}