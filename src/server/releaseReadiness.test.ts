import { describe, expect, it } from "vitest";
import {
  evaluateGithubProviderSecrets,
  evaluateGithubWorkflowRuns,
  evaluateLocalProviderCredentials,
  parseGithubRunList,
  parseGithubSecretList,
  providerSecretNamesFromEnv,
  resolveGitHead,
  resolveGithubRepository,
} from "../../scripts/release-readiness";

describe("release readiness", () => {
  it("requires live local provider credentials for the manual smoke suite", () => {
    const results = evaluateLocalProviderCredentials({
      OPENAI_API_KEY: "mock",
      STABILITY_API_KEY: "sk-stability-prod-smoke-abc123",
      RUNWAYML_API_SECRET: "rw-prod-runway-smoke-abc123",
      GOOGLE_AI_API_KEY: "google-ai-prod-veo-smoke-abc123",
    });

    expect(results.find((result) => result.name === "local OPENAI_API_KEY")).toMatchObject({
      ok: false,
      detail: "missing, mock, placeholder, or too short",
    });
    expect(results.find((result) => result.name === "local GEMINI_API_KEY or GOOGLE_AI_API_KEY")).toMatchObject({
      ok: true,
    });
  });

  it("rejects trivial local provider credential strings", () => {
    const results = evaluateLocalProviderCredentials({
      OPENAI_API_KEY: "abc",
      STABILITY_API_KEY: "123456789012",
      RUNWAYML_API_SECRET: "abcdefghijkl",
      GOOGLE_AI_API_KEY: "short-key",
    });

    expect(results.filter((result) => !result.ok).map((result) => result.detail)).toEqual([
      "missing, mock, placeholder, or too short",
      "missing, mock, placeholder, or too short",
      "missing, mock, placeholder, or too short",
      "missing, mock, placeholder, or too short",
    ]);
  });

  it("checks GitHub provider secrets by name without reading secret values", () => {
    const names = parseGithubSecretList(
      [
        "OPENAI_API_KEY         2026-05-11T00:00:00Z",
        "STABILITY_API_KEY      2026-05-11T00:00:00Z",
        "RUNWAYML_API_SECRET    2026-05-11T00:00:00Z",
        "GOOGLE_AI_API_KEY      2026-05-11T00:00:00Z",
      ].join("\n"),
    );
    const results = evaluateGithubProviderSecrets(names);

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("reports missing GitHub provider secrets including either Google AI key name", () => {
    const results = evaluateGithubProviderSecrets(new Set(["OPENAI_API_KEY"]));

    expect(results.filter((result) => !result.ok).map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "GitHub secret STABILITY_API_KEY",
        "GitHub secret RUNWAYML_API_SECRET",
        "GitHub secret GEMINI_API_KEY or GOOGLE_AI_API_KEY",
      ]),
    );
  });

  it("derives provider secret names from injected workflow env without exposing values", () => {
    const names = providerSecretNamesFromEnv({
      OPENAI_API_KEY: "sk-prod-openai-smoke-abc123",
      STABILITY_API_KEY: "",
      RUNWAYML_API_SECRET: "rw-prod-runway-smoke-abc123",
      GEMINI_API_KEY: "gemini-prod-veo-smoke-abc123",
    });

    expect(names).toEqual(new Set(["OPENAI_API_KEY", "RUNWAYML_API_SECRET", "GEMINI_API_KEY"]));
    const results = evaluateGithubProviderSecrets(names);
    expect(results.find((result) => result.name === "GitHub secret STABILITY_API_KEY")).toMatchObject({
      ok: false,
      detail: "missing from repository secrets",
    });
  });

  it("resolves GitHub repository slugs from env or origin remotes", () => {
    expect(resolveGithubRepository({ GITHUB_REPOSITORY: "owner/repo" })).toBe("owner/repo");
    expect(resolveGithubRepository({}, "https://github.com/distilledoreo/AI-AssemblyLine.git")).toBe(
      "distilledoreo/AI-AssemblyLine",
    );
    expect(resolveGithubRepository({}, "git@github.com:distilledoreo/AI-AssemblyLine.git")).toBe(
      "distilledoreo/AI-AssemblyLine",
    );
  });

  it("resolves current commits from env or git output", () => {
    expect(resolveGitHead({ GITHUB_SHA: "abc123" })).toBe("abc123");
    expect(resolveGitHead({}, "def456\n")).toBe("def456");
    expect(resolveGitHead({}, "\n")).toBeUndefined();
  });

  it("requires successful CI and live provider smoke runs for local release readiness", () => {
    const runs = parseGithubRunList(
      JSON.stringify([
        {
          workflowName: "CI",
          headSha: "abc123",
          status: "completed",
          conclusion: "success",
          databaseId: 101,
          url: "https://github.com/owner/repo/actions/runs/101",
        },
        {
          workflowName: "Live Provider Smoke",
          headSha: "abc123",
          status: "completed",
          conclusion: "failure",
          databaseId: 102,
          url: "https://github.com/owner/repo/actions/runs/102",
        },
      ]),
    );

    const results = evaluateGithubWorkflowRuns(runs, "abc123", true);

    expect(results.find((result) => result.name === "GitHub Actions CI for current commit")).toMatchObject({
      ok: true,
    });
    expect(
      results.find((result) => result.name === "GitHub Actions live provider smoke for current commit"),
    ).toMatchObject({
      ok: false,
      detail: "run 102 is completed / failure (https://github.com/owner/repo/actions/runs/102)",
    });
  });

  it("lets the live provider smoke workflow skip the circular previous-smoke requirement", () => {
    const results = evaluateGithubWorkflowRuns(
      [
        {
          workflowName: "CI",
          headSha: "abc123",
          status: "completed",
          conclusion: "success",
          databaseId: 101,
        },
      ],
      "abc123",
      false,
    );

    expect(results).toEqual([
      {
        name: "GitHub Actions CI for current commit",
        ok: true,
        detail: "run 101 is completed / success",
      },
    ]);
  });
});
