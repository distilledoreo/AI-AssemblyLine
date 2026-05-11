import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkStorageRoot, evaluateProductionPreflight, runProductionPreflight } from "../../scripts/production-preflight";

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
        OPENAI_API_KEY: "MOCK",
        STABILITY_API_KEY: " Mock ",
        RUNWAYML_API_SECRET: "mOcK",
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

  it("requires NEXTAUTH_URL to be an absolute https URL outside localhost", () => {
    const https = evaluateProductionPreflight(validEnv, () => true);
    expect(https.find((result) => result.name === "NEXTAUTH_URL format")).toMatchObject({
      ok: true,
      detail: "https URL",
    });

    const localhost = evaluateProductionPreflight({ ...validEnv, NEXTAUTH_URL: "http://localhost:3000" }, () => true);
    expect(localhost.find((result) => result.name === "NEXTAUTH_URL format")).toMatchObject({
      ok: true,
      detail: "local URL allowed",
    });

    const insecure = evaluateProductionPreflight({ ...validEnv, NEXTAUTH_URL: "http://assemblyline.example.com" }, () => true);
    expect(insecure.find((result) => result.name === "NEXTAUTH_URL format")).toMatchObject({
      ok: false,
      detail: "must use https outside localhost",
    });

    const invalid = evaluateProductionPreflight({ ...validEnv, NEXTAUTH_URL: "assemblyline.example.com" }, () => true);
    expect(invalid.find((result) => result.name === "NEXTAUTH_URL format")).toMatchObject({
      ok: false,
      detail: "must be a valid absolute URL",
    });

    const deepLink = evaluateProductionPreflight({ ...validEnv, NEXTAUTH_URL: "https://assemblyline.example.com/signin?next=dashboard" }, () => true);
    expect(deepLink.find((result) => result.name === "NEXTAUTH_URL format")).toMatchObject({
      ok: false,
      detail: "must be an origin without path, query, or fragment",
    });
  });

  it("verifies the storage root is configured and writable", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-preflight-"));
    try {
      await expect(checkStorageRoot(tempRoot)).resolves.toMatchObject({
        name: "STORAGE_ROOT",
        ok: true,
      });

      await expect(checkStorageRoot("")).resolves.toEqual({
        name: "STORAGE_ROOT",
        ok: false,
        detail: "missing",
      });

      const filePath = path.join(tempRoot, "not-a-directory");
      await writeFile(filePath, "already a file");
      await expect(checkStorageRoot(filePath)).resolves.toMatchObject({
        name: "STORAGE_ROOT",
        ok: false,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-Postgres and non-Redis dependency URLs before TCP checks", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-preflight-"));
    try {
      const results = await runProductionPreflight({
        ...validEnv,
        DATABASE_URL: "mysql://localhost:3306/assemblyline",
        REDIS_URL: "http://localhost:6379",
        STORAGE_ROOT: tempRoot,
      });

      expect(results.find((result) => result.name === "Postgres TCP")).toMatchObject({
        ok: false,
        detail: "URL must use postgres or postgresql",
      });
      expect(results.find((result) => result.name === "Redis TCP")).toMatchObject({
        ok: false,
        detail: "URL must use redis or rediss",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
