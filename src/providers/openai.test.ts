import { describe, expect, it } from "vitest";
import { OpenAIAdapter } from "@/providers/openai";
import { createMockAdapter } from "@/providers/mockFactory";
import { StabilityAdapter } from "@/providers/stability";

describe("provider adapters", () => {
  it("implements the OpenAI text and image adapter contracts in mock verification mode", async () => {
    const adapter = new OpenAIAdapter("mock");
    const text = await adapter.generateStructuredOutput("Break down this script.", {}, {
      modelId: "gpt-4o",
      responseFormat: "json",
    });
    const image = await adapter.generateImage(
      {
        positivePrompt: "Storyboard frame",
        negativePrompt: "blur",
        referenceImages: [],
        generationSettings: { width: 1024, height: 576 },
        metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
      },
      { modelId: "gpt-image-1", width: 1024, height: 576 },
    );

    expect(JSON.parse(text.content).provider).toBe("openai");
    expect(image.images[0].mimeType).toBe("image/png");
    expect(adapter.getCapabilities().supportsReferenceImages).toBe(true);
  });

  it("provides deterministic mock adapters that record calls and simulate errors", async () => {
    const adapter = createMockAdapter("mock", { errorOnCall: 2, errorClass: "rate_limit" });
    await adapter.analyzeScript("INT. ROOM - DAY", { modelId: "mock-model" });
    await expect(adapter.generateStructuredOutput("{}", {}, { modelId: "mock-model" })).rejects.toMatchObject({
      errorClass: "rate_limit",
    });
    expect(adapter.calls.map((call) => call.method)).toEqual(["analyzeScript", "generateStructuredOutput"]);
  });

  it("provides a second image adapter for Asset Bible generation variety", async () => {
    const adapter = new StabilityAdapter();
    const image = await adapter.generateImage(
      {
        positivePrompt: "Character reference sheet",
        negativePrompt: "off model",
        referenceImages: [],
        generationSettings: { width: 1024, height: 1024 },
        metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
      },
      { modelId: "stable-image-core", width: 1024, height: 1024 },
    );

    expect(adapter.slug).toBe("stability");
    expect(adapter.getCapabilities().supportsSeeds).toBe(true);
    expect(image.images[0].mimeType).toBe("image/png");
  });
});
