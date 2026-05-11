import { afterEach, describe, expect, it, vi } from "vitest";
import { StabilityAdapter } from "@/providers/stability";
import type { ComposedPrompt } from "@/providers/types";

const prompt: ComposedPrompt = {
  positivePrompt: "Painterly character reference sheet for Anna",
  negativePrompt: "blurry, off-model",
  referenceImages: [],
  generationSettings: { width: 1024, height: 1024 },
  metadata: { sourceIds: ["asset-1"], truncationWarnings: [], conflictWarnings: [] },
};

describe("Stability adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses deterministic mock image generation without a key outside production", async () => {
    const result = await new StabilityAdapter("").generateImage(prompt, {
      modelId: "stable-image-core",
      width: 1024,
      height: 1024,
    });

    expect(result.images[0]).toMatchObject({ mimeType: "image/png" });
    expect(result.isAsync).toBe(false);
  });

  it("calls the live Stable Image Core endpoint when a key is configured", async () => {
    const pngBytes = Buffer.from("real-png");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await new StabilityAdapter(" sk-stability-test ", fetchMock).generateImage(prompt, {
      modelId: "stable-image-core",
      width: 1536,
      height: 1024,
      count: 1,
      seed: 42,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-stability-test",
          Accept: "image/*",
        }),
        body: expect.any(FormData),
      }),
    );
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("prompt")).toBe(prompt.positivePrompt);
    expect(form.get("negative_prompt")).toBe(prompt.negativePrompt);
    expect(form.get("aspect_ratio")).toBe("3:2");
    expect(form.get("seed")).toBe("42");
    expect(result.images[0]).toEqual({ data: pngBytes, mimeType: "image/png" });
  });

  it("maps Stability API failures to retry classes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Too many requests", { status: 429 }));

    await expect(
      new StabilityAdapter("sk-stability-test", fetchMock).generateImage(prompt, {
        modelId: "stable-image-core",
        width: 1024,
        height: 1024,
      }),
    ).rejects.toMatchObject({ errorClass: "rate_limit", status: 429 });
  });

  it("rejects malformed successful Stability responses without image bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    await expect(
      new StabilityAdapter("sk-stability-test", fetchMock).generateImage(prompt, {
        modelId: "stable-image-core",
        width: 1024,
        height: 1024,
      }),
    ).rejects.toMatchObject({
      message: "Stability response did not include usable image data.",
      errorClass: "fatal",
      status: 502,
    });
  });

  it("blocks missing-key mock generation in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      new StabilityAdapter("").generateImage(prompt, {
        modelId: "stable-image-core",
        width: 1024,
        height: 1024,
      }),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
  });
});
