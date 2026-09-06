import { openai } from "@workspace/integrations-openai-ai-server";
import { GrokProvider } from "./xai-provider";

export type ProviderId = "openai" | "grok";
export type ProviderCatalogId = ProviderId | "grok_bot";
export type ProviderHealth = "AVAILABLE" | "DEGRADED" | "NOT_CONFIGURED" | "UNAVAILABLE";
export type ProviderCapability =
  | "REASONING"
  | "FAST_RESPONSE"
  | "CODING"
  | "VISION"
  | "STRUCTURED_OUTPUT"
  | "FUNCTION_CALLING"
  | "WEB_RESEARCH"
  | "X_SEARCH"
  | "LONG_CONTEXT"
  | "TOOL_USE";

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type ProviderRequest = {
  messages: ProviderMessage[];
  model?: string;
  tools?: ProviderToolDefinition[];
  signal?: AbortSignal;
};

export type ProviderStreamEvent =
  | { type: "content"; content: string }
  | { type: "usage"; usage: ProviderUsage; model: string };

export type ProviderCompletion = {
  text: string;
  model: string;
  usage?: ProviderUsage;
  toolCalls?: ProviderToolCall[];
};

export type ProviderStructuredCompletion = ProviderCompletion & {
  value: unknown;
};

export type ProviderStatus = {
  id: ProviderCatalogId;
  name: string;
  configured: boolean;
  available: boolean;
  health: ProviderHealth;
  reason: string | null;
  capabilities: ProviderCapability[];
};

export interface AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly defaultModel: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  status(): ProviderStatus;
  checkHealth(): Promise<ProviderStatus>;
  supports(capability: ProviderCapability): boolean;
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
  complete(request: ProviderRequest): Promise<ProviderCompletion>;
  completeStructured(request: ProviderRequest): Promise<ProviderStructuredCompletion>;
}

const HEALTH_CACHE_MS = 60_000;
let openAIRuntimeHealth: { health: ProviderHealth; checkedAt: number; reason: string | null } | null = null;

function setOpenAIRuntimeHealth(health: ProviderHealth, reason: string | null) {
  openAIRuntimeHealth = { health, reason, checkedAt: Date.now() };
}

