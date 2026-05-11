import { describe, expect, it, vi } from "vitest";
import { RunwayAdapter } from "@/providers/videoProviders";
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

    const result = await new RunwayAdapter("key_runway_live", fetchMock).generateVideo(prompt, {
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
          Authorization: "Bearer key_runway_live",
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

    await expect(new RunwayAdapter("key_runway_live", fetchMock).checkJobStatus("task-runway-1")).resolves.toEqual({
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
      new RunwayAdapter("key_runway_live", fetchMock).generateVideo(prompt, {
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
      new RunwayAdapter("key_runway_live", fetchMock).generateVideo(prompt, {
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
