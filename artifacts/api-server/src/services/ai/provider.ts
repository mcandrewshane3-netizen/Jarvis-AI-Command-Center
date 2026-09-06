import { openai } from "@workspace/integrations-openai-ai-server";

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIProvider {
  readonly name: "openai" | "xai";
  stream(messages: ProviderMessage[]): AsyncIterable<string>;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async *stream(messages: ProviderMessage[]) {
    const response = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages,
      stream: true,
    });
    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

export function getAIProvider(provider = process.env.AI_PROVIDER || "openai"): AIProvider {
  if (provider === "openai") return new OpenAIProvider();
  throw new Error(
    "xAI/Grok is supported by the provider architecture but requires XAI_API_KEY and its adapter to be enabled.",
  );
}