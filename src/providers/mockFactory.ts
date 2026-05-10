import type {
  AsyncJobStatus,
  ComposedPrompt,
  ImageAdapter,
  ImageOptions,
  ImageResult,
  TextAdapter,
  TextOptions,
  TextResult,
  VideoAdapter,
  VideoOptions,
  VideoResult,
} from "@/providers/types";
import type { ErrorClass } from "@/server/types";

export type MockAdapterOptions = {
  latencyMs?: number;
  errorOnCall?: number;
  errorClass?: ErrorClass;
};

export type AdapterCall = {
  method: string;
  prompt: string;
  options: unknown;
};

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const silentMp4Placeholder = Buffer.from("assemblyline-mock-video");

export function createMockAdapter(slug: string, options: MockAdapterOptions = {}) {
  let callCount = 0;
  const calls: AdapterCall[] = [];

  async function beforeCall(method: string, prompt: string, callOptions: unknown) {
    callCount += 1;
    calls.push({ method, prompt, options: callOptions });
    if (options.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    }
    if (options.errorOnCall === callCount) {
      const error = new Error(`Mock ${options.errorClass ?? "fatal"} provider error`);
      Object.assign(error, { errorClass: options.errorClass ?? "fatal" });
      throw error;
    }
  }

  const adapter: TextAdapter & ImageAdapter & VideoAdapter & { calls: AdapterCall[] } = {
    slug,
    calls,
    async analyzeScript(prompt: string, textOptions: TextOptions): Promise<TextResult> {
      await beforeCall("analyzeScript", prompt, textOptions);
      return {
        content: JSON.stringify({ scenes: [], shots: [], assets: [] }),
        usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 8 },
        modelId: textOptions.modelId,
      };
    },
    async generateStructuredOutput(
      prompt: string,
      _schema: unknown,
      textOptions: TextOptions,
    ): Promise<TextResult> {
      await beforeCall("generateStructuredOutput", prompt, textOptions);
      return {
        content: JSON.stringify({ ok: true, provider: slug }),
        usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 12 },
        modelId: textOptions.modelId,
      };
    },
    async generateImage(prompt: ComposedPrompt, imageOptions: ImageOptions): Promise<ImageResult> {
      await beforeCall("generateImage", prompt.positivePrompt, imageOptions);
      return {
        images: [{ data: transparentPng, mimeType: "image/png" }],
        usage: { units: 1 },
        modelId: imageOptions.modelId,
        isAsync: false,
      };
    },
    async generateVideo(prompt: ComposedPrompt, videoOptions: VideoOptions): Promise<VideoResult> {
      await beforeCall("generateVideo", prompt.positivePrompt, videoOptions);
      return {
        video: { data: silentMp4Placeholder, mimeType: "video/mp4" },
        isAsync: false,
      };
    },
    async checkJobStatus(_providerJobId: string): Promise<AsyncJobStatus> {
      return { status: "complete", progress: 100 };
    },
    getCapabilities() {
      return {
        models: ["mock-model"],
        structuredOutput: true,
        maxPromptLength: 100000,
        supportsTextToImage: true,
        supportsImageEditing: true,
        supportsReferenceImages: true,
        supportsSeeds: true,
        maxImageCount: 4,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsVideoExtension: false,
        requiresAsyncPolling: false,
        maxDurationSeconds: 4,
        aspectRatios: ["1:1", "16:9", "9:16"],
      };
    },
  };

  return adapter;
}
