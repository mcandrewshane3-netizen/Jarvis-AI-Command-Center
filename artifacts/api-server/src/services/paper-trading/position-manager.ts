import type { ExitReason, PaperPosition } from "./contracts.js";

export interface PositionEvaluation {
  shouldExit: boolean;
  reason: ExitReason | null;
}

export interface PositionContext {
  now: string;
  capitalGovernorExit?: boolean;
  manualClose?: boolean;
  signalDeteriorationThreshold?: number;
}

export class ExitEngine {
  evaluate(position: PaperPosition, context: PositionContext): PositionEvaluation {
    const now = Date.parse(context.now);
    if (!Number.isFinite(now)) throw new Error("A valid evaluation timestamp is required");
    // Explicit operator and portfolio safety overrides have highest priority.
    if (context.manualClose) return { shouldExit: true, reason: "MANUAL_PAPER_CLOSE" };
    if (context.capitalGovernorExit) return { shouldExit: true, reason: "CAPITAL_GOVERNOR" };
    if (position.invalidated) return { shouldExit: true, reason: "INVALIDATION" };
    if (position.stopPrice !== undefined && position.currentPrice <= position.stopPrice) {
      return { shouldExit: true, reason: "STOP" };
    }
    if (position.trailingStopPercent !== undefined &&
        position.currentPrice <= position.highestPrice * (1 - position.trailingStopPercent)) {
      return { shouldExit: true, reason: "TRAIL" };
    }
    if (position.targetPrice !== undefined && position.currentPrice >= position.targetPrice) {
      return { shouldExit: true, reason: "TARGET" };
    }
    if (position.regimeChanged) return { shouldExit: true, reason: "REGIME_CHANGE" };
    if (position.signalStrength !== undefined &&
        position.signalStrength < (context.signalDeteriorationThreshold ?? 0.35)) {
      return { shouldExit: true, reason: "SIGNAL_DETERIORATION" };
    }
    if (position.maxHoldingMs !== undefined && now - Date.parse(position.openedAt) >= position.maxHoldingMs) {
      return { shouldExit: true, reason: "TIME_EXIT" };
    }
    return { shouldExit: false, reason: null };
  }
}

export class PositionManager {
  constructor(private readonly exits = new ExitEngine()) {}
  monitor(positions: readonly PaperPosition[], contexts: Readonly<Record<string, PositionContext>>):
    Array<{ symbol: string } & PositionEvaluation> {
    return positions.map((position) => {
      const context = contexts[position.symbol];
      if (!context) throw new Error(`Missing position context for ${position.symbol}`);
      return { symbol: position.symbol, ...this.exits.evaluate(position, context) };
    });
  }
}