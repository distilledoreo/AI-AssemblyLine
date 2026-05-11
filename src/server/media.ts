import { mkdir, access, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { AppError, NotFoundError } from "@/server/errors";
import { addJobEvent, completeGenerationJob, markGenerationJobRunning } from "@/server/repository";
import type { GenerationJobType } from "@/server/types";

export function checkFfmpegAvailability() {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return {
    available: result.status === 0,
    message: result.status === 0 ? "ffmpeg available" : "ffmpeg not found on PATH; using placeholder metadata.",
  };
}

export async function inspectClip(filePath: string) {
  await access(filePath);
  const ffmpeg = checkFfmpegAvailability();
  const fileStats = await stat(filePath);
  const probe = probeClip(filePath);
  if (probe) {
    return {
      ...probe,
      fileSizeBytes: fileStats.size,
      ffmpeg,
    };
  }
  return {
    durationMs: 1000,
    width: 1024,
    height: 576,
    codec: ffmpeg.available ? "h264" : "mock",
    fileSizeBytes: fileStats.size,
    ffmpeg,
  };
}

export async function processMediaUtilityJob(input: {
  jobId: string;
  projectId: string;
  type: Extract<GenerationJobType, "thumbnail" | "media_convert">;
  sourceFilePath: string;
  outputFilePath?: string;
  seekSeconds?: number;
}) {
  const job = await markGenerationJobRunning(input.jobId, "processing_output");
  if (!job) {
    throw new NotFoundError("Generation job not found.");
  }
  try {
    await access(input.sourceFilePath);
    await addJobEvent({
      jobId: job.id,
      projectId: input.projectId,
      eventType: "progress",
      message: input.type === "thumbnail" ? "Generating media thumbnail." : "Converting media file.",
      progressPct: 25,
    });

    const result =
      input.type === "thumbnail"
        ? await generateThumbnail(input.sourceFilePath, requireOutputPath(input.outputFilePath, "thumbnail"), input.seekSeconds)
        : await convertMedia(input.sourceFilePath, requireOutputPath(input.outputFilePath, "media_convert"));

    await completeGenerationJob(job.id, {
      status: "complete",
      outputPayload: result,
    });
    await addJobEvent({
      jobId: job.id,
      projectId: input.projectId,
      eventType: "status_change",
      message: input.type === "thumbnail" ? "Media thumbnail complete." : "Media conversion complete.",
      progressPct: 100,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media utility job failed.";
    await completeGenerationJob(job.id, { status: "failed", errorMessage: message });
    await addJobEvent({
      jobId: job.id,
      projectId: input.projectId,
      eventType: "status_change",
      message,
      progressPct: 100,
    });
    throw error;
  }
}

async function generateThumbnail(sourceFilePath: string, outputFilePath: string, seekSeconds = 1) {
  assertFfmpegAvailable();
  await mkdir(path.dirname(outputFilePath), { recursive: true });
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(Math.max(0, seekSeconds)),
      "-i",
      sourceFilePath,
      "-frames:v",
      "1",
      outputFilePath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new AppError(`Thumbnail generation failed: ${result.stderr || result.stdout || "ffmpeg exited with an error."}`, 500, "media_thumbnail_failed");
  }
  const fileStats = await stat(outputFilePath);
  return {
    type: "thumbnail" as const,
    sourceFilePath,
    outputFilePath,
    fileSizeBytes: fileStats.size,
  };
}

async function convertMedia(sourceFilePath: string, outputFilePath: string) {
  assertFfmpegAvailable();
  await mkdir(path.dirname(outputFilePath), { recursive: true });
  const result = spawnSync("ffmpeg", ["-y", "-i", sourceFilePath, outputFilePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new AppError(`Media conversion failed: ${result.stderr || result.stdout || "ffmpeg exited with an error."}`, 500, "media_convert_failed");
  }
  const info = await inspectClip(outputFilePath);
  return {
    type: "media_convert" as const,
    sourceFilePath,
    outputFilePath,
    media: info,
  };
}

function requireOutputPath(outputFilePath: string | undefined, jobType: "thumbnail" | "media_convert") {
  if (!outputFilePath) {
    throw new AppError(`${jobType} jobs require outputFilePath.`, 400, "media_output_path_required");
  }
  return outputFilePath;
}

function assertFfmpegAvailable() {
  const ffmpeg = checkFfmpegAvailability();
  if (!ffmpeg.available) {
    throw new AppError("ffmpeg is required for media utility jobs.", 503, "ffmpeg_unavailable");
  }
}

function probeClip(filePath: string) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const durationSeconds = Number(parsed.format?.duration);
    return {
      durationMs: Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds * 1000)) : 1000,
      width: Number.isFinite(stream?.width) ? stream?.width ?? 1024 : 1024,
      height: Number.isFinite(stream?.height) ? stream?.height ?? 576 : 576,
      codec: stream?.codec_name ?? "unknown",
    };
  } catch {
    return undefined;
  }
}
