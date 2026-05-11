import ffmpegStaticPath from "ffmpeg-static";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path?: string };

export type MediaBinaryName = "ffmpeg" | "ffprobe";
export type MediaBinarySource = "env" | "bundled" | "path";

export type ResolvedMediaBinary = {
  name: MediaBinaryName;
  command: string;
  source: MediaBinarySource;
  envVar?: string;
};

const envVarByName: Record<MediaBinaryName, string> = {
  ffmpeg: "FFMPEG_PATH",
  ffprobe: "FFPROBE_PATH",
};

const bundledPathByName: Record<MediaBinaryName, string | undefined> = {
  ffmpeg: ffmpegStaticPath ?? undefined,
  ffprobe: ffprobeStatic.path,
};

export function resolveMediaBinary(name: MediaBinaryName, env: Record<string, string | undefined> = process.env): ResolvedMediaBinary {
  const envVar = envVarByName[name];
  const configured = env[envVar]?.trim();
  if (configured) {
    return { name, command: configured, source: "env", envVar };
  }
  const bundled = bundledPathByName[name];
  if (bundled) {
    return { name, command: bundled, source: "bundled" };
  }
  return { name, command: name, source: "path" };
}

export function mediaBinarySourceDetail(binary: ResolvedMediaBinary) {
  if (binary.source === "env") {
    return `${binary.envVar}=${binary.command}`;
  }
  if (binary.source === "bundled") {
    return `bundled ${binary.command}`;
  }
  return "PATH";
}
