import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

type Env = Record<string, string | undefined>;
type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const requiredEnv = ["DATABASE_URL", "REDIS_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "ENCRYPTION_KEY"] as const;

export function evaluateProductionPreflight(
  env: Env,
  commandExists: (command: string) => boolean = defaultCommandExists,
): CheckResult[] {
  const results: CheckResult[] = [];
  for (const name of requiredEnv) {
    const value = env[name]?.trim();
    results.push({
      name,
      ok: Boolean(value),
      detail: value ? "configured" : "missing",
    });
  }

  const secret = env.NEXTAUTH_SECRET?.trim() ?? "";
  results.push({
    name: "NEXTAUTH_SECRET length",
    ok: secret.length >= 32,
    detail: secret.length >= 32 ? "at least 32 characters" : "must be at least 32 characters",
  });

  const encryptionKey = env.ENCRYPTION_KEY?.trim() ?? "";
  const decodedKeyLength = decodeBase64Length(encryptionKey);
  results.push({
    name: "ENCRYPTION_KEY length",
    ok: decodedKeyLength === 32,
    detail: decodedKeyLength === 32 ? "32 decoded bytes" : "must decode to exactly 32 bytes",
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

  const openAiKey = env.OPENAI_API_KEY?.trim() ?? "";
  results.push({
    name: "OPENAI_API_KEY",
    ok: Boolean(openAiKey) && openAiKey !== "mock",
    detail: openAiKey && openAiKey !== "mock" ? "configured for live smoke test" : "missing or mock",
  });

  const stabilityKey = env.STABILITY_API_KEY?.trim() ?? "";
  results.push({
    name: "STABILITY_API_KEY",
    ok: Boolean(stabilityKey) && stabilityKey !== "mock",
    detail: stabilityKey && stabilityKey !== "mock" ? "configured for live smoke test" : "missing or mock",
  });

  const runwayKey = env.RUNWAYML_API_SECRET?.trim() ?? "";
  results.push({
    name: "RUNWAYML_API_SECRET",
    ok: Boolean(runwayKey) && runwayKey !== "mock",
    detail: runwayKey && runwayKey !== "mock" ? "configured for live video submission" : "missing or mock",
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

export async function runProductionPreflight(env: Env = process.env) {
  const results = evaluateProductionPreflight(env);
  results.push(await checkStorageRoot(env.STORAGE_ROOT));
  results.push(await checkTcpUrl("Postgres TCP", env.DATABASE_URL));
  results.push(await checkTcpUrl("Redis TCP", env.REDIS_URL));
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

async function checkTcpUrl(name: string, value: string | undefined): Promise<CheckResult> {
  if (!value) {
    return { name, ok: false, detail: "URL is missing" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { name, ok: false, detail: "URL is invalid" };
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
  const results = await runProductionPreflight();
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
