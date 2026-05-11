import { describe, expect, it } from "vitest";
import { resolveMediaBinary } from "@/server/mediaBinaries";

describe("media binary resolution", () => {
  it("prefers explicit operator-managed paths", () => {
    expect(resolveMediaBinary("ffmpeg", { FFMPEG_PATH: "C:/tools/ffmpeg.exe" })).toEqual({
      name: "ffmpeg",
      command: "C:/tools/ffmpeg.exe",
      source: "env",
      envVar: "FFMPEG_PATH",
    });
    expect(resolveMediaBinary("ffprobe", { FFPROBE_PATH: "/opt/bin/ffprobe" })).toEqual({
      name: "ffprobe",
      command: "/opt/bin/ffprobe",
      source: "env",
      envVar: "FFPROBE_PATH",
    });
  });

  it("uses bundled static binaries when no explicit path is configured", () => {
    expect(resolveMediaBinary("ffmpeg", {})).toMatchObject({ name: "ffmpeg", source: "bundled" });
    expect(resolveMediaBinary("ffprobe", {})).toMatchObject({ name: "ffprobe", source: "bundled" });
  });
});
