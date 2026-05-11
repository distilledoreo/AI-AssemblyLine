import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVELOPMENT_ENCRYPTION_KEY,
  DEVELOPMENT_NEXTAUTH_SECRET,
  getConfig,
  resetConfigForTests,
} from "@/lib/config";

const validEnv = {
  DATABASE_URL: "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_URL: "https://assemblyline.example.com",
  NEXTAUTH_SECRET: "production-secret-with-at-least-32-chars",
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
};

describe("runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigForTests();
  });

  it("accepts a base64 encryption key that decodes to exactly 32 bytes", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }

    expect(getConfig().ENCRYPTION_KEY).toBe(validEnv.ENCRYPTION_KEY);
  });

  it("rejects encryption keys that do not decode to exactly 32 bytes", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, ENCRYPTION_KEY: "not-32-decoded-bytes" })) {
      vi.stubEnv(key, value);
    }

    expect(() => getConfig()).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects development fallback secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({
      ...validEnv,
      NEXTAUTH_SECRET: DEVELOPMENT_NEXTAUTH_SECRET,
      ENCRYPTION_KEY: DEVELOPMENT_ENCRYPTION_KEY,
    })) {
      vi.stubEnv(key, value);
    }

    expect(() => getConfig()).toThrow(/development fallback/);
  });

  it("rejects insecure or deep-link NEXTAUTH_URL values in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, NEXTAUTH_URL: "http://assemblyline.example.com/signin" })) {
      vi.stubEnv(key, value);
    }

    expect(() => getConfig()).toThrow(/NEXTAUTH_URL/);
  });

  it("allows localhost HTTP NEXTAUTH_URL values for local production verification", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, NEXTAUTH_URL: "http://localhost:3000" })) {
      vi.stubEnv(key, value);
    }

    expect(getConfig().NEXTAUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects inline queues in production runtime config", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, QUEUE_MODE: "inline" })) {
      vi.stubEnv(key, value);
    }

    expect(() => getConfig()).toThrow(/QUEUE_MODE/);
  });

  it("rejects explicit memory repository mode in production runtime config", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, REPOSITORY_MODE: "memory" })) {
      vi.stubEnv(key, value);
    }

    expect(() => getConfig()).toThrow(/REPOSITORY_MODE/);
  });

  it("accepts redis queue and prisma repository modes in production runtime config", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ ...validEnv, QUEUE_MODE: "redis", REPOSITORY_MODE: "prisma" })) {
      vi.stubEnv(key, value);
    }

    expect(getConfig()).toMatchObject({ QUEUE_MODE: "redis", REPOSITORY_MODE: "prisma" });
  });
});
