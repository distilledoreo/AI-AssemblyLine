import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

describe("media inspection", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    spawnSyncMock.mockReset();
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
});
