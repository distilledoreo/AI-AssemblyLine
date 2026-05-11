import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn());
const repositoryMocks = vi.hoisted(() => ({
  addJobEvent: vi.fn(),
  completeGenerationJob: vi.fn(),
  markGenerationJobRunning: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("@/server/repository", () => repositoryMocks);

describe("media inspection", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    spawnSyncMock.mockReset();
    repositoryMocks.addJobEvent.mockReset();
    repositoryMocks.completeGenerationJob.mockReset();
    repositoryMocks.markGenerationJobRunning.mockReset();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("uses ffprobe metadata when available", async () => {
    const { inspectClip } = await import("@/server/media");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "assemblyline-media-"));
    const clipPath = path.join(tempDir, "clip.mp4");
    await writeFile(clipPath, Buffer.from("fake-video"));
    spawnSyncMock.mockImplementation((command: string) =>
      command === "ffprobe"
        ? {
            status: 0,
            stdout: JSON.stringify({
              streams: [{ codec_name: "h264", width: 1920, height: 1080 }],
              format: { duration: "2.5" },
            }),
          }
        : { status: 0, stdout: "ffmpeg version 7" },
    );

    await expect(inspectClip(clipPath)).resolves.toMatchObject({
      durationMs: 2500,
      width: 1920,
      height: 1080,
      codec: "h264",
      fileSizeBytes: 10,
      ffmpeg: { available: true },
    });
  });

  it("falls back to placeholder metadata when ffprobe is unavailable", async () => {
    const { inspectClip } = await import("@/server/media");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "assemblyline-media-"));
    const clipPath = path.join(tempDir, "clip.mp4");
    await writeFile(clipPath, Buffer.from("fallback"));
    spawnSyncMock.mockReturnValue({ status: 1, stdout: "", stderr: "not found" });

    await expect(inspectClip(clipPath)).resolves.toMatchObject({
      durationMs: 1000,
      width: 1024,
      height: 576,
      codec: "mock",
      fileSizeBytes: 8,
      ffmpeg: { available: false },
    });
  });

  it("processes thumbnail jobs with ffmpeg and completes the generation job", async () => {
    const { processMediaUtilityJob } = await import("@/server/media");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "assemblyline-media-"));
    const clipPath = path.join(tempDir, "clip.mp4");
    const thumbPath = path.join(tempDir, "thumbs", "clip.jpg");
    await writeFile(clipPath, Buffer.from("fake-video"));
    await mkdir(path.dirname(thumbPath), { recursive: true });
    await writeFile(thumbPath, Buffer.from("fake-thumbnail"));
    repositoryMocks.markGenerationJobRunning.mockResolvedValue({
      id: "job-1",
      projectId: "project-1",
      type: "thumbnail",
    });
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "ffmpeg version 7" });

    await expect(
      processMediaUtilityJob({
        jobId: "job-1",
        projectId: "project-1",
        type: "thumbnail",
        sourceFilePath: clipPath,
        outputFilePath: thumbPath,
        seekSeconds: 2,
      }),
    ).resolves.toMatchObject({
      type: "thumbnail",
      sourceFilePath: clipPath,
      outputFilePath: thumbPath,
      fileSizeBytes: 14,
    });

    expect(spawnSyncMock).toHaveBeenCalledWith("ffmpeg", ["-version"], expect.any(Object));
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "ffmpeg",
      ["-y", "-ss", "2", "-i", clipPath, "-frames:v", "1", thumbPath],
      expect.any(Object),
    );
    expect(repositoryMocks.completeGenerationJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "complete",
        outputPayload: expect.objectContaining({ type: "thumbnail", outputFilePath: thumbPath }),
      }),
    );
    expect(repositoryMocks.addJobEvent).toHaveBeenCalledWith(expect.objectContaining({ progressPct: 100 }));
  });

  it("rejects media utility jobs when ffmpeg is unavailable", async () => {
    const { processMediaUtilityJob } = await import("@/server/media");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "assemblyline-media-"));
    const clipPath = path.join(tempDir, "clip.mp4");
    const thumbPath = path.join(tempDir, "thumbs", "clip.jpg");
    await writeFile(clipPath, Buffer.from("fake-video"));
    repositoryMocks.markGenerationJobRunning.mockResolvedValue({
      id: "job-1",
      projectId: "project-1",
      type: "thumbnail",
    });
    spawnSyncMock.mockReturnValue({ status: 1, stdout: "", stderr: "not found" });

    await expect(
      processMediaUtilityJob({
        jobId: "job-1",
        projectId: "project-1",
        type: "thumbnail",
        sourceFilePath: clipPath,
        outputFilePath: thumbPath,
      }),
    ).rejects.toMatchObject({ code: "ffmpeg_unavailable" });
    expect(repositoryMocks.completeGenerationJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "failed",
        errorMessage: "ffmpeg is required for media utility jobs.",
      }),
    );
  });
});
