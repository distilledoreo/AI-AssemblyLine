import { createMockAdapter } from "@/providers/mockFactory";

export class StabilityAdapter {
  readonly slug = "stability";
  private readonly mock = createMockAdapter(this.slug);

  generateImage = this.mock.generateImage;

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
