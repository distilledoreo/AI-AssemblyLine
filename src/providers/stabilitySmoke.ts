import { isMockProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";
import { StabilityAdapter } from "@/providers/stability";
import type { ComposedPrompt } from "@/providers/types";

export type StabilitySmokeResult = {
  provider: "stability";
  modelId: string;
  imageCount: number;
  mimeType: string;
  bytes: number;
};

export async function runStabilitySmoke(input: {
  apiKey?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}): Promise<StabilitySmokeResult> {
  const apiKey = normalizeProviderApiKey(input.apiKey);
  if (!apiKey || isMockProviderApiKey(apiKey)) {
    throw new Error("STABILITY_API_KEY must be set to a real Stability API key for the live smoke test.");
  }

  const modelId = input.modelId?.trim() || "stable-image-core";
  const prompt: ComposedPrompt = {
    positivePrompt: "A simple production smoke test image: a clean slate clapperboard icon on a neutral background.",
    negativePrompt: "text, watermark, logo",
    referenceImages: [],
    generationSettings: { width: 1024, height: 1024, aspectRatio: "1:1" },
    metadata: { sourceIds: ["smoke-test"], truncationWarnings: [], conflictWarnings: [] },
  };

  const adapter = new StabilityAdapter(apiKey, input.fetchImpl ?? fetch);
  const result = await adapter.generateImage(prompt, {
    modelId,
    width: 1024,
    height: 1024,
    count: 1,
  });
  const image = result.images[0];
  if (!image?.data.length) {
    throw new Error("Stability smoke test did not return image bytes.");
  }

  return {
    provider: "stability",
    modelId: result.modelId,
    imageCount: result.images.length,
    mimeType: image.mimeType,
    bytes: image.data.length,
  };
}
