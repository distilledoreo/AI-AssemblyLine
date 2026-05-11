import { afterEach, describe, expect, it, vi } from "vitest";
import { SeedanceAdapter } from "@/providers/extendedAdapters";
import { OpenAIAdapter } from "@/providers/openai";
import { StabilityAdapter } from "@/providers/stability";
import { KlingAdapter, RunwayAdapter } from "@/providers/videoProviders";
import type { ComposedPrompt } from "@/providers/types";

const prompt: ComposedPrompt = {
  positivePrompt: "Production guard test.",
  negativePrompt: "",
  referenceImages: [],
  generationSettings: { width: 1024, height: 576 },
  metadata: { sourceIds: [], truncationWarnings: [], conflictWarnings: [] },
};

describe("mock-backed provider production guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows mock-backed image and video providers outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await expect(new StabilityAdapter().generateImage(prompt, { modelId: "stable-image-core", width: 1024, height: 1024 })).resolves.toMatchObject({
      isAsync: false,
    });
    await expect(new RunwayAdapter().generateVideo(prompt, { modelId: "runway-gen3-alpha", width: 1024, height: 576, durationSeconds: 3 })).resolves.toMatchObject({
      isAsync: false,
    });
  });

  it("rejects mock-backed image and video providers in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STABILITY_API_KEY", "");

    await expect(new StabilityAdapter().generateImage(prompt, { modelId: "stable-image-core", width: 1024, height: 1024 })).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(new RunwayAdapter().generateVideo(prompt, { modelId: "gen4.5", width: 1024, height: 576, durationSeconds: 3 })).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(new RunwayAdapter().checkJobStatus("task-without-key")).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(new KlingAdapter().generateVideo(prompt, { modelId: "kling-1.6", width: 1024, height: 576, durationSeconds: 3 })).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(new KlingAdapter().checkJobStatus("kling-task-without-key")).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(new SeedanceAdapter().checkJobStatus("seedance-task-without-key")).rejects.toMatchObject({
      code: "provider_not_configured",
    });
  });

  it("treats whitespace-padded mock keys as mock-backed in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn();

    await expect(
      new OpenAIAdapter(" mock ", fetchMock).generateStructuredOutput("Analyze this script.", { type: "object" }, {
        modelId: "gpt-4.1-mini",
        responseFormat: "json",
      }),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
    await expect(
      new StabilityAdapter(" mock ", fetchMock).generateImage(prompt, { modelId: "stable-image-core", width: 1024, height: 1024 }),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
    await expect(
      new RunwayAdapter(" mock ", fetchMock).generateVideo(prompt, { modelId: "gen4.5", width: 1024, height: 576, durationSeconds: 3 }),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
