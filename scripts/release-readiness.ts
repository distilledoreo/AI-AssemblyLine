import { spawnSync } from "node:child_process";
import { loadStandardEnvFiles, type ScriptEnv } from "./env-files";
import { isLiveProviderApiKey } from "../src/providers/providerKeySafety";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const githubSecretRequirements = [
  { name: "OPENAI_API_KEY", detail: "OpenAI live smoke" },
  { name: "STABILITY_API_KEY", detail: "Stability live smoke" },
  { name: "RUNWAYML_API_SECRET", detail: "Runway live smoke" },
] as const;

export function evaluateLocalProviderCredentials(env: ScriptEnv): CheckResult[] {
  const openAiKey = env.OPENAI_API_KEY?.trim() ?? "";
  const stabilityKey = env.STABILITY_API_KEY?.trim() ?? "";
  const runwayKey = env.RUNWAYML_API_SECRET?.trim() ?? "";
  const googleKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_AI_API_KEY?.trim() || "";

  return [
    {
      name: "local OPENAI_API_KEY",
      ok: isLiveProviderApiKey(openAiKey),
      detail: isLiveProviderApiKey(openAiKey) ? "configured for live OpenAI smoke" : "missing, mock, or placeholder",
    },
    {
      name: "local STABILITY_API_KEY",
      ok: isLiveProviderApiKey(stabilityKey),
      detail: isLiveProviderApiKey(stabilityKey) ? "configured for live Stability smoke" : "missing, mock, or placeholder",
    },
    {
      name: "local RUNWAYML_API_SECRET",
      ok: isLiveProviderApiKey(runwayKey),
      detail: isLiveProviderApiKey(runwayKey) ? "configured for live Runway smoke" : "missing, mock, or placeholder",
    },
    {
      name: "local GEMINI_API_KEY or GOOGLE_AI_API_KEY",
      ok: isLiveProviderApiKey(googleKey),
      detail: isLiveProviderApiKey(googleKey) ? "configured for live Google AI / Veo smoke" : "missing, mock, or placeholder",
    },
  ];
}

export function parseGithubSecretList(output: string) {
  return new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name && name !== "Name"),
  );
}

export function evaluateGithubProviderSecrets(secretNames: Set<string>): CheckResult[] {
  const results: CheckResult[] = githubSecretRequirements.map((requirement) => ({
    name: `GitHub secret ${requirement.name}`,
    ok: secretNames.has(requirement.name),
    detail: secretNames.has(requirement.name) ? `configured for ${requirement.detail}` : "missing from repository secrets",
  }));
  const hasGemini = secretNames.has("GEMINI_API_KEY");
  const hasGoogleAi = secretNames.has("GOOGLE_AI_API_KEY");
  results.push({
    name: "GitHub secret GEMINI_API_KEY or GOOGLE_AI_API_KEY",
    ok: hasGemini || hasGoogleAi,
    detail: hasGemini || hasGoogleAi ? "configured for Google AI / Veo live smoke" : "missing from repository secrets",
  });
  return results;
}

export function resolveGithubRepository(env: ScriptEnv, gitRemoteOutput?: string) {
  const configured = env.GITHUB_REPOSITORY?.trim();
  if (configured) {
    return configured;
  }
  const remote = gitRemoteOutput ?? spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).stdout;
  const trimmed = remote.trim();
  const httpsMatch = trimmed.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);
  if (!httpsMatch?.groups) {
    return undefined;
  }
  return `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`;
}

export function readGithubSecrets(repository: string) {
  const result = spawnSync("gh", ["secret", "list", "--repo", repository], { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr.trim() || "gh secret list failed");
    return {
      ok: false as const,
      detail,
      secretNames: new Set<string>(),
    };
  }
  return {
    ok: true as const,
    detail: `${parseGithubSecretList(result.stdout).size} secret(s) visible by name`,
    secretNames: parseGithubSecretList(result.stdout),
  };
}

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const repository = resolveGithubRepository(env);
  const checks: CheckResult[] = evaluateLocalProviderCredentials(env);

  if (!repository) {
    checks.push({
      name: "GitHub repository",
      ok: false,
      detail: "could not resolve repository from GITHUB_REPOSITORY or origin remote",
    });
  } else {
    const secretRead = readGithubSecrets(repository);
    checks.push({
      name: "GitHub repository secrets",
      ok: secretRead.ok,
      detail: secretRead.ok ? `${repository}: ${secretRead.detail}` : secretRead.detail,
    });
    checks.push(...evaluateGithubProviderSecrets(secretRead.secretNames));
  }

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    console.error(`Release readiness failed with ${failures.length} blocker(s).`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("release-readiness.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
