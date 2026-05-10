import { Buffer } from "node:buffer";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  STORAGE_ROOT: z.string().min(1).default("./storage"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | undefined;

function developmentFallbacks() {
  if (process.env.NODE_ENV === "production") {
    return {};
  }

  return {
    DATABASE_URL: "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline",
    REDIS_URL: "redis://localhost:6379",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "development-secret-replace-before-production",
    ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    STORAGE_ROOT: "./storage",
    LOG_LEVEL: "info",
  };
}

export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = configSchema.parse({
      ...developmentFallbacks(),
      ...process.env,
    });
  }

  return cachedConfig;
}

export function resetConfigForTests() {
  cachedConfig = undefined;
}
