import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import type { ComposedPrompt, VideoOptions } from "@/providers/types";

export class RunwayAdapter {
  readonly slug = "runway";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
  getCapabilities() {
    return {
      models: ["runway-gen3-alpha"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: true,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}

export class KlingAdapter {
  readonly slug = "kling";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
  getCapabilities() {
    return {
      models: ["kling-1.6"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: false,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}
