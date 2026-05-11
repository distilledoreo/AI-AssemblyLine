import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.join(process.cwd(), ".github", "workflows", "live-provider-smoke.yml");

describe("live provider smoke workflow", () => {
  it("is a manual release gate that runs the combined live provider smoke suite", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("npm run smoke:providers");
  });

  it("runs release readiness before provider calls and can read current-commit workflow status", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("RELEASE_READINESS_GITHUB_SECRETS_MODE: env");
    expect(workflow.indexOf("npm run release:readiness")).toBeGreaterThan(-1);
    expect(workflow.indexOf("npm run release:readiness")).toBeLessThan(workflow.indexOf("npm run smoke:providers"));
  });

  it("sources every live provider credential from GitHub secrets", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("STABILITY_API_KEY: ${{ secrets.STABILITY_API_KEY }}");
    expect(workflow).toContain("RUNWAYML_API_SECRET: ${{ secrets.RUNWAYML_API_SECRET }}");
    expect(workflow).toContain("GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}");
    expect(workflow).toContain("GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_API_KEY }}");
  });
});
