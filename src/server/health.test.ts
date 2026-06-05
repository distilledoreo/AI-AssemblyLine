import { afterEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resetConfigForTests } from "@/lib/config";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

const redisMock = vi.hoisted(() => ({
  connect: vi.fn(),
  ping: vi.fn(),
  disconnect: vi.fn(),
}));

const RedisConstructorMock = vi.hoisted(() => vi.fn(function Redis() {
  return redisMock;
}));

vi.mock("@/server/prisma", () => ({ prisma: prismaMock }));
vi.mock("ioredis", () => ({ default: RedisConstructorMock }));

describe("health checks", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.HEALTH_VERBOSE_ERRORS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STABILITY_API_KEY;
    delete process.env.RUNWAYML_API_SECRET;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    vi.unstubAllEnvs();
    resetConfigForTests();
  });

  it("reports ok only when Postgres and Redis are reachable", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-health-storage-"));
    process.env.DATABASE_URL = "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NEXTAUTH_SECRET = "test-secret-with-at-least-32-chars";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    process.env.STORAGE_ROOT = storageRoot;
    process.env.OPENAI_API_KEY = "sk-live-health-abc123";
    process.env.STABILITY_API_KEY = "sk-stability-health-abc123";
    process.env.RUNWAYML_API_SECRET = "key-runway-health-abc123";
    process.env.GOOGLE_AI_API_KEY = "google-ai-live-health-abc123";
    resetConfigForTests();

    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue("PONG");

    const health = await import("@/server/health");
    await expect(health.getAppHealthSnapshot()).resolves.toMatchObject({
      status: "ok",
      database: { configured: true, reachable: true, provider: "postgresql" },
      redis: { configured: true, reachable: true },
      storage: { configured: true, writable: true, root: storageRoot },
      providerEnv: {
        openai: { configured: true, envVar: "OPENAI_API_KEY" },
        stability: { configured: true, envVar: "STABILITY_API_KEY" },
        runway: { configured: true, envVar: "RUNWAYML_API_SECRET" },
        "google-ai": { configured: true, envVar: "GEMINI_API_KEY or GOOGLE_AI_API_KEY" },
      },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(RedisConstructorMock).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ lazyConnect: true, connectTimeout: 1000 }),
    );
    expect(redisMock.disconnect).toHaveBeenCalled();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("reports degraded with dependency errors when checks fail", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-health-storage-"));
    const blockedStoragePath = path.join(storageRoot, "not-a-directory");
    await writeFile(blockedStoragePath, "blocking file");
    process.env.DATABASE_URL = "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.STORAGE_ROOT = blockedStoragePath;
    process.env.OPENAI_API_KEY = " MOCK ";
    resetConfigForTests();

    prismaMock.$queryRaw.mockRejectedValue(new Error("database down"));
    redisMock.connect.mockRejectedValue(new Error("redis down"));

    const health = await import("@/server/health");
    const snapshot = await health.getAppHealthSnapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.database).toMatchObject({ configured: true, reachable: false, error: "database down" });
    expect(snapshot.redis).toMatchObject({ configured: true, reachable: false, error: "redis down" });
    expect(snapshot.storage).toMatchObject({ configured: true, writable: false });
    expect(snapshot.providerEnv).toMatchObject({
      openai: { configured: false },
      stability: { configured: false },
      runway: { configured: false },
      "google-ai": { configured: false },
    });
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("redacts dependency exception details in production health responses", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-health-storage-"));
    const blockedStoragePath = path.join(storageRoot, "not-a-directory");
    await writeFile(blockedStoragePath, "blocking file");
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://assemblyline:secret@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://:secret@localhost:6379";
    process.env.NEXTAUTH_URL = "https://assemblyline.example.com";
    process.env.NEXTAUTH_SECRET = "production-secret-with-at-least-32-chars";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    process.env.STORAGE_ROOT = blockedStoragePath;
    resetConfigForTests();

    prismaMock.$queryRaw.mockRejectedValue(new Error("password authentication failed for user assemblyline"));
    redisMock.connect.mockRejectedValue(new Error("NOAUTH Authentication required"));

    const health = await import("@/server/health");
    const snapshot = await health.getAppHealthSnapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.database.error).toBe("Database health check failed.");
    expect(snapshot.redis.error).toBe("Redis health check failed.");
    expect(snapshot.storage.error).toBe("Storage health check failed.");
    await rm(storageRoot, { recursive: true, force: true });
  });
});
