import type {
  ComposedPrompt,
  ImageAdapter,
  ImageCapabilities,
  ImageOptions,
  ImageResult,
  TextAdapter,
  TextCapabilities,
  TextOptions,
  TextResult,
} from "@/providers/types";

const oneByOnePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export class OpenAIAdapter implements TextAdapter, ImageAdapter {
  readonly slug = "openai";

  constructor(private readonly apiKey: string) {}

  async analyzeScript(prompt: string, options: TextOptions): Promise<TextResult> {
    return this.generateStructuredOutput(prompt, { type: "object" }, options);
  }

  async generateStructuredOutput(prompt: string, _schema: unknown, options: TextOptions): Promise<TextResult> {
    if (!this.apiKey || this.apiKey === "mock") {
      return {
        content: JSON.stringify({
          provider: this.slug,
          modelId: options.modelId,
          promptPreview: prompt.slice(0, 120),
        }),
        usage: {
          inputTokens: estimateTokens(prompt),
          outputTokens: 40,
        },
        modelId: options.modelId,
      };
    }

    throw new Error("Live OpenAI calls are not enabled in Phase 1 verification.");
  }

  async generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult> {
    return {
      images: Array.from({ length: options.count ?? 1 }, () => ({
        data: oneByOnePng,
        mimeType: "image/png",
      })),
      usage: { units: 1 },
      modelId: options.modelId,
      isAsync: false,
      providerJobId: `mock-openai-${hashPrompt(prompt.positivePrompt)}`,
    };
  }

  getCapabilities(): TextCapabilities & ImageCapabilities {
    return {
      models: ["gpt-4o", "gpt-4o-mini", "gpt-image-1"],
      structuredOutput: true,
      maxPromptLength: 128000,
      supportsTextToImage: true,
      supportsImageEditing: true,
      supportsReferenceImages: true,
      supportsSeeds: false,
      maxImageCount: 4,
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2"],
    };
  }
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function hashPrompt(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
