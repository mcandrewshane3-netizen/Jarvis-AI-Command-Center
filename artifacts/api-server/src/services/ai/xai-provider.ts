import type {
  AIProvider,
  ProviderCapability,
  ProviderCompletion,
  ProviderRequest,
  ProviderStructuredCompletion,
  ProviderStatus,
  ProviderStreamEvent,
} from "./provider";

const XAI_CAPABILITIES: ProviderCapability[] = [
  "REASONING",
  "FAST_RESPONSE",
  "CODING",
  "STRUCTURED_OUTPUT",
  "FUNCTION_CALLING",
  "LONG_CONTEXT",
  "TOOL_USE",
];

const HEALTH_CACHE_MS = 60_000;
let grokRuntimeHealth: { health: "AVAILABLE" | "DEGRADED"; checkedAt: number; reason: string | null } | null = null;

type XAIResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class GrokProvider implements AIProvider {
  readonly id = "grok" as const;
  readonly name = "xAI Grok";
  readonly defaultModel = process.env.XAI_MODEL || "grok-4-latest";
  readonly capabilities = new Set(XAI_CAPABILITIES);

  status(): ProviderStatus {
    const configured = Boolean(process.env.XAI_API_KEY);
    if (!configured) {
      return {
        id: this.id,
        name: this.name,
        configured: false,
        available: false,
        health: "NOT_CONFIGURED",
        reason: "XAI_API_KEY_REQUIRED",
        capabilities: [...this.capabilities],
      };
    }
    return {
      id: this.id,
      name: this.name,
      configured: true,
      available: grokRuntimeHealth?.health === "AVAILABLE",
      health: grokRuntimeHealth?.health ?? "DEGRADED",
      reason: grokRuntimeHealth?.reason ?? "RUNTIME_HEALTH_NOT_VERIFIED",
      capabilities: [...this.capabilities],
    };
  }

  async checkHealth(): Promise<ProviderStatus> {
    const current = this.status();
    if (!current.configured) return current;
    if (grokRuntimeHealth && Date.now() - grokRuntimeHealth.checkedAt < HEALTH_CACHE_MS) return current;
    try {
      await this.request({
        messages: [{ role: "user", content: "Reply OK." }],
      }, false);
    } catch {
      grokRuntimeHealth = {
        health: "DEGRADED",
        checkedAt: Date.now(),
        reason: "RUNTIME_HEALTH_CHECK_FAILED",
      };
    }
    return this.status();
  }

  supports(capability: ProviderCapability) {
    return this.capabilities.has(capability);
  }

  private async request(request: ProviderRequest, stream: boolean, structured = false) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("XAI_API_KEY_REQUIRED");
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages: request.messages,
        tools: request.tools?.map((tool) => ({ type: "function", function: tool })),
        response_format: structured ? { type: "json_object" } : undefined,
        stream,
      }),
      signal: request.signal,
    });
    if (!response.ok) {
      grokRuntimeHealth = {
        health: "DEGRADED",
        checkedAt: Date.now(),
        reason: `RUNTIME_REQUEST_FAILED_${response.status}`,
      };
      throw new Error(`XAI_REQUEST_FAILED_${response.status}`);
    }
    grokRuntimeHealth = { health: "AVAILABLE", checkedAt: Date.now(), reason: null };
    return response;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const response = await this.request(request, true);
    if (!response.body) throw new Error("XAI_STREAM_UNAVAILABLE");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const events = pending.split("\n\n");
      pending = events.pop() ?? "";
      for (const event of events) {
        const line = event.split("\n").find((part) => part.startsWith("data: "));
        if (!line || line === "data: [DONE]") continue;
        const data = JSON.parse(line.slice(6)) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield { type: "content", content };
        if (data.usage) {
          yield {
            type: "usage",
            model: request.model || this.defaultModel,
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            },
          };
        }
      }
      if (done) break;
    }
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    const response = await this.request(request, false);
    const data = await response.json() as XAIResponse;
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: request.model || this.defaultModel,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
      toolCalls: data.choices?.[0]?.message?.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      })),
    };
  }

  async completeStructured(request: ProviderRequest): Promise<ProviderStructuredCompletion> {
    const structuredRequest = {
      ...request,
      messages: [
        {
          role: "system" as const,
          content: "Return one valid JSON object. Do not include prose or markdown outside the JSON object.",
        },
        ...request.messages,
      ],
    };
    const response = await this.request(structuredRequest, false, true);
    const data = await response.json() as XAIResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      text,
      value: JSON.parse(text),
      model: request.model || this.defaultModel,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}