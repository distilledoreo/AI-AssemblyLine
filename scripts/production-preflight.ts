import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { loadStandardEnvFiles, type ScriptEnv } from "./env-files";
import { DEVELOPMENT_ENCRYPTION_KEY, DEVELOPMENT_NEXTAUTH_SECRET } from "../src/lib/config";
import { isLiveProviderApiKey } from "../src/providers/providerKeySafety";

type Env = ScriptEnv;
type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};
type ProductionPreflightChecks = {
  dependencyAudit?: () => CheckResult;
  prismaSchema?: (env: Env) => CheckResult;
  prismaMigrations?: () => Promise<CheckResult>;
};

const requiredEnv = ["DATABASE_URL", "REDIS_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "ENCRYPTION_KEY"] as const;

export async function loadProductionEnvFiles(cwd: string, baseEnv: Env = process.env): Promise<Env> {
  return loadStandardEnvFiles(cwd, baseEnv);
}

export function evaluateProductionPreflight(
  env: Env,
  commandExists: (command: string) => boolean = defaultCommandExists,
): CheckResult[] {
  const results: CheckResult[] = [];
  const nodeEnv = env.NODE_ENV?.trim() ?? "";
  results.push({
    name: "NODE_ENV",
    ok: nodeEnv === "production",
    detail: nodeEnv === "production" ? "production" : "must be production for release verification",
  });

  for (const name of requiredEnv) {
    const value = env[name]?.trim();
    results.push({
      name,
      ok: Boolean(value),
      detail: value ? "configured" : "missing",
    });
  }

  const secret = env.NEXTAUTH_SECRET?.trim() ?? "";
  results.push(checkNextAuthUrl(env.NEXTAUTH_URL));

  results.push({
    name: "NEXTAUTH_SECRET length",
    ok: secret.length >= 32,
    detail: secret.length >= 32 ? "at least 32 characters" : "must be at least 32 characters",
  });
  results.push({
    name: "NEXTAUTH_SECRET production value",
    ok: Boolean(secret) && secret !== DEVELOPMENT_NEXTAUTH_SECRET,
    detail: secret && secret !== DEVELOPMENT_NEXTAUTH_SECRET ? "not a known development fallback" : "must not use the development fallback secret",
  });

  const encryptionKey = env.ENCRYPTION_KEY?.trim() ?? "";
  const decodedKeyLength = decodeBase64Length(encryptionKey);
  results.push({
    name: "ENCRYPTION_KEY length",
    ok: decodedKeyLength === 32,
    detail: decodedKeyLength === 32 ? "32 decoded bytes" : "must decode to exactly 32 bytes",
  });
  results.push({
    name: "ENCRYPTION_KEY production value",
    ok: Boolean(encryptionKey) && encryptionKey !== DEVELOPMENT_ENCRYPTION_KEY,
    detail:
      encryptionKey && encryptionKey !== DEVELOPMENT_ENCRYPTION_KEY
        ? "not a known development fallback"
        : "must not use the development fallback encryption key",
  });

  const queueMode = env.QUEUE_MODE?.trim().toLowerCase() ?? "";
  results.push({
    name: "QUEUE_MODE",
    ok: queueMode === "" || queueMode === "redis",
    detail:
      queueMode === ""
        ? "unset; production defaults to redis"
        : queueMode === "redis"
          ? "redis"
          : "must be unset or redis for production",
  });

  const repositoryMode = env.REPOSITORY_MODE?.trim().toLowerCase() ?? "";
  results.push({
    name: "REPOSITORY_MODE",
    ok: repositoryMode === "" || repositoryMode === "prisma",
    detail:
      repositoryMode === ""
        ? "unset; production defaults to prisma"
        : repositoryMode === "prisma"
          ? "prisma"
          : "must be unset or prisma for production",
  });

  const openAiKey = env.OPENAI_API_KEY?.trim() ?? "";
  results.push({
    name: "OPENAI_API_KEY",
    ok: isLiveProviderApiKey(openAiKey),
    detail: isLiveProviderApiKey(openAiKey) ? "configured for live smoke test" : "missing, mock, or placeholder",
  });

  const stabilityKey = env.STABILITY_API_KEY?.trim() ?? "";
  results.push({
    name: "STABILITY_API_KEY",
    ok: isLiveProviderApiKey(stabilityKey),
    detail: isLiveProviderApiKey(stabilityKey) ? "configured for live smoke test" : "missing, mock, or placeholder",
  });

  const runwayKey = env.RUNWAYML_API_SECRET?.trim() ?? "";
  results.push({
    name: "RUNWAYML_API_SECRET",
    ok: isLiveProviderApiKey(runwayKey),
    detail: isLiveProviderApiKey(runwayKey) ? "configured for live video submission" : "missing, mock, or placeholder",
  });

  results.push(oauthPairCheck("Google OAuth", env, ["AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID", "GOOGLE_ID"], [
    "AUTH_GOOGLE_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_SECRET",
  ]));
  results.push(oauthPairCheck("GitHub OAuth", env, ["AUTH_GITHUB_ID", "GITHUB_CLIENT_ID", "GITHUB_ID"], [
    "AUTH_GITHUB_SECRET",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_SECRET",
  ]));

  for (const command of ["ffmpeg", "ffprobe"]) {
    const exists = commandExists(command);
    results.push({
      name: command,
      ok: exists,
      detail: exists ? "available on PATH" : "not found on PATH",
    });
  }

  return results;
}

function checkNextAuthUrl(value: string | undefined): CheckResult {
  const configured = value?.trim();
  if (!configured) {
    return { name: "NEXTAUTH_URL format", ok: false, detail: "missing" };
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { name: "NEXTAUTH_URL format", ok: false, detail: "must be a valid absolute URL" };
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = localHosts.has(url.hostname);
  if (url.protocol !== "https:" && !isLocal) {
    return { name: "NEXTAUTH_URL format", ok: false, detail: "must use https outside localhost" };
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return { name: "NEXTAUTH_URL format", ok: false, detail: "must be an origin without path, query, or fragment" };
  }
  return { name: "NEXTAUTH_URL format", ok: true, detail: isLocal ? "local URL allowed" : "https URL" };
}

function oauthPairCheck(name: string, env: Env, clientIdKeys: string[], clientSecretKeys: string[]): CheckResult {
  const hasClientId = clientIdKeys.some((key) => Boolean(env[key]?.trim()));
  const hasClientSecret = clientSecretKeys.some((key) => Boolean(env[key]?.trim()));
  const configured = hasClientId && hasClientSecret;
  const omitted = !hasClientId && !hasClientSecret;
  return {
    name,
    ok: configured || omitted,
    detail: configured ? "configured" : omitted ? "not configured" : "client id and secret must be configured together",
  };
}

export async function runProductionPreflight(env: Env = process.env, checks: ProductionPreflightChecks = {}) {
  const results = evaluateProductionPreflight(env);
  results.push((checks.dependencyAudit ?? checkDependencyAudit)());
  results.push((checks.prismaSchema ?? checkPrismaSchema)(env));
  results.push(await (checks.prismaMigrations ?? checkPrismaMigrations)());
  results.push(await checkStorageRoot(env.STORAGE_ROOT));
  results.push(await checkTcpUrl("Postgres TCP", env.DATABASE_URL, ["postgres:", "postgresql:"]));
  results.push(await checkTcpUrl("Redis TCP", env.REDIS_URL, ["redis:", "rediss:"]));
  return results;
}

function defaultCommandExists(command: string) {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

function decodeBase64Length(value: string) {
  try {
    return Buffer.from(value, "base64").length;
  } catch {
    return 0;
  }
}

export function checkPrismaSchema(
  env: Env,
  runCommand: (
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; encoding: "utf8" },
  ) => { status: number | null; error?: Error; stderr?: string; stdout?: string } = defaultRunCommand,
): CheckResult {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/c", "npx.cmd", "prisma", "validate", "--schema", "prisma/schema.prisma"]
      : ["prisma", "validate", "--schema", "prisma/schema.prisma"];
  const databaseUrl = env.DATABASE_URL?.trim() || "postgresql://preflight:preflight@localhost:5432/preflight";
  const result = runCommand(command, args, {
    env: sanitizeProcessEnv({ ...process.env, ...env, DATABASE_URL: databaseUrl }),
    encoding: "utf8",
  });
  const ok = result.status === 0;
  return {
    name: "Prisma schema",
    ok,
    detail: ok ? "schema valid" : commandFailureDetail(result, "schema validation failed"),
  };
}

export function checkDependencyAudit(
  runCommand: (
    command: string,
    args: string[],
    options: { encoding: "utf8" },
  ) => { status: number | null; error?: Error; stderr?: string; stdout?: string } = defaultRunAuditCommand,
): CheckResult {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/c", "npm.cmd", "audit", "--audit-level=moderate"] : ["audit", "--audit-level=moderate"];
  const result = runCommand(command, args, { encoding: "utf8" });
  const ok = result.status === 0;
  return {
    name: "Dependency audit",
    ok,
    detail: ok ? "no moderate or higher vulnerabilities" : commandFailureDetail(result, "dependency audit failed"),
  };
}

function sanitizeProcessEnv(env: Env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)) as NodeJS.ProcessEnv;
}

