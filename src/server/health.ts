import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import IORedis from "ioredis";
import { getConfig } from "@/lib/config";
import { isLiveProviderApiKey } from "@/providers/providerKeySafety";
import type { LiveProviderSlug } from "@/providers/liveProviderCatalog";
import { LIVE_PROVIDER_SLUGS } from "@/providers/liveProviderCatalog";
import { prisma } from "@/server/prisma";

export type DependencyHealth = {
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
};

export type StorageHealth = {
  configured: boolean;
  writable: boolean;
  root: string;
  error?: string;
};

export type AppHealthSnapshot = {
  status: "ok" | "degraded";
  database: DependencyHealth & { provider: "postgresql" };
  redis: DependencyHealth;
  storage: StorageHealth;
  providerEnv: Record<LiveProviderSlug, { configured: boolean; envVar: string }>;
  storageRoot: string;
};

export async function getAppHealthSnapshot(): Promise<AppHealthSnapshot> {
  const config = getConfig();
  const [database, redis, storage] = await Promise.all([
    checkDatabase(Boolean(config.DATABASE_URL)),
    checkRedis(config.REDIS_URL),
    checkStorage(config.STORAGE_ROOT),
  ]);

  return {
    status: database.reachable && redis.reachable && storage.writable ? "ok" : "degraded",
    database: { provider: "postgresql", ...database },
    redis,
    storage,
    providerEnv: checkProviderEnv(),
    storageRoot: config.STORAGE_ROOT,
  };
}

function checkProviderEnv(): AppHealthSnapshot["providerEnv"] {
  const envByProvider: Record<LiveProviderSlug, string> = {
    openai: "OPENAI_API_KEY",
    stability: "STABILITY_API_KEY",
    runway: "RUNWAYML_API_SECRET",
    "google-ai": "GEMINI_API_KEY",
  };
  return Object.fromEntries(
    LIVE_PROVIDER_SLUGS.map((provider) => {
      const envVar = envByProvider[provider];
      return [provider, { envVar, configured: isLiveProviderApiKey(process.env[envVar]) }];
    }),
  ) as AppHealthSnapshot["providerEnv"];
}

async function checkDatabase(configured: boolean): Promise<DependencyHealth> {
  if (!configured) {
    return { configured: false, reachable: false, error: "DATABASE_URL is not configured." };
  }
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { configured: true, reachable: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - started,
      error: healthErrorMessage(error, "Database health check failed."),
    };
  }
}

async function checkRedis(redisUrl: string): Promise<DependencyHealth> {
  if (!redisUrl) {
    return { configured: false, reachable: false, error: "REDIS_URL is not configured." };
  }
  const started = Date.now();
  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
  });
  try {
    await redis.connect();
    await redis.ping();
    return { configured: true, reachable: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - started,
      error: healthErrorMessage(error, "Redis health check failed."),
    };
  } finally {
    redis.disconnect();
  }
}

async function checkStorage(storageRoot: string): Promise<StorageHealth> {
  if (!storageRoot) {
    return { configured: false, writable: false, root: "", error: "STORAGE_ROOT is not configured." };
  }
  const root = path.resolve(storageRoot);
  const probePath = path.join(root, `.assemblyline-health-${process.pid}-${Date.now()}.tmp`);
  try {
    await mkdir(root, { recursive: true });
    await writeFile(probePath, "ok", { flag: "wx" });
    await rm(probePath, { force: true });
    return { configured: true, writable: true, root };
  } catch (error) {
    await rm(probePath, { force: true }).catch(() => undefined);
    return {
      configured: true,
      writable: false,
      root,
      error: healthErrorMessage(error, "Storage health check failed."),
    };
  }
}

function healthErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === "production" && process.env.HEALTH_VERBOSE_ERRORS !== "1") {
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
