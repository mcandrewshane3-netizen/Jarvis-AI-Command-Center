import { describe, expect, it } from "vitest";
import type { AIProvider, ProviderId } from "./ai/provider";
import { buildOrchestrationPlan } from "./orchestrator";

function provider(id: ProviderId): AIProvider {
  return {
    id,
    name: id,
    defaultModel: `${id}-test`,
    capabilities: new Set(["REASONING", "CODING"]),
    status: () => ({
      id,
      name: id,
      configured: true,
      available: true,
      health: "AVAILABLE",
      reason: null,
      capabilities: ["REASONING", "CODING"],
    }),
    checkHealth: async function () { return this.status(); },
    supports(capability) { return this.capabilities.has(capability); },
    async *stream() { yield { type: "content" as const, content: "ok" }; },
    async complete() { return { text: "ok", model: `${id}-test` }; },
    async completeStructured() { return { text: "{}", value: {}, model: `${id}-test` }; },
  };
}

function providers() {
  return new Map<ProviderId, AIProvider>([
    ["openai", provider("openai")],
    ["grok", provider("grok")],
  ]);
}

describe("cost-aware orchestration", () => {
  it("keeps SMART/AUTO high-impact requests on one provider with fallback", () => {
    const plan = buildOrchestrationPlan({
      content: "Analyze this major architecture strategy and risks",
      intelligenceMode: "SMART",
      providerMode: "AUTO",
      providers: providers(),
    });
    expect(plan.multiProvider).toBe(false);
    expect(plan.providerIds).toEqual(["openai"]);
    expect(plan.fallbackProviderIds).toEqual(["grok"]);
  });

  it("still allows explicit MAX multi-provider analysis", () => {
    const plan = buildOrchestrationPlan({
      content: "Analyze this major architecture strategy and risks",
      intelligenceMode: "MAX",
      providerMode: "AUTO",
      providers: providers(),
    });
    expect(plan.multiProvider).toBe(true);
    expect(plan.providerIds).toEqual(["openai", "grok"]);
  });
});