function defaultRunCommand(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; encoding: "utf8" },
) {
  return spawnSync(command, args, options);
}

function defaultRunAuditCommand(command: string, args: string[], options: { encoding: "utf8" }) {
  return spawnSync(command, args, options);
}

function commandFailureDetail(result: { error?: Error; stderr?: string; stdout?: string }, fallback: string) {
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return result.error?.message ?? output ?? fallback;
}

export async function checkPrismaMigrations(cwd = process.cwd()): Promise<CheckResult> {
  const migrationsRoot = path.join(cwd, "prisma", "migrations");
  try {
    const lock = await readFile(path.join(migrationsRoot, "migration_lock.toml"), "utf8");
    if (!/provider\s*=\s*"postgresql"/.test(lock)) {
      return { name: "Prisma migrations", ok: false, detail: "migration lock must use postgresql provider" };
    }

    const entries = await readdir(migrationsRoot, { withFileTypes: true });
    const migrationDirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    if (migrationDirs.length === 0) {
      return { name: "Prisma migrations", ok: false, detail: "no migration directories found" };
    }

    for (const migrationDir of migrationDirs) {
      const migrationSql = await readFile(path.join(migrationsRoot, migrationDir.name, "migration.sql"), "utf8");
      if (!migrationSql.trim()) {
        return { name: "Prisma migrations", ok: false, detail: `${migrationDir.name}/migration.sql is empty` };
      }
    }

    return { name: "Prisma migrations", ok: true, detail: `${migrationDirs.length} migration(s) present` };
  } catch (error) {
    return {
      name: "Prisma migrations",
      ok: false,
      detail: error instanceof Error ? error.message : "migration files could not be read",
    };
  }
}

