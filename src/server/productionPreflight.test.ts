import { describe, expect, it } from "vitest";
import { evaluateProductionPreflight } from "../../scripts/production-preflight";

const validEnv = {
  DATABASE_URL: "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_URL: "https://assemblyline.example.com",
  NEXTAUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  OPENAI_API_KEY: "sk-live-test",
  STABILITY_API_KEY: "sk-stability-live-test",
  RUNWAYML_API_SECRET: "key_runway_live",
};

describe("production preflight", () => {
  it("accepts the required production configuration shape", () => {
    const results = evaluateProductionPreflight(validEnv, () => true);

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("reports missing services, weak secrets, mock provider keys, and missing media tools", () => {
    const results = evaluateProductionPreflight(
      {
        DATABASE_URL: "",
        REDIS_URL: "",
        NEXTAUTH_URL: "https://assemblyline.example.com",
        NEXTAUTH_SECRET: "short",
        ENCRYPTION_KEY: "not-32-bytes",
        OPENAI_API_KEY: "mock",
        STABILITY_API_KEY: "mock",
        RUNWAYML_API_SECRET: "mock",
      },
      () => false,
    );

    expect(results.filter((result) => !result.ok).map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "REDIS_URL",
        "NEXTAUTH_SECRET length",
        "ENCRYPTION_KEY length",
        "OPENAI_API_KEY",
        "STABILITY_API_KEY",
        "RUNWAYML_API_SECRET",
        "ffmpeg",
        "ffprobe",
      ]),
    );
  });
});
