import { describe, expect, it } from "vitest";
import { evaluateProductionPreflight } from "../../scripts/production-preflight";

const validEnv = {
  DATABASE_URL: "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_URL: "https://assemblyline.example.com",
  NEXTAUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  STORAGE_ROOT: "./storage",
  QUEUE_MODE: "redis",
  OPENAI_API_KEY: "sk-live-test",
  STABILITY_API_KEY: "sk-stability-live-test",
  RUNWAYML_API_SECRET: "key_runway_live",
  AUTH_GOOGLE_ID: "google-client",
  AUTH_GOOGLE_SECRET: "google-secret",
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
        "STORAGE_ROOT",
        "OPENAI_API_KEY",
        "STABILITY_API_KEY",
        "RUNWAYML_API_SECRET",
        "ffmpeg",
        "ffprobe",
      ]),
    );
  });

  it("allows omitted OAuth providers but rejects partial OAuth configuration", () => {
    const omitted = evaluateProductionPreflight({ ...validEnv, AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "" }, () => true);
    expect(omitted.find((result) => result.name === "Google OAuth")).toMatchObject({
      ok: true,
      detail: "not configured",
    });

    const partial = evaluateProductionPreflight({ ...validEnv, AUTH_GOOGLE_SECRET: "" }, () => true);
    expect(partial.find((result) => result.name === "Google OAuth")).toMatchObject({
      ok: false,
      detail: "client id and secret must be configured together",
    });
  });

  it("requires production queue mode to be redis or unset", () => {
    const redis = evaluateProductionPreflight(validEnv, () => true);
    expect(redis.find((result) => result.name === "QUEUE_MODE")).toMatchObject({
      ok: true,
      detail: "redis",
    });

    const defaultsToRedis = evaluateProductionPreflight({ ...validEnv, QUEUE_MODE: "" }, () => true);
    expect(defaultsToRedis.find((result) => result.name === "QUEUE_MODE")).toMatchObject({
      ok: true,
      detail: "unset; production defaults to redis",
    });

    const inline = evaluateProductionPreflight({ ...validEnv, QUEUE_MODE: "inline" }, () => true);
    expect(inline.find((result) => result.name === "QUEUE_MODE")).toMatchObject({
      ok: false,
      detail: "must be unset or redis for production",
    });
  });
});
