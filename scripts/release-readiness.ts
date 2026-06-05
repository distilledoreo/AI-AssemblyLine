import { spawnSync } from "node:child_process";
import { loadStandardEnvFiles, type ScriptEnv } from "./env-files";
import { isLiveProviderApiKey } from "../src/providers/providerKeySafety";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type GithubRun = {
  conclusion?: string | null;
  databaseId?: number;
  headSha?: string;
  status?: string;
  url?: string;
  workflowName?: string;
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
      detail: isLiveProviderApiKey(openAiKey) ? "configured for live OpenAI smoke" : "missing, mock, placeholder, or too short",
    },
    {
      name: "local STABILITY_API_KEY",
      ok: isLiveProviderApiKey(stabilityKey),
      detail: isLiveProviderApiKey(stabilityKey) ? "configured for live Stability smoke" : "missing, mock, placeholder, or too short",
    },
    {
      name: "local RUNWAYML_API_SECRET",
      ok: isLiveProviderApiKey(runwayKey),
      detail: isLiveProviderApiKey(runwayKey) ? "configured for live Runway smoke" : "missing, mock, placeholder, or too short",
    },
    {
      name: "local GEMINI_API_KEY or GOOGLE_AI_API_KEY",
      ok: isLiveProviderApiKey(googleKey),
      detail: isLiveProviderApiKey(googleKey) ? "configured for live Google AI / Veo smoke" : "missing, mock, placeholder, or too short",
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

export function providerSecretNamesFromEnv(env: ScriptEnv) {
  const names = new Set<string>();
  for (const requirement of githubSecretRequirements) {
    if (env[requirement.name]?.trim()) {
      names.add(requirement.name);
    }
  }
  if (env.GEMINI_API_KEY?.trim()) {
    names.add("GEMINI_API_KEY");
  }
  if (env.GOOGLE_AI_API_KEY?.trim()) {
    names.add("GOOGLE_AI_API_KEY");
  }
  return names;
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

export function resolveGitHead(env: ScriptEnv, gitHeadOutput?: string) {
  const configured = env.GITHUB_SHA?.trim();
  if (configured) {
    return configured;
  }
  const output = gitHeadOutput ?? spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout;
  return output.trim() || undefined;
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

export function parseGithubRunList(output: string): GithubRun[] {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((run): run is GithubRun => Boolean(run && typeof run === "object"));
}

export function evaluateGithubWorkflowRuns(runs: GithubRun[], headSha: string, requireLiveProviderSmoke: boolean) {
  const requiredWorkflows = requireLiveProviderSmoke ? ["CI", "Live Provider Smoke"] : ["CI"];
  return requiredWorkflows.map((workflowName) => {
    const run = runs.find((candidate) => candidate.workflowName === workflowName && candidate.headSha === headSha);
    const label =
      workflowName === "CI" ? "GitHub Actions CI for current commit" : "GitHub Actions live provider smoke for current commit";
    if (!run) {
      return {
        name: label,
        ok: false,
        detail: `no ${workflowName} run found for ${headSha}`,
      };
    }
    const ok = run.status === "completed" && run.conclusion === "success";
    const runLabel = run.databaseId ? `run ${run.databaseId}` : "latest run";
    return {
      name: label,
      ok,
      detail: `${runLabel} is ${run.status ?? "unknown"} / ${run.conclusion ?? "unknown"}${run.url ? ` (${run.url})` : ""}`,
    };
  });
}

export function readGithubRuns(repository: string, headSha: string) {
  const result = spawnSync(
    "gh",
    [
      "run",
      "list",
      "--repo",
      repository,
      "--commit",
      headSha,
      "--limit",
      "50",
      "--json",
      "conclusion,databaseId,headSha,status,url,workflowName",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr.trim() || "gh run list failed");
    return {
      ok: false as const,
      detail,
      runs: [],
    };
  }
  try {
    return {
      ok: true as const,
      detail: `${parseGithubRunList(result.stdout).length} run(s) visible for ${headSha}`,
      runs: parseGithubRunList(result.stdout),
    };
  } catch (error) {
    return {
      ok: false as const,
      detail: error instanceof Error ? error.message : "could not parse gh run list output",
      runs: [],
    };
  }
}

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const repository = resolveGithubRepository(env);
  const headSha = resolveGitHead(env);
  const workflowEnvMode = env.RELEASE_READINESS_GITHUB_SECRETS_MODE?.trim() === "env";
  const checks: CheckResult[] = evaluateLocalProviderCredentials(env);

  if (!repository) {
    checks.push({
      name: "GitHub repository",
      ok: false,
      detail: "could not resolve repository from GITHUB_REPOSITORY or origin remote",
    });
  } else {
    if (workflowEnvMode) {
      checks.push({
        name: "GitHub repository secrets",
        ok: true,
        detail: `${repository}: checked provider secrets injected into the workflow environment`,
      });
      checks.push(...evaluateGithubProviderSecrets(providerSecretNamesFromEnv(env)));
    } else {
      const secretRead = readGithubSecrets(repository);
      checks.push({
        name: "GitHub repository secrets",
        ok: secretRead.ok,
        detail: secretRead.ok ? `${repository}: ${secretRead.detail}` : secretRead.detail,
      });
      checks.push(...evaluateGithubProviderSecrets(secretRead.secretNames));
    }

    if (!headSha) {
      checks.push({
        name: "Git commit",
        ok: false,
        detail: "could not resolve current commit from GITHUB_SHA or git rev-parse HEAD",
      });
    } else {
      const runRead = readGithubRuns(repository, headSha);
      checks.push({
        name: "GitHub Actions runs",
        ok: runRead.ok,
        detail: runRead.ok ? `${repository}: ${runRead.detail}` : runRead.detail,
      });
      checks.push(...evaluateGithubWorkflowRuns(runRead.runs, headSha, !workflowEnvMode));
      if (workflowEnvMode) {
        checks.push({
          name: "GitHub Actions live provider smoke for current commit",
          ok: true,
          detail: "checked by this workflow after the readiness gate completes",
        });
      }
    }
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
