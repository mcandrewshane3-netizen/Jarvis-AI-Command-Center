import { describe, expect, it } from "vitest";
import {
  createActionPlan,
  createPreparation,
  minimizeContext,
  routeSpecialists,
  SPECIALIST_DOMAINS,
  SPECIALIST_REGISTRY,
  updateActionStatus,
  updatePreparationStatus,
} from "./registry";

describe("specialist registry", () => {
  it("declares every operating domain with a complete contract", () => {
    expect(Object.keys(SPECIALIST_REGISTRY)).toEqual([...SPECIALIST_DOMAINS]);
    for (const specialist of Object.values(SPECIALIST_REGISTRY)) {
      expect(specialist).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        supportedIntents: expect.any(Array),
        relevantTools: expect.any(Array),
        contextCategories: expect.any(Array),
        preferredProviderCapabilities: expect.any(Array),
        structuredOutputSchemas: expect.any(Object),
        safetyConstraints: expect.any(Array),
        autonomousActionsAllowed: false,
        confirmationRequired: expect.any(Boolean),
      });
    }
  });
});

describe("natural-language specialist routing", () => {
  it.each([
    ["Can you help me think through this?", "GENERAL"],
    ["Build a monthly budget to pay down my loan", "FINANCE"],
    ["Help polish my resume for a job interview", "CAREER"],
    ["Prioritize my work tasks before Friday's deadline", "WORK"],
    ["Debug this TypeScript API", "SOFTWARE"],
    ["Set up a better morning routine", "PERSONAL"],
    ["Create a recurring workflow every week", "AUTOMATIONS"],
    ["Analyze shares in my brokerage portfolio", "MARKETS"],
    ["Develop pricing and sales operations for my startup", "BUSINESS"],
  ])("routes %s to %s", (request, expected) => {
    expect(routeSpecialists(request).primary).toBe(expected);
  });

  it.each([
    ["Build a budget and pricing plan for my business", ["FINANCE", "BUSINESS"]],
    ["Compare a new job offer's salary with my financial goals", ["CAREER", "FINANCE"]],
    ["Research customer evidence for this business plan", ["RESEARCH", "BUSINESS"]],
    ["Design software architecture for my startup business", ["SOFTWARE", "BUSINESS"]],
    ["Research the latest evidence about this stock", ["MARKETS", "RESEARCH"]],
  ])("collaborates for %s", (request, expected) => {
    expect(routeSpecialists(request).specialists).toEqual(expected);
  });

  it("keeps go-to-market business work separate from securities markets", () => {
    expect(routeSpecialists("Create a go-to-market strategy for our customers").specialists)
      .toEqual(["BUSINESS"]);
    expect(routeSpecialists("Review stock market price data for my portfolio").specialists)
      .toEqual(["MARKETS"]);
  });

  it.each([
    "What crypto looks strongest right now?",
    "What crypto looks most promising right now?",
    "What's the best crypto setup today?",
    "Which coin has the strongest momentum?",
    "What should I watch in crypto right now?",
    "Which ETF is strongest today?",
    "What stock looks strongest right now?",
    "What should I paper trade right now?",
    "Compare BTC, ETH, and SOL right now.",
  ])("prioritizes current tradable-market intent over generic research: %s", (request) => {
    expect(routeSpecialists(request).primary).toBe("MARKETS");
  });

  it.each([
    "Research Bitcoin adoption.",
    "Explain the history of Ethereum.",
    "Research crypto regulation.",
  ])("keeps non-current background questions in research: %s", (request) => {
    expect(routeSpecialists(request).primary).toBe("RESEARCH");
  });

  it("keeps a basic cryptocurrency definition in general", () => {
    expect(routeSpecialists("What is cryptocurrency?").primary).toBe("GENERAL");
  });
});

describe("context minimization", () => {
  it("passes only categories declared by routed specialists", () => {
    const route = routeSpecialists("Help me improve my monthly budget");
    const selected = minimizeContext([
      { category: "FINANCE", content: "Monthly expenses" },
      { category: "PREFERENCE", content: "Prefer conservative estimates" },
      { category: "PERSONAL", content: "Private family note" },
      { category: "FINANCE", content: "Disabled account", enabled: false },
    ], route);
    expect(selected.map((item) => item.content)).toEqual([
      "Monthly expenses",
      "Prefer conservative estimates",
    ]);
  });
});

describe("action plans", () => {
  const plan = () => createActionPlan({
    id: "plan-1",
    goal: "Prepare and execute a payment",
    steps: [{
      id: "action-1",
      specialist: "FINANCE",
      description: "Submit payment",
      impact: "HIGH",
    }],
  });

  it("requires confirmation before a high-impact action can start", () => {
    expect(plan().steps[0].status).toBe("REQUIRES_USER");
    expect(plan()).toMatchObject({
      specialists: ["FINANCE"],
      dependencies: [],
      status: "REQUIRES_USER",
      requiresUser: true,
      requiresTool: true,
      risk: "HIGH",
      nextAction: "Submit payment",
      backgroundAutonomy: false,
    });
    expect(() => updateActionStatus(plan(), "action-1", { status: "RUNNING" }))
      .toThrow("USER_CONFIRMATION_REQUIRED");
  });

  it("prevents false completion without tool evidence", () => {
    const authorized = updateActionStatus(plan(), "action-1", {
      status: "AUTHORIZED",
      userConfirmed: true,
    });
    expect(() => updateActionStatus(authorized, "action-1", {
      status: "COMPLETED",
    })).toThrow("TOOL_CONFIRMATION_REQUIRED");
  });

  it("completes only after user and tool confirmation", () => {
    const authorized = updateActionStatus(plan(), "action-1", {
      status: "AUTHORIZED",
      userConfirmed: true,
    });
    const completed = updateActionStatus(authorized, "action-1", {
      status: "COMPLETED",
      toolConfirmation: {
        tool: "payment_tool",
        executionId: "execution-123",
        confirmedAt: "2025-01-01T00:00:00.000Z",
      },
    });
    expect(completed.steps[0].status).toBe("COMPLETED");
    expect(completed.status).toBe("COMPLETED");
    expect(completed.backgroundAutonomy).toBe(false);
  });
});

describe("long-running preparation", () => {
  it("models waiting states without claiming background autonomy", () => {
    const queued = createPreparation("prep-1", "Gather statements");
    const waiting = updatePreparationStatus(queued, "WAITING_FOR_TOOL");
    expect(waiting).toEqual({
      id: "prep-1",
      description: "Gather statements",
      status: "WAITING_FOR_TOOL",
      backgroundAutonomy: false,
    });
  });
});