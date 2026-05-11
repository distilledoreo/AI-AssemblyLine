import { readFile } from "node:fs/promises";
import path from "node:path";

export type ScriptEnv = Record<string, string | undefined>;

const standardEnvFiles = [".env", ".env.production", ".env.local", ".env.production.local"] as const;

export async function loadStandardEnvFiles(cwd: string, baseEnv: ScriptEnv = process.env): Promise<ScriptEnv> {
  const loaded: ScriptEnv = {};
  for (const fileName of standardEnvFiles) {
    const values = await readEnvFile(path.join(cwd, fileName));
    Object.assign(loaded, values);
  }
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) {
      loaded[key] = value;
    }
  }
  return loaded;
}

async function readEnvFile(filePath: string): Promise<ScriptEnv> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
  return parseEnvFile(content);
}

function parseEnvFile(content: string): ScriptEnv {
  const values: ScriptEnv = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const assignment = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    values[key] = parseEnvValue(assignment.slice(separator + 1).trim());
  }
  return values;
}

function parseEnvValue(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  const hash = value.indexOf(" #");
  return hash >= 0 ? value.slice(0, hash).trimEnd() : value;
}
