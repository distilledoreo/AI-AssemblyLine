import { describe, expect, it, vi } from "vitest";
import { GoogleVeoAdapter, RunwayAdapter } from "@/providers/videoProviders";
import type { ComposedPrompt } from "@/providers/types";

const prompt: ComposedPrompt = {
  positivePrompt: "A careful dolly shot through a quiet workshop.",
  negativePrompt: "flicker",
  referenceImages: [],
  generationSettings: { width: 1024, height: 576, duration: 5 },
  metadata: { sourceIds: ["frame-1"], truncationWarnings: [], conflictWarnings: [] },
};

describe("Runway video adapter", () => {
  it("submits live text-to-video tasks to Runway when a key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-1", status: "PENDING" }));

    const result = await new RunwayAdapter(" rw-prod-runway-smoke-abc123 ", fetchMock).generateVideo(prompt, {
      modelId: "gen4.5",
      width: 1024,
      height: 576,
      durationSeconds: 3,
    });

    expect(result).toEqual({ providerJobId: "task-runway-1", isAsync: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.runwayml.com/v1/image_to_video",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rw-prod-runway-smoke-abc123",
          "X-Runway-Version": "2024-11-06",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      model: "gen4.5",
      promptText: prompt.positivePrompt,
      ratio: "1280:720",
      duration: 5,
    });
  });

  it("maps task retrieval statuses into the shared async status contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "task-runway-1",
        status: "SUCCEEDED",
        output: ["https://example.com/output.mp4"],
      }),
    );

    await expect(new RunwayAdapter("rw-prod-runway-smoke-abc123", fetchMock).checkJobStatus("task-runway-1")).resolves.toEqual({
      status: "complete",
      progress: 100,
      resultUrl: "https://example.com/output.mp4",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.runwayml.com/v1/tasks/task-runway-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps Runway API failures to retry classes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: "Rate limit" }, { status: 429 }));

    await expect(
      new RunwayAdapter("rw-prod-runway-smoke-abc123", fetchMock).generateVideo(prompt, {
        modelId: "gen4.5",
        width: 1024,
        height: 576,
        durationSeconds: 5,
      }),
    ).rejects.toMatchObject({ errorClass: "rate_limit", status: 429 });
  });

  it("rejects malformed successful Runway submissions without a task id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "PENDING" }));

    await expect(
      new RunwayAdapter("rw-prod-runway-smoke-abc123", fetchMock).generateVideo(prompt, {
        modelId: "gen4.5",
        width: 1024,
        height: 576,
        durationSeconds: 5,
      }),
    ).rejects.toMatchObject({
      message: "Runway task submission succeeded without a task id.",
      errorClass: "fatal",
      status: 502,
    });
  });
});

describe("Google Veo video adapter", () => {
  it("submits live Veo operations through the Gemini API when a key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ name: "operations/veo-live-1" }));

    const result = await new GoogleVeoAdapter(" gemini-prod-smoke-abc123 ", fetchMock).generateVideo(prompt, {
      modelId: "veo-3.1-generate-preview",
      width: 720,
      height: 1280,
      durationSeconds: 5,
    });

    expect(result).toEqual({ providerJobId: "operations/veo-live-1", isAsync: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-goog-api-key": "gemini-prod-smoke-abc123",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      instances: [{ prompt: prompt.positivePrompt }],
      parameters: { aspectRatio: "9:16", durationSeconds: 6 },
    });
  });

  it("maps completed Veo operations to downloadable result URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/video-1:download" } }],
          },
        },
      }),
    );

    await expect(new GoogleVeoAdapter("gemini-prod-smoke-abc123", fetchMock).checkJobStatus("operations/veo-live-1")).resolves.toEqual({
      status: "complete",
      progress: 100,
      resultUrl: "https://generativelanguage.googleapis.com/v1beta/files/video-1:download",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/operations/veo-live-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps Veo API failures to retry classes and rejects missing operation names", async () => {
    const rateLimitFetch = vi.fn().mockResolvedValue(Response.json({ error: { message: "rate limited" } }, { status: 429 }));
    await expect(
      new GoogleVeoAdapter("gemini-prod-smoke-abc123", rateLimitFetch).generateVideo(prompt, {
        modelId: "veo-3.1-generate-preview",
        width: 1024,
        height: 576,
        durationSeconds: 8,
      }),
    ).rejects.toMatchObject({ errorClass: "rate_limit", status: 429 });

    const malformedFetch = vi.fn().mockResolvedValue(Response.json({ done: false }));
    await expect(
      new GoogleVeoAdapter("gemini-prod-smoke-abc123", malformedFetch).generateVideo(prompt, {
        modelId: "veo-3.1-generate-preview",
        width: 1024,
        height: 576,
        durationSeconds: 8,
      }),
    ).rejects.toMatchObject({
      message: "Google AI Veo submission succeeded without an operation name.",
      errorClass: "fatal",
      status: 502,
    });
  });
});
