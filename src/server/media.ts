import { access, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

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
