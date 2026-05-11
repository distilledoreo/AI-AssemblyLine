import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.unstubAllEnvs();
    resetConfigForTests();
  });

  it("reports ok only when Postgres and Redis are reachable", async () => {
    process.env.DATABASE_URL = "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NEXTAUTH_SECRET = "test-secret-with-at-least-32-chars";
    process.env.ENCRYPTION_KEY = "base64-test-key-with-at-least-32-chars";
    process.env.OPENAI_API_KEY = "sk-live-health";
    process.env.STABILITY_API_KEY = "sk-stability-health";
    process.env.RUNWAYML_API_SECRET = "key_runway_health";
    resetConfigForTests();

    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue("PONG");

    const health = await import("@/server/health");
    await expect(health.getAppHealthSnapshot()).resolves.toMatchObject({
      status: "ok",
      database: { configured: true, reachable: true, provider: "postgresql" },
      redis: { configured: true, reachable: true },
      providerEnv: {
        openai: { configured: true, envVar: "OPENAI_API_KEY" },
        stability: { configured: true, envVar: "STABILITY_API_KEY" },
        runway: { configured: true, envVar: "RUNWAYML_API_SECRET" },
      },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(RedisConstructorMock).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ lazyConnect: true, connectTimeout: 1000 }),
    );
    expect(redisMock.disconnect).toHaveBeenCalled();
  });

  it("reports degraded with dependency errors when checks fail", async () => {
    process.env.DATABASE_URL = "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.OPENAI_API_KEY = " MOCK ";
    resetConfigForTests();

    prismaMock.$queryRaw.mockRejectedValue(new Error("database down"));
    redisMock.connect.mockRejectedValue(new Error("redis down"));

    const health = await import("@/server/health");
    const snapshot = await health.getAppHealthSnapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.database).toMatchObject({ configured: true, reachable: false, error: "database down" });
    expect(snapshot.redis).toMatchObject({ configured: true, reachable: false, error: "redis down" });
    expect(snapshot.providerEnv).toMatchObject({
      openai: { configured: false },
      stability: { configured: false },
      runway: { configured: false },
    });
  });

  it("redacts dependency exception details in production health responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://assemblyline:secret@localhost:5432/assemblyline";
    process.env.REDIS_URL = "redis://:secret@localhost:6379";
    process.env.NEXTAUTH_URL = "https://assemblyline.example.com";
    process.env.NEXTAUTH_SECRET = "production-secret-with-at-least-32-chars";
    process.env.ENCRYPTION_KEY = "production-encryption-key-with-32-chars";
    resetConfigForTests();

    prismaMock.$queryRaw.mockRejectedValue(new Error("password authentication failed for user assemblyline"));
    redisMock.connect.mockRejectedValue(new Error("NOAUTH Authentication required"));

    const health = await import("@/server/health");
    const snapshot = await health.getAppHealthSnapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.database.error).toBe("Database health check failed.");
    expect(snapshot.redis.error).toBe("Redis health check failed.");
  });
});
