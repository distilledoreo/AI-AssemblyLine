import { describe, expect, it, vi } from "vitest";
import { runStabilitySmoke } from "@/providers/stabilitySmoke";

describe("Stability smoke helper", () => {
  it("requires a real API key", async () => {
    await expect(runStabilitySmoke({ apiKey: " Mock " })).rejects.toThrow(/STABILITY_API_KEY/);
    await expect(runStabilitySmoke({ apiKey: "" })).rejects.toThrow(/STABILITY_API_KEY/);
  });

  it("performs a single-image Stable Image Core smoke call", async () => {
    const image = Buffer.from("stability-smoke-image");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(image, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await runStabilitySmoke({
      apiKey: "sk-stability-live-test",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      provider: "stability",
      modelId: "stable-image-core",
      imageCount: 1,
      mimeType: "image/png",
      bytes: image.length,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-stability-live-test" }),
      }),
    );
  });
});
