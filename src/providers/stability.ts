import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import type { ComposedPrompt, ImageAdapter, ImageOptions, ImageResult } from "@/providers/types";

export class StabilityAdapter implements ImageAdapter {
  readonly slug = "stability";
  private readonly mock = createMockAdapter(this.slug);

  constructor(
    private readonly apiKey = process.env.STABILITY_API_KEY ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult> {
    if (this.apiKey && this.apiKey !== "mock") {
      const images: ImageResult["images"] = [];
      const count = Math.max(1, Math.min(options.count ?? 1, this.getCapabilities().maxImageCount));
      for (let index = 0; index < count; index += 1) {
        const response = await this.stabilityRequest(prompt, options);
        images.push(response);
      }
      return {
        images,
        usage: { units: images.length },
        modelId: options.modelId,
        isAsync: false,
      };
    }

    assertMockProviderAllowed(this.slug);
    return this.mock.generateImage(prompt, options);
  }

  getCapabilities() {
    return {
      models: ["stable-image-core", "stable-image-ultra"],
      supportsTextToImage: true,
      supportsImageEditing: true,
      supportsReferenceImages: true,
      supportsSeeds: true,
      maxImageCount: 4,
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2"],
    };
  }

  private async stabilityRequest(prompt: ComposedPrompt, options: ImageOptions) {
    const form = new FormData();
    form.set("prompt", prompt.positivePrompt);
    if (prompt.negativePrompt) {
      form.set("negative_prompt", prompt.negativePrompt);
    }
    form.set("output_format", "png");
    form.set("aspect_ratio", toStabilityAspectRatio(options.width, options.height, prompt.generationSettings.aspectRatio));
    if (typeof options.seed === "number") {
      form.set("seed", String(options.seed));
    }

    const response = await this.fetchImpl(stabilityEndpointForModel(options.modelId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "image/*",
      },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      const error = new Error(payload || `Stability request failed with status ${response.status}.`);
      Object.assign(error, { errorClass: classifyStabilityStatus(response.status), status: response.status });
      throw error;
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  }
}

function stabilityEndpointForModel(modelId: string) {
  if (modelId === "stable-image-ultra") {
    return "https://api.stability.ai/v2beta/stable-image/generate/ultra";
  }
  return "https://api.stability.ai/v2beta/stable-image/generate/core";
}

function toStabilityAspectRatio(width: number, height: number, explicit?: string) {
  const normalized = explicit && ["1:1", "16:9", "9:16", "4:3", "3:2"].includes(explicit) ? explicit : undefined;
  if (normalized) {
    return normalized;
  }
  if (width === height) return "1:1";
  if (width > height) {
    const ratio = width / height;
    return ratio > 1.65 ? "16:9" : ratio > 1.4 ? "3:2" : "4:3";
  }
  return "9:16";
}

function classifyStabilityStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 400 || status === 401 || status === 403 || status === 404) return "fatal";
  if (status >= 500) return "retriable";
  return "fatal";
}
