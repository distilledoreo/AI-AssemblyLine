import { afterEach, describe, expect, it, vi } from "vitest";
import type { Processor } from "bullmq";

const workerMocks = vi.hoisted(() => ({
  createGenerationWorker: vi.fn((queueName: string, processor: Processor) => ({ queueName, processor })),
  isRedisQueueEnabled: vi.fn(() => true),
  scheduleProviderPollJob: vi.fn(async () => ({ scheduled: true, queueName: "assemblyline-video" })),
  addJobEvent: vi.fn(),
  completeGenerationJob: vi.fn(),
  getGenerationJob: vi.fn(),
  processMediaUtilityJob: vi.fn(),
  processScriptAnalysisJob: vi.fn(),
}));

vi.mock("@/server/queue", () => ({
  createGenerationWorker: workerMocks.createGenerationWorker,
  isRedisQueueEnabled: workerMocks.isRedisQueueEnabled,
  scheduleProviderPollJob: workerMocks.scheduleProviderPollJob,
}));

vi.mock("@/server/assetBible", () => ({ processAssetReferenceJob: vi.fn() }));
vi.mock("@/server/exportImport", () => ({ processExportProjectBundleJob: vi.fn(), processImportProjectBundleJob: vi.fn() }));
vi.mock("@/server/media", () => ({ processMediaUtilityJob: workerMocks.processMediaUtilityJob }));
vi.mock("@/server/repository", () => ({
  addJobEvent: workerMocks.addJobEvent,
  completeGenerationJob: workerMocks.completeGenerationJob,
  getGenerationJob: workerMocks.getGenerationJob,
}));
vi.mock("@/server/scriptAnalysis", () => ({ processScriptAnalysisJob: workerMocks.processScriptAnalysisJob }));
vi.mock("@/server/storyboard", () => ({ processStoryboardFrameJob: vi.fn() }));
vi.mock("@/server/video", () => ({ processSubmittedVideoProviderJobs: vi.fn(), processVideoClipJob: vi.fn() }));

describe("worker bootstrap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    workerMocks.isRedisQueueEnabled.mockReturnValue(true);
    workerMocks.scheduleProviderPollJob.mockResolvedValue({ scheduled: true, queueName: "assemblyline-video" });
    workerMocks.getGenerationJob.mockResolvedValue(undefined);
  });

  it("starts a BullMQ worker for every executable queue, including media utilities", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    const result = await startGenerationWorkers();

    expect(result.started).toBe(true);
    expect(workerMocks.createGenerationWorker.mock.calls.map((call) => call[0])).toEqual([
      "analysis",
      "image",
      "video",
      "media",
      "project",
    ]);
    expect(workerMocks.scheduleProviderPollJob).toHaveBeenCalledWith("video", 15000);
    expect(result.providerPollSchedule).toEqual({ scheduled: true, queueName: "assemblyline-video" });
  });

  it("surfaces provider poll scheduler failures during worker startup", async () => {
    workerMocks.scheduleProviderPollJob.mockRejectedValue(new Error("provider poll schedule failed"));
    const { startGenerationWorkers } = await import("@/server/worker");

    await expect(startGenerationWorkers()).rejects.toThrow("provider poll schedule failed");
  });

  it("routes media BullMQ jobs to the media utility processor", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    await startGenerationWorkers();
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

  it("persists GenerationJob failure state when a worker processor throws", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    await startGenerationWorkers();
    const analysisProcessor = workerMocks.createGenerationWorker.mock.calls.find((call) => call[0] === "analysis")?.[1];
    if (!analysisProcessor) {
      throw new Error("Expected analysis processor registration.");
    }
    const error = Object.assign(new Error("OpenAI rate limited the analysis pass."), { errorClass: "rate_limit" });
    workerMocks.processScriptAnalysisJob.mockRejectedValue(error);
    workerMocks.getGenerationJob.mockResolvedValue({ id: "job-1", status: "running" });

    await expect(
      analysisProcessor({
        id: "job-1",
        name: "script_analysis",
        attemptsMade: 0,
        data: {
          projectId: "project-1",
          scriptVersionId: "script-version-1",
        },
      }),
    ).rejects.toThrow("OpenAI rate limited the analysis pass.");

    expect(workerMocks.completeGenerationJob).toHaveBeenCalledWith("job-1", {
      status: "failed",
      errorMessage: "OpenAI rate limited the analysis pass.",
      errorClass: "rate_limit",
      retryCount: 1,
    });
    expect(workerMocks.addJobEvent).toHaveBeenCalledWith({
      jobId: "job-1",
      projectId: "project-1",
      eventType: "status_change",
      message: "OpenAI rate limited the analysis pass.",
      progressPct: 100,
    });
  });

  it("surfaces GenerationJob lookup failures before persisting worker failure state", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    await startGenerationWorkers();
    const analysisProcessor = workerMocks.createGenerationWorker.mock.calls.find((call) => call[0] === "analysis")?.[1];
    if (!analysisProcessor) {
      throw new Error("Expected analysis processor registration.");
    }
    workerMocks.processScriptAnalysisJob.mockRejectedValue(new Error("OpenAI rate limited the analysis pass."));
    workerMocks.getGenerationJob.mockRejectedValue(new Error("database unavailable"));

    await expect(
      analysisProcessor({
        id: "job-1",
        name: "script_analysis",
        attemptsMade: 0,
        data: {
          projectId: "project-1",
          scriptVersionId: "script-version-1",
        },
      }),
    ).rejects.toThrow("database unavailable");

    expect(workerMocks.completeGenerationJob).not.toHaveBeenCalled();
    expect(workerMocks.addJobEvent).not.toHaveBeenCalled();
  });

  it("persists malformed BullMQ payload failures using the persisted GenerationJob project", async () => {
    const { startGenerationWorkers } = await import("@/server/worker");
    await startGenerationWorkers();
    const analysisProcessor = workerMocks.createGenerationWorker.mock.calls.find((call) => call[0] === "analysis")?.[1];
    if (!analysisProcessor) {
      throw new Error("Expected analysis processor registration.");
    }
    workerMocks.getGenerationJob.mockResolvedValue({ id: "job-1", projectId: "project-1", status: "running" });

    await expect(
      analysisProcessor({
        id: "job-1",
        name: "script_analysis",
        attemptsMade: 2,
        data: {
          scriptVersionId: "script-version-1",
        },
      }),
    ).rejects.toThrow("Script analysis jobs require projectId and scriptVersionId.");

    expect(workerMocks.completeGenerationJob).toHaveBeenCalledWith("job-1", {
      status: "failed",
      errorMessage: "Script analysis jobs require projectId and scriptVersionId.",
      errorClass: "fatal",
      retryCount: 3,
    });
    expect(workerMocks.addJobEvent).toHaveBeenCalledWith({
      jobId: "job-1",
      projectId: "project-1",
      eventType: "status_change",
      message: "Script analysis jobs require projectId and scriptVersionId.",
      progressPct: 100,
    });
  });
});
