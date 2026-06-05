import { OpenAIAdapter } from "@/providers/openai";
import { isLiveProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";

export type OpenAiSmokeResult = {
  provider: "openai";
  modelId: string;
  providerJobId?: string;
  contentPreview: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export async function runOpenAiSmoke(input: {
  apiKey?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}): Promise<OpenAiSmokeResult> {
  const apiKey = normalizeProviderApiKey(input.apiKey);
  if (!isLiveProviderApiKey(apiKey)) {
    throw new Error("OPENAI_API_KEY must be set to a real OpenAI API key for the live smoke test.");
  }

  const modelId = input.modelId?.trim() || "gpt-4.1-mini";
  const adapter = new OpenAIAdapter(apiKey, input.fetchImpl ?? fetch);
  const result = await adapter.generateStructuredOutput(
    "Return compact JSON with key ok set to true and provider set to openai.",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
        provider: { type: "string" },
      },
      required: ["ok", "provider"],
    },
    {
      modelId,
      maxTokens: 80,
      temperature: 0,
      responseFormat: "json",
    },
  );

  return {
    provider: "openai",
    modelId: result.modelId,
    providerJobId: result.providerJobId,
    contentPreview: result.content.slice(0, 240),
    usage: result.usage,
  };
}
