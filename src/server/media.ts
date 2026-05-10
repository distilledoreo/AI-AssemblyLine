import { access } from "node:fs/promises";
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
  return {
    durationMs: 1000,
    width: 1024,
    height: 576,
    codec: ffmpeg.available ? "h264" : "mock",
    ffmpeg,
  };
}
