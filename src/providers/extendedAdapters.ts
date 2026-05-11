import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import type { ComposedPrompt, ImageCapabilities, TextCapabilities, TextOptions, VideoCapabilities, VideoOptions } from "@/providers/types";

export class SeedanceAdapter {
  readonly slug = "bytedance-seedance";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
  getCapabilities(): VideoCapabilities {
    return {
      models: ["seedance-1.0-pro", "seedance-1.0-lite"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: false,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}

export class PikaAdapter {
  readonly slug = "pika";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
  getCapabilities(): VideoCapabilities {
    return {
      models: ["pika-2.2"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: true,
      requiresAsyncPolling: true,
      maxDurationSeconds: 15,
      aspectRatios: ["16:9", "9:16", "1:1", "4:5"],
    };
  }
}

export class LumaAdapter {
  readonly slug = "luma";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
  getCapabilities(): VideoCapabilities {
    return {
      models: ["ray-2"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: true,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}

export class ElevenLabsAdapter {
  readonly slug = "elevenlabs";
  private readonly mock = createMockAdapter(this.slug);

  async generateStructuredOutput(prompt: string, schema: unknown, options: TextOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateStructuredOutput(prompt, schema, options);
  }

  getCapabilities(): TextCapabilities & { audio: { models: string[]; supportsVoice: boolean; supportsSoundEffects: boolean } } {
    return {
      models: ["eleven_multilingual_v2"],
      structuredOutput: false,
      maxPromptLength: 5000,
      audio: {
        models: ["eleven_multilingual_v2", "eleven_v3"],
        supportsVoice: true,
        supportsSoundEffects: true,
      },
    };
  }
}

export function getRemainingAdapterCapabilities() {
  return [
    new SeedanceAdapter(),
    new PikaAdapter(),
    new LumaAdapter(),
    new ElevenLabsAdapter(),
  ].map((adapter) => ({ slug: adapter.slug, capabilities: adapter.getCapabilities() as VideoCapabilities | ImageCapabilities | TextCapabilities }));
}
