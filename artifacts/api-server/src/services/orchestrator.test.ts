import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  ProviderCapability,
  ProviderCompletion,
  ProviderId,
  ProviderRequest,
  ProviderStatus,
  ProviderStructuredCompletion,
  ProviderStreamEvent,
} from "./ai/provider";
import {
  buildOrchestrationPlan,
  MultiAIOrchestrator,
  routeIntent,
  type OrchestratorEvent,
} from "./orchestrator";

class FakeProvider implements AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  completeCalls = 0;

  constructor(
    readonly id: ProviderId,
    capabilities: ProviderCapability[] = ["REASONING", "CODING"],
    private readonly behavior: "success" | "fail" = "success",
  ) {
    this.name = id;
    this.defaultModel = `${id}-test-model`;
    this.capabilities = new Set(capabilities);
  }

  status(): ProviderStatus {
    return {
      id: this.id,
      name: this.name,
      configured: true,
      available: true,
      health: "AVAILABLE",
      reason: null,
      capabilities: [...this.capabilities],
    };
  }

  async checkHealth() {
    return this.status();
  }

  supports(capability: ProviderCapability) {
    return this.capabilities.has(capability);
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    if (this.behavior === "fail") throw new Error(`${this.id}_FAILED`);
    const isSynthesis = request.messages.some((message) => message.content.includes("JARVIS synthesis layer"));
    yield { type: "content", content: isSynthesis ? "one JARVIS answer" : `${this.id} answer` };
    yield { type: "usage", model: this.defaultModel, usage: { inputTokens: 10, outputTokens: 5 } };
  }

  async complete(): Promise<ProviderCompletion> {
    this.completeCalls += 1;
    if (this.behavior === "fail") throw new Error(`${this.id}_FAILED`);
    return {
      text: `${this.id} independent analysis`,
      model: this.defaultModel,
      usage: { inputTokens: 8, outputTokens: 4 },
    };
  }

  async completeStructured(): Promise<ProviderStructuredCompletion> {
    return {
      text: "{\"ok\":true}",
      value: { ok: true },
      model: this.defaultModel,
    };
  }
}

function registry(...providers: FakeProvider[]) {
  return new Map<ProviderId, AIProvider>(providers.map((provider) => [provider.id, provider]));
}

async function collect(stream: AsyncIterable<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("JARVIS specialist routing", () => {
  it.each([
    ["Hello, help me think", "GENERAL"],
    ["Prioritize my work tasks", "WORK"],
    ["Review my monthly budget", "FINANCE"],
    ["Research this stock", "MARKETS"],
    ["Investigate the evidence", "RESEARCH"],
    ["Debug this TypeScript API", "SOFTWARE"],
  ])("routes %s to %s", (content, expected) => {
    expect(routeIntent(content)).toBe(expected);
  });
});

describe("multi-AI orchestration", () => {
  it("AUTO selects the available OpenAI provider for general work", () => {
    const providers = registry(new FakeProvider("openai"), new FakeProvider("grok"));
    expect(buildOrchestrationPlan({
      content: "Help me outline a plan",
      intelligenceMode: "SMART",
      providerMode: "AUTO",
      providers,
    }).providerIds).toEqual(["openai"]);
  });

  it("selects a provider that actually supports current web research", () => {
    const providers = registry(
      new FakeProvider("openai", ["REASONING"]),
      new FakeProvider("grok", ["REASONING", "WEB_RESEARCH", "X_SEARCH"]),
    );
    expect(buildOrchestrationPlan({
      content: "Research the latest news today",
      intelligenceMode: "SMART",
      providerMode: "AUTO",
      providers,
    }).providerIds).toEqual(["grok"]);
  });

  it("OPENAI ONLY does not silently use Grok", () => {
    const providers = registry(
      new FakeProvider("openai", ["REASONING"]),
      new FakeProvider("grok", ["REASONING", "WEB_RESEARCH"]),
    );
    expect(buildOrchestrationPlan({
      content: "Research current web news",
      intelligenceMode: "SMART",
      providerMode: "OPENAI_ONLY",
      providers,
    }).providerIds).toEqual([]);
  });

  it("GROK ONLY selects only Grok when it is capable", () => {
    const providers = registry(new FakeProvider("openai"), new FakeProvider("grok"));
    expect(buildOrchestrationPlan({
      content: "Explain this idea",
      intelligenceMode: "SMART",
      providerMode: "GROK_ONLY",
      providers,
    }).providerIds).toEqual(["grok"]);
  });

  it("NORMAL avoids unnecessary multi-provider calls", () => {
    const providers = registry(new FakeProvider("openai"), new FakeProvider("grok"));
    expect(buildOrchestrationPlan({
      content: "Analyze a major architecture decision",
      intelligenceMode: "NORMAL",
      providerMode: "AUTO",
      providers,
    }).multiProvider).toBe(false);
  });

  it("MULTI AI invokes providers independently and synthesizes one answer", async () => {
    const openai = new FakeProvider("openai");
    const grok = new FakeProvider("grok");
    const events = await collect(new MultiAIOrchestrator(registry(openai, grok)).stream({
      content: "Compare two strategic options",
      messages: [{ role: "user", content: "Compare two strategic options" }],
      intelligenceMode: "SMART",
      providerMode: "MULTI_AI",
    }));
    expect(openai.completeCalls).toBe(1);
    expect(grok.completeCalls).toBe(1);
    expect(events.filter((event) => event.type === "content")).toEqual([
      { type: "content", content: "one JARVIS answer" },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      providers: ["openai", "grok"],
    });
  });

  it("does not claim MULTI AI is feasible with only one provider", () => {
    const providers = registry(new FakeProvider("openai"));
    const plan = buildOrchestrationPlan({
      content: "Compare two strategic options",
      intelligenceMode: "SMART",
      providerMode: "MULTI_AI",
      providers,
    });
    expect(plan.providerIds).toEqual([]);
    expect(plan.multiProvider).toBe(false);
  });

  it("falls back only to another configured, capable provider", async () => {
    const events = await collect(new MultiAIOrchestrator(registry(
      new FakeProvider("openai", ["REASONING"], "fail"),
      new FakeProvider("grok", ["REASONING"]),
    )).stream({
      content: "Explain this",
      messages: [{ role: "user", content: "Explain this" }],
      intelligenceMode: "SMART",
      providerMode: "AUTO",
    }));
    expect(events).toContainEqual({
      type: "activity",
      stage: "FALLBACK",
      provider: "grok",
      detail: "PRIMARY_PROVIDER_UNAVAILABLE",
    });
    expect(events.at(-1)).toMatchObject({ type: "done", providers: ["grok"], fallbackUsed: true });
  });

  it("does not report success when every configured provider fails", async () => {
    const orchestrator = new MultiAIOrchestrator(registry(
      new FakeProvider("openai", ["REASONING"], "fail"),
    ));
    await expect(collect(orchestrator.stream({
      content: "Explain this",
      messages: [{ role: "user", content: "Explain this" }],
      intelligenceMode: "SMART",
      providerMode: "AUTO",
    }))).rejects.toThrow("openai_FAILED");
  });

  it("enables adversarial review only for MAX high-impact multi-provider work", () => {
    const providers = registry(new FakeProvider("openai"), new FakeProvider("grok"));
    expect(buildOrchestrationPlan({
      content: "Analyze this major investment strategy and its risks",
      intelligenceMode: "MAX",
      providerMode: "AUTO",
      providers,
    }).adversarialReview).toBe(true);
  });
});