const OPENAI_CAPABILITIES: ProviderCapability[] = [
  "REASONING",
  "FAST_RESPONSE",
  "CODING",
  "STRUCTURED_OUTPUT",
  "FUNCTION_CALLING",
  "LONG_CONTEXT",
  "TOOL_USE",
];

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly name = "OpenAI";
  readonly defaultModel = process.env.AI_MODEL || "gpt-5.6-terra";
  readonly capabilities = new Set(OPENAI_CAPABILITIES);

  status(): ProviderStatus {
    const configured = Boolean(
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    );
    if (!configured) {
      return {
        id: this.id,
        name: this.name,
        configured: false,
        available: false,
        health: "NOT_CONFIGURED",
        reason: "REPLIT_OPENAI_INTEGRATION_NOT_CONFIGURED",
        capabilities: [...this.capabilities],
      };
    }
    const runtime = openAIRuntimeHealth;
    return {
      id: this.id,
      name: this.name,
      configured: true,
      available: runtime?.health === "AVAILABLE",
      health: runtime?.health ?? "DEGRADED",
      reason: runtime ? runtime.reason : "RUNTIME_HEALTH_NOT_VERIFIED",
      capabilities: [...this.capabilities],
    };
  }

  async checkHealth(): Promise<ProviderStatus> {
    const current = this.status();
    if (!current.configured) return current;
    if (openAIRuntimeHealth && Date.now() - openAIRuntimeHealth.checkedAt < HEALTH_CACHE_MS) return current;
    try {
      await openai.chat.completions.create({
        model: this.defaultModel,
        max_completion_tokens: 8,
        messages: [{ role: "user", content: "Reply OK." }],
      });
      setOpenAIRuntimeHealth("AVAILABLE", null);
    } catch {
      setOpenAIRuntimeHealth("DEGRADED", "RUNTIME_HEALTH_CHECK_FAILED");
    }
    return this.status();
  }

  supports(capability: ProviderCapability) {
    return this.capabilities.has(capability);
  }

  async *stream(request: ProviderRequest) {
    const model = request.model || this.defaultModel;
    try {
      const response = await openai.chat.completions.create({
        model,
        max_completion_tokens: 8192,
        messages: request.messages,
        tools: request.tools?.map((tool) => ({
          type: "function" as const,
          function: tool,
        })),
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: request.signal });
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield { type: "content" as const, content };
        if (chunk.usage) {
          yield {
            type: "usage" as const,
            model,
            usage: {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            },
          };
        }
      }
      setOpenAIRuntimeHealth("AVAILABLE", null);
    } catch (error) {
      setOpenAIRuntimeHealth("DEGRADED", "RUNTIME_REQUEST_FAILED");
      throw error;
    }
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    const model = request.model || this.defaultModel;
    try {
      const response = await openai.chat.completions.create({
        model,
        max_completion_tokens: 8192,
        messages: request.messages,
        tools: request.tools?.map((tool) => ({
          type: "function" as const,
          function: tool,
        })),
      }, { signal: request.signal });
      const toolCalls = response.choices[0]?.message.tool_calls?.flatMap((toolCall) =>
        toolCall.type === "function" ? [{
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        }] : [],
      );
      setOpenAIRuntimeHealth("AVAILABLE", null);
      return {
        text: response.choices[0]?.message.content ?? "",
        model,
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
        toolCalls,
      };
    } catch (error) {
      setOpenAIRuntimeHealth("DEGRADED", "RUNTIME_REQUEST_FAILED");
      throw error;
    }
  }

  async completeStructured(request: ProviderRequest): Promise<ProviderStructuredCompletion> {
    const model = request.model || this.defaultModel;
    try {
      const response = await openai.chat.completions.create({
        model,
        max_completion_tokens: 8192,
        messages: [
          {
            role: "system",
            content: "Return one valid JSON object. Do not include prose or markdown outside the JSON object.",
          },
          ...request.messages,
        ],
        response_format: { type: "json_object" },
      }, { signal: request.signal });
      const text = response.choices[0]?.message.content ?? "";
      const completion = {
        text,
        value: JSON.parse(text),
        model,
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
      };
      setOpenAIRuntimeHealth("AVAILABLE", null);
      return completion;
    } catch (error) {
      setOpenAIRuntimeHealth("DEGRADED", "RUNTIME_REQUEST_FAILED");
      throw error;
    }
  }
}

export function createProviderRegistry(): Map<ProviderId, AIProvider> {
  const providers: AIProvider[] = [new OpenAIProvider(), new GrokProvider()];
  return new Map(providers.map((provider) => [provider.id, provider]));
}

export async function getProviderCatalog(
  registry = createProviderRegistry(),
  verifyRuntime = false,
): Promise<ProviderStatus[]> {
  if (verifyRuntime) {
    await Promise.all([...registry.values()].map((provider) => provider.checkHealth()));
  }
  return [
    ...[...registry.values()].map((provider) => provider.status()),
    {
      id: "grok_bot",
      name: "Grok Bot",
      configured: false,
      available: false,
      health: "UNAVAILABLE",
      reason: "NO_OFFICIAL_CALLABLE_INTERFACE_CONFIGURED",
      capabilities: [],
    } satisfies ProviderStatus,
  ];
}

export function getAIProvider(provider: ProviderId = "openai"): AIProvider {
  const selected = createProviderRegistry().get(provider);
  if (!selected || !selected.status().configured) {
    throw new Error(`${provider.toUpperCase()}_PROVIDER_NOT_CONFIGURED`);
  }
  return selected;
}