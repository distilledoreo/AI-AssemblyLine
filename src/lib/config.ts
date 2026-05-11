import { Buffer } from "node:buffer";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().url().refine((value) => process.env.NODE_ENV !== "production" || isProductionAuthOrigin(value), {
    message: "must be an https origin URL outside localhost",
  }),
  NEXTAUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().refine((value) => decodeBase64Length(value) === 32, {
    message: "must decode to exactly 32 bytes",
  }),
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

function decodeBase64Length(value: string) {
  try {
    return Buffer.from(value, "base64").length;
  } catch {
    return 0;
  }
}

function isProductionAuthOrigin(value: string) {
  try {
    const url = new URL(value);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const isLocal = localHosts.has(url.hostname);
    const hasOnlyOriginPath = !url.pathname || url.pathname === "/";
    return (url.protocol === "https:" || isLocal) && hasOnlyOriginPath && !url.search && !url.hash;
  } catch {
    return false;
  }
}
