import { afterEach, describe, expect, it, vi } from "vitest";
import type { Processor } from "bullmq";

const workerMocks = vi.hoisted(() => ({
  createGenerationWorker: vi.fn((queueName: string, processor: Processor) => ({ queueName, processor })),
  isRedisQueueEnabled: vi.fn(() => true),
  scheduleProviderPollJob: vi.fn(async () => ({ scheduled: true, queueName: "assemblyline-video" })),
  processMediaUtilityJob: vi.fn(),
}));

vi.mock("@/server/queue", () => ({
  createGenerationWorker: workerMocks.createGenerationWorker,
  isRedisQueueEnabled: workerMocks.isRedisQueueEnabled,
  scheduleProviderPollJob: workerMocks.scheduleProviderPollJob,
}));

vi.mock("@/server/assetBible", () => ({ processAssetReferenceJob: vi.fn() }));
vi.mock("@/server/exportImport", () => ({ processExportProjectBundleJob: vi.fn(), processImportProjectBundleJob: vi.fn() }));
vi.mock("@/server/media", () => ({ processMediaUtilityJob: workerMocks.processMediaUtilityJob }));
vi.mock("@/server/scriptAnalysis", () => ({ processScriptAnalysisJob: vi.fn() }));
vi.mock("@/server/storyboard", () => ({ processStoryboardFrameJob: vi.fn() }));
vi.mock("@/server/video", () => ({ processSubmittedVideoProviderJobs: vi.fn(), processVideoClipJob: vi.fn() }));

describe("worker bootstrap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    workerMocks.isRedisQueueEnabled.mockReturnValue(true);
  });

  it("starts a BullMQ worker for every executable queue, including media utilities", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    const result = startGenerationWorkers();

    expect(result.started).toBe(true);
    expect(workerMocks.createGenerationWorker.mock.calls.map((call) => call[0])).toEqual([
      "analysis",
      "image",
      "video",
      "media",
      "project",
    ]);
    expect(workerMocks.scheduleProviderPollJob).toHaveBeenCalledWith("video", 15000);
  });

  it("routes media BullMQ jobs to the media utility processor", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    startGenerationWorkers();
    const mediaProcessor = workerMocks.createGenerationWorker.mock.calls.find((call) => call[0] === "media")?.[1];
    if (!mediaProcessor) {
      throw new Error("Expected media processor registration.");
    }
    workerMocks.processMediaUtilityJob.mockResolvedValue({ type: "thumbnail" });

    await expect(
      mediaProcessor({
        id: "job-1",
        name: "thumbnail",
        data: {
          projectId: "project-1",
          filePath: "storage/projects/project/videos/source.mp4",
          outputPath: "storage/projects/project/thumbnails/source.jpg",
          seekSeconds: 3,
        },
      }),
    ).resolves.toEqual({ type: "thumbnail" });

    expect(workerMocks.processMediaUtilityJob).toHaveBeenCalledWith({
      jobId: "job-1",
      projectId: "project-1",
      type: "thumbnail",
      sourceFilePath: "storage/projects/project/videos/source.mp4",
      outputFilePath: "storage/projects/project/thumbnails/source.jpg",
      seekSeconds: 3,
    });
  });
});
