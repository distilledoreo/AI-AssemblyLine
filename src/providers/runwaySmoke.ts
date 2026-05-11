import { isMockProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";
import { RunwayAdapter } from "@/providers/videoProviders";
import type { ComposedPrompt } from "@/providers/types";

export type RunwaySmokeResult = {
  provider: "runway";
  modelId: string;
  providerJobId: string;
  status: "submitted";
};

export async function runRunwaySmoke(input: {
  apiKey?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}): Promise<RunwaySmokeResult> {
  const apiKey = normalizeProviderApiKey(input.apiKey);
  if (!apiKey || isMockProviderApiKey(apiKey)) {
    throw new Error("RUNWAYML_API_SECRET must be set to a real Runway API key for the live smoke test.");
  }

  const modelId = input.modelId?.trim() || "gen4.5";
  const prompt: ComposedPrompt = {
    positivePrompt: "Production smoke test: a simple locked-off shot of a clapperboard on a clean studio table.",
    negativePrompt: "text, watermark, distorted hands, flicker",
    referenceImages: [],
    generationSettings: { width: 1024, height: 576, duration: 5 },
    metadata: { sourceIds: ["smoke-test"], truncationWarnings: [], conflictWarnings: [] },
  };

  const adapter = new RunwayAdapter(apiKey, input.fetchImpl ?? fetch);
  const result = await adapter.generateVideo(prompt, {
    modelId,
    width: 1024,
    height: 576,
    durationSeconds: 5,
  });

  if (!result.providerJobId) {
    throw new Error("Runway smoke test did not return a provider task id.");
  }

  return {
    provider: "runway",
    modelId,
    providerJobId: result.providerJobId,
    status: "submitted",
  };
}
