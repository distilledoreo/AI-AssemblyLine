import { GoogleVeoAdapter } from "@/providers/videoProviders";
import { isMockProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";
import type { AsyncJobStatus, ComposedPrompt } from "@/providers/types";

export type GoogleVeoSmokeResult = {
  provider: "google-ai";
  modelId: string;
  providerJobId: string;
  status: "submitted";
  providerStatus: AsyncJobStatus["status"];
  providerProgress?: number;
};

export async function runGoogleVeoSmoke(input: {
  apiKey?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleVeoSmokeResult> {
  const apiKey = normalizeProviderApiKey(input.apiKey);
  if (!apiKey || isMockProviderApiKey(apiKey)) {
    throw new Error("GEMINI_API_KEY must be set to a real Google AI API key for the live Veo smoke test.");
  }

  const modelId = input.modelId?.trim() || "veo-3.1-generate-preview";
  const prompt: ComposedPrompt = {
    positivePrompt: "Production smoke test: a simple locked-off shot of a clapperboard on a clean studio table.",
    negativePrompt: "text, watermark, distorted hands, flicker",
    referenceImages: [],
    generationSettings: { width: 1024, height: 576, duration: 8 },
    metadata: { sourceIds: ["smoke-test"], truncationWarnings: [], conflictWarnings: [] },
  };

  const adapter = new GoogleVeoAdapter(apiKey, input.fetchImpl ?? fetch);
  const result = await adapter.generateVideo(prompt, {
    modelId,
    width: 1024,
    height: 576,
    durationSeconds: 8,
  });

  if (!result.providerJobId) {
    throw new Error("Google AI Veo smoke test did not return an operation name.");
  }
  const providerStatus = await adapter.checkJobStatus(result.providerJobId);

  return {
    provider: "google-ai",
    modelId,
    providerJobId: result.providerJobId,
    status: "submitted",
    providerStatus: providerStatus.status,
    providerProgress: providerStatus.progress,
  };
}
