import { describe, expect, it, vi } from "vitest";
import { LocalLtxVideoAdapter, LocalQwenImageAdapter, LocalQwenTextAdapter } from "@/providers/localRuntime";

describe("local runtime adapters", () => {
  it("maps Qwen text runtime output to the text adapter contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      id: "local-text-1",
      modelId: "Qwen/Qwen3.6-27B",
      content: "{\"ok\":true}",
      usage: { inputTokens: 4, outputTokens: 3 },
    }));

    const result = await new LocalQwenTextAdapter("http://127.0.0.1:7861", fetchMock).generateStructuredOutput(
      "Return JSON.",
      { type: "object" },
      { modelId: "Qwen/Qwen3.6-27B", responseFormat: "json" },
    );

    expect(result).toMatchObject({ content: "{\"ok\":true}", modelId: "Qwen/Qwen3.6-27B", providerJobId: "local-text-1" });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: "POST" }));
  });

  it("decodes Qwen image runtime base64 images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      modelId: "Qwen/Qwen-Image-2512",
      images: [{ b64: Buffer.from("image-bytes").toString("base64"), mimeType: "image/png" }],
    }));

    const result = await new LocalQwenImageAdapter("http://127.0.0.1:7861", fetchMock).generateImage(
      {
        positivePrompt: "friendly character reference",
        negativePrompt: "",
        referenceImages: [],
        generationSettings: { width: 1024, height: 1024 },
        metadata: { sourceIds: [], truncationWarnings: [], conflictWarnings: [] },
      },
      { modelId: "Qwen/Qwen-Image-2512", width: 1024, height: 1024 },
    );

    expect(result.images[0].data.toString()).toBe("image-bytes");
    expect(result.modelId).toBe("Qwen/Qwen-Image-2512");
  });

  it("downloads completed LTX video runtime jobs into sync video bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ jobId: "local-video-1", isAsync: true }))
      .mockResolvedValueOnce(Response.json({ status: "complete", resultUrl: "/v1/video/local-video-1/result" }))
      .mockResolvedValueOnce(new Response(Buffer.from("video-bytes"), { headers: { "content-type": "video/mp4" } }));

    const result = await new LocalLtxVideoAdapter("http://127.0.0.1:7861", fetchMock).generateVideo(
      {
        positivePrompt: "gentle camera move",
        negativePrompt: "",
        referenceImages: [],
        generationSettings: { width: 1024, height: 576, duration: 3 },
        metadata: { sourceIds: [], truncationWarnings: [], conflictWarnings: [] },
      },
      { modelId: "diffusers/LTX-2.3-Diffusers", width: 1024, height: 576, durationSeconds: 3 },
    );

    expect(result.isAsync).toBe(false);
    expect(result.video?.data.toString()).toBe("video-bytes");
  });
});
