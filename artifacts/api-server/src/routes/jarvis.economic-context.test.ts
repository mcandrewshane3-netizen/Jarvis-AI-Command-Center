import { describe, expect, it } from "vitest";
import { economicEngineSystemContext, isEconomicEngineQuestion } from "./jarvis";

type ContextInput = Parameters<typeof economicEngineSystemContext>[0];

describe("JARVIS Economic Engine II context", () => {
  it("includes only the supplied user's persisted paper facts", () => {
    const context = economicEngineSystemContext({
      portfolio: {
        status: "ACTIVE_PAPER", equityCents: 125_000, realizedPnlCents: 4_000,
      },
      executions: [{
        status: "FILLED", netPnlCents: 4_000, strategyId: "alpha-a", strategyVersion: "v1",
        rejectionReasons: [],
      }],
      performances: [{
        strategyId: "alpha-a", strategyVersion: "v1", assetClass: "STOCK", sampleSize: 3,
        netPnlCents: 4_000, expectancyCents: 1_333, winRate: 0.67,
      }],
      registry: [{
        strategyId: "alpha-a", strategyVersion: "v1", activationState: "CHALLENGER",
      }],
      decisions: [{
        decision: "NO_TRADE", symbol: "AAA", strategyId: "alpha-a", strategyVersion: "v1",
        reasonCode: "RISK_LIMIT",
      }],
      artifacts: [],
      reviews: [],
    } as unknown as ContextInput);

    expect(context).toContain("alpha-a@v1");
    expect(context).toContain("AAA (alpha-a@v1): RISK_LIMIT");
    expect(context).not.toContain("other-user");
    expect(context).toContain("user-scoped");
    expect(context).toContain("no live or current market observations");
  });

  it("states an honest empty evidence state and only detects relevant questions", () => {
    const context = economicEngineSystemContext({
      portfolio: undefined, executions: [], performances: [], registry: [], decisions: [], artifacts: [], reviews: [],
    });

    expect(context).toContain("no persisted paper portfolio");
    expect(context).toContain("insufficient recorded evidence");
    expect(context).toContain("do not fabricate");
    expect(isEconomicEngineQuestion("What is the best strategy's statistical significance?")).toBe(true);
    expect(isEconomicEngineQuestion("Draft a grocery list")).toBe(false);
  });
});