async function checkTcpUrl(name: string, value: string | undefined, allowedProtocols: string[]): Promise<CheckResult> {
  if (!value) {
    return { name, ok: false, detail: "URL is missing" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { name, ok: false, detail: "URL is invalid" };
  }
  if (!allowedProtocols.includes(url.protocol)) {
    return { name, ok: false, detail: `URL must use ${allowedProtocols.map((protocol) => protocol.replace(":", "")).join(" or ")}` };
  }
  const port = Number(url.port || (url.protocol.startsWith("postgres") ? 5432 : 6379));
  const host = url.hostname || "localhost";
  const reachable = await canConnect(host, port, 2500);
  return {
    name,
    ok: reachable,
    detail: reachable ? `${host}:${port} reachable` : `${host}:${port} unreachable`,
  };
}

export async function checkStorageRoot(value: string | undefined): Promise<CheckResult> {
  const configured = value?.trim();
  if (!configured) {
    return { name: "STORAGE_ROOT", ok: false, detail: "missing" };
  }
  const root = path.resolve(configured);
  const probePath = path.join(root, `.assemblyline-preflight-${process.pid}-${Date.now()}.tmp`);
  try {
    await mkdir(root, { recursive: true });
    await writeFile(probePath, "ok", { flag: "wx" });
    await rm(probePath, { force: true });
    return { name: "STORAGE_ROOT", ok: true, detail: `${root} writable` };
  } catch (error) {
    await rm(probePath, { force: true }).catch(() => undefined);
    return {
      name: "STORAGE_ROOT",
      ok: false,
      detail: error instanceof Error ? `not writable: ${error.message}` : "not writable",
    };
  }
}

function canConnect(host: string, port: number, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function main() {
  const env = await loadProductionEnvFiles(process.cwd());
  const results = await runProductionPreflight(env);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`);
  }
  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`Production preflight failed with ${failures.length} blocker(s).`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("production-preflight.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
