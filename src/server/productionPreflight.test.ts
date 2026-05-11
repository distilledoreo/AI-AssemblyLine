import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_ENCRYPTION_KEY, DEVELOPMENT_NEXTAUTH_SECRET } from "@/lib/config";
import {
  checkStorageRoot,
  checkDependencyAudit,
  checkPrismaSchema,
  checkPrismaMigrations,
  evaluateProductionPreflight,
  loadProductionEnvFiles,
  runProductionPreflight,
} from "../../scripts/production-preflight";

const validEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://assemblyline:assemblyline@localhost:5432/assemblyline",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_URL: "https://assemblyline.example.com",
  NEXTAUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  STORAGE_ROOT: "./storage",
  QUEUE_MODE: "redis",
  OPENAI_API_KEY: "sk-prod-openai-smoke-abc123",
  STABILITY_API_KEY: "sk-stability-prod-smoke-abc123",
  RUNWAYML_API_SECRET: "rw-prod-runway-smoke-abc123",
  GEMINI_API_KEY: "gemini-prod-veo-smoke-abc123",
  AUTH_GOOGLE_ID: "google-client",
  AUTH_GOOGLE_SECRET: "google-secret",
};

describe("production preflight", () => {
  it("accepts the required production configuration shape", () => {
    const results = evaluateProductionPreflight(validEnv, () => true);

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("loads production env files while preserving exported environment overrides", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-env-"));
    try {
      await writeFile(
        path.join(tempRoot, ".env"),
        [
          "DATABASE_URL=postgresql://from-env",
          'NEXTAUTH_SECRET="base secret"',
          "PLAIN_VALUE=kept # with comment",
          "export EXPORTED_VALUE=from-export",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(tempRoot, ".env.production"),
        [
          "DATABASE_URL=postgresql://from-production",
          "REDIS_URL='redis://from-production'",
          "NEXTAUTH_SECRET=production secret",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(tempRoot, ".env.production.local"),
        ["REDIS_URL=redis://from-production-local", "NEXTAUTH_URL=https://assemblyline.example.com", ""].join("\n"),
      );

      await expect(loadProductionEnvFiles(tempRoot, { DATABASE_URL: "postgresql://from-shell" })).resolves.toMatchObject({
        DATABASE_URL: "postgresql://from-shell",
        REDIS_URL: "redis://from-production-local",
        NEXTAUTH_URL: "https://assemblyline.example.com",
        NEXTAUTH_SECRET: "production secret",
        PLAIN_VALUE: "kept",
        EXPORTED_VALUE: "from-export",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("requires NODE_ENV production for release verification", () => {
    const results = evaluateProductionPreflight({ ...validEnv, NODE_ENV: "" }, () => true);

    expect(results.find((result) => result.name === "NODE_ENV")).toMatchObject({
      ok: false,
      detail: "must be production for release verification",
    });
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
        GEMINI_API_KEY: "mock",
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
        "GEMINI_API_KEY or GOOGLE_AI_API_KEY",
        "ffmpeg",
        "ffprobe",
      ]),
    );
  });

  it("rejects checked-in provider key examples as live smoke credentials", () => {
    const results = evaluateProductionPreflight(
      {
        ...validEnv,
        OPENAI_API_KEY: "sk-live-test",
        STABILITY_API_KEY: "sk-stability-live-test",
        RUNWAYML_API_SECRET: "key_runway_live",
        GEMINI_API_KEY: "mock",
      },
      () => true,
    );

    expect(results.find((result) => result.name === "OPENAI_API_KEY")).toMatchObject({
      ok: false,
      detail: "missing, mock, or placeholder",
    });
    expect(results.find((result) => result.name === "STABILITY_API_KEY")).toMatchObject({
      ok: false,
      detail: "missing, mock, or placeholder",
    });
    expect(results.find((result) => result.name === "RUNWAYML_API_SECRET")).toMatchObject({
      ok: false,
      detail: "missing, mock, or placeholder",
    });
    expect(results.find((result) => result.name === "GEMINI_API_KEY or GOOGLE_AI_API_KEY")).toMatchObject({
      ok: false,
      detail: "missing, mock, or placeholder",
    });
  });

  it("accepts GOOGLE_AI_API_KEY as the Google Veo production key fallback", () => {
    const results = evaluateProductionPreflight(
      {
        ...validEnv,
        GEMINI_API_KEY: "",
        GOOGLE_AI_API_KEY: "google-ai-prod-veo-smoke-abc123",
      },
      () => true,
    );

    expect(results.find((result) => result.name === "GEMINI_API_KEY or GOOGLE_AI_API_KEY")).toMatchObject({
      ok: true,
      detail: "configured for live Veo submission",
    });
  });

  it("rejects development fallback secrets even when their shape is otherwise valid", () => {
    const results = evaluateProductionPreflight(
      {
        ...validEnv,
        NEXTAUTH_SECRET: DEVELOPMENT_NEXTAUTH_SECRET,
        ENCRYPTION_KEY: DEVELOPMENT_ENCRYPTION_KEY,
      },
      () => true,
    );

    expect(results.find((result) => result.name === "NEXTAUTH_SECRET length")).toMatchObject({ ok: true });
    expect(results.find((result) => result.name === "ENCRYPTION_KEY length")).toMatchObject({ ok: true });
    expect(results.find((result) => result.name === "NEXTAUTH_SECRET production value")).toMatchObject({
      ok: false,
      detail: "must not use the development fallback secret",
    });
    expect(results.find((result) => result.name === "ENCRYPTION_KEY production value")).toMatchObject({
      ok: false,
      detail: "must not use the development fallback encryption key",
    });
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

  it("requires production repository mode to be prisma or unset", () => {
    const prisma = evaluateProductionPreflight({ ...validEnv, REPOSITORY_MODE: "prisma" }, () => true);
    expect(prisma.find((result) => result.name === "REPOSITORY_MODE")).toMatchObject({
      ok: true,
      detail: "prisma",
    });

    const defaultsToPrisma = evaluateProductionPreflight({ ...validEnv, REPOSITORY_MODE: "" }, () => true);
    expect(defaultsToPrisma.find((result) => result.name === "REPOSITORY_MODE")).toMatchObject({
      ok: true,
      detail: "unset; production defaults to prisma",
    });

    const memory = evaluateProductionPreflight({ ...validEnv, REPOSITORY_MODE: "memory" }, () => true);
    expect(memory.find((result) => result.name === "REPOSITORY_MODE")).toMatchObject({
      ok: false,
      detail: "must be unset or prisma for production",
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

  it("runs the dependency security audit as a release gate", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = checkDependencyAudit((command, args) => {
      calls.push({ command, args });
      return { status: 0, stderr: "", stdout: "found 0 vulnerabilities" };
    });

    expect(result).toEqual({
      name: "Dependency audit",
      ok: true,
      detail: "no moderate or higher vulnerabilities",
    });
    expect(calls[0].args.join(" ")).toContain("audit --audit-level=moderate");
    expect(calls[0].command).toMatch(/^(npm|cmd\.exe)$/);
  });

  it("reports dependency audit failures", () => {
    const result = checkDependencyAudit(() => ({
      status: 1,
      stderr: "2 vulnerabilities (1 moderate, 1 high)",
      stdout: "",
    }));

    expect(result).toEqual({
      name: "Dependency audit",
      ok: false,
      detail: "2 vulnerabilities (1 moderate, 1 high)",
    });
  });

  it("validates the Prisma schema with the release environment", () => {
    const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
    const result = checkPrismaSchema(
      { DATABASE_URL: "postgresql://release:secret@db.example.com:5432/assemblyline" },
      (command, args, options) => {
        calls.push({ command, args, env: options.env });
        return { status: 0, stderr: "", stdout: "Prisma schema loaded" };
      },
    );

    expect(result).toEqual({ name: "Prisma schema", ok: true, detail: "schema valid" });
    expect(calls[0].args.join(" ")).toContain("prisma validate --schema prisma/schema.prisma");
    expect(calls[0].command).toMatch(/^(npx|cmd\.exe)$/);
    expect(calls[0].env.DATABASE_URL).toBe("postgresql://release:secret@db.example.com:5432/assemblyline");
  });

  it("omits undefined values from the Prisma validation command environment", () => {
    const calls: Array<{ env: NodeJS.ProcessEnv }> = [];
    checkPrismaSchema({ DATABASE_URL: undefined, REDIS_URL: undefined }, (_command, _args, options) => {
      calls.push({ env: options.env });
      return { status: 0, stderr: "", stdout: "" };
    });

    expect(calls[0].env.DATABASE_URL).toBe("postgresql://preflight:preflight@localhost:5432/preflight");
    expect(calls[0].env.REDIS_URL).toBeUndefined();
  });

  it("reports Prisma schema validation failures", () => {
    const result = checkPrismaSchema({}, () => ({
      status: 1,
      stderr: "Prisma schema validation failed",
      stdout: "",
    }));

    expect(result).toEqual({
      name: "Prisma schema",
      ok: false,
      detail: "Prisma schema validation failed",
    });
  });

  it("verifies Prisma migration files are present and non-empty", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-migrations-"));
    try {
      const migrationDir = path.join(tempRoot, "prisma", "migrations", "0001_init");
      await mkdir(migrationDir, { recursive: true });
      await writeFile(path.join(tempRoot, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
      await writeFile(path.join(migrationDir, "migration.sql"), "CREATE TABLE example (id text PRIMARY KEY);\n");

      await expect(checkPrismaMigrations(tempRoot)).resolves.toEqual({
        name: "Prisma migrations",
        ok: true,
        detail: "1 migration(s) present",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects missing or empty Prisma migrations", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-migrations-"));
    try {
      const migrationsRoot = path.join(tempRoot, "prisma", "migrations");
      await mkdir(path.join(migrationsRoot, "0001_empty"), { recursive: true });
      await writeFile(path.join(migrationsRoot, "migration_lock.toml"), 'provider = "postgresql"\n');
      await writeFile(path.join(migrationsRoot, "0001_empty", "migration.sql"), "   ");

      await expect(checkPrismaMigrations(tempRoot)).resolves.toEqual({
        name: "Prisma migrations",
        ok: false,
        detail: "0001_empty/migration.sql is empty",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects a Prisma migration lock for the wrong provider", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-migrations-"));
    try {
      const migrationsRoot = path.join(tempRoot, "prisma", "migrations");
      await mkdir(migrationsRoot, { recursive: true });
      await writeFile(path.join(migrationsRoot, "migration_lock.toml"), 'provider = "sqlite"\n');

      await expect(checkPrismaMigrations(tempRoot)).resolves.toEqual({
        name: "Prisma migrations",
        ok: false,
        detail: "migration lock must use postgresql provider",
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
      }, {
        dependencyAudit: () => ({ name: "Dependency audit", ok: true, detail: "no moderate or higher vulnerabilities" }),
        prismaSchema: () => ({ name: "Prisma schema", ok: true, detail: "schema valid" }),
        prismaMigrations: async () => ({ name: "Prisma migrations", ok: true, detail: "1 migration(s) present" }),
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
