import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import type { ComposedPrompt, ImageOptions } from "@/providers/types";

export class StabilityAdapter {
  readonly slug = "stability";
  private readonly mock = createMockAdapter(this.slug);

  async generateImage(prompt: ComposedPrompt, options: ImageOptions) {
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
}
