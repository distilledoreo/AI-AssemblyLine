import IORedis from "ioredis";
import { getConfig } from "@/lib/config";
import type { LiveProviderSlug } from "@/providers/liveProviderCatalog";
import { LIVE_PROVIDER_SLUGS } from "@/providers/liveProviderCatalog";
import { prisma } from "@/server/prisma";

export type DependencyHealth = {
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
};

export type AppHealthSnapshot = {
  status: "ok" | "degraded";
  database: DependencyHealth & { provider: "postgresql" };
  redis: DependencyHealth;
  providerEnv: Record<LiveProviderSlug, { configured: boolean; envVar: string }>;
  storageRoot: string;
};

export async function getAppHealthSnapshot(): Promise<AppHealthSnapshot> {
  const config = getConfig();
  const [database, redis] = await Promise.all([
    checkDatabase(Boolean(config.DATABASE_URL)),
    checkRedis(config.REDIS_URL),
  ]);

  return {
    status: database.reachable && redis.reachable ? "ok" : "degraded",
    database: { provider: "postgresql", ...database },
    redis,
    providerEnv: checkProviderEnv(),
    storageRoot: config.STORAGE_ROOT,
  };
}

function checkProviderEnv(): AppHealthSnapshot["providerEnv"] {
  const envByProvider: Record<LiveProviderSlug, string> = {
    openai: "OPENAI_API_KEY",
    stability: "STABILITY_API_KEY",
    runway: "RUNWAYML_API_SECRET",
  };
  return Object.fromEntries(
    LIVE_PROVIDER_SLUGS.map((provider) => {
      const envVar = envByProvider[provider];
      const value = process.env[envVar]?.trim();
      return [provider, { envVar, configured: Boolean(value && value !== "mock") }];
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

function healthErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === "production" && process.env.HEALTH_VERBOSE_ERRORS !== "1") {
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
