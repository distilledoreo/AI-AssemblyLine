import { describe, expect, it, vi } from "vitest";
import { runGoogleVeoSmoke } from "@/providers/googleVeoSmoke";

describe("Google Veo smoke helper", () => {
  it("requires a real API key", async () => {
    await expect(runGoogleVeoSmoke({ apiKey: " mock " })).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(runGoogleVeoSmoke({ apiKey: "" })).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(runGoogleVeoSmoke({ apiKey: "abc" })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("submits a low-duration Veo operation and verifies the status endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: "operations/veo-smoke" }))
      .mockResolvedValueOnce(Response.json({ done: false }));

    const result = await runGoogleVeoSmoke({
      apiKey: "gemini-prod-veo-smoke-abc123",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      provider: "google-ai",
      modelId: "veo-3.1-generate-preview",
      providerJobId: "operations/veo-smoke",
      status: "submitted",
      providerStatus: "processing",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "gemini-prod-veo-smoke-abc123",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/operations/veo-smoke",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
