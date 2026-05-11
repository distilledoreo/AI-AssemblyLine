import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packagePath = path.join(process.cwd(), "package.json");
const workflowPath = path.join(process.cwd(), ".github", "workflows", "ci.yml");
const smokeScriptPath = path.join(process.cwd(), "scripts", "smoke-prisma-repository.ts");

describe("Prisma repository smoke workflow", () => {
  it("exposes an executable smoke command for the real Prisma repository path", () => {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["smoke:prisma-repository"]).toBe("tsx scripts/smoke-prisma-repository.ts");
  });

  it("runs the smoke after migrations in the production infrastructure job", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("Run Prisma repository smoke");
    expect(workflow).toContain("npm run smoke:prisma-repository");
    expect(workflow.indexOf("npm run prisma:migrate:deploy")).toBeLessThan(
      workflow.indexOf("npm run smoke:prisma-repository"),
    );
  });

  it("covers production workflow graph records in the Prisma repository smoke", () => {
    const smokeScript = readFileSync(smokeScriptPath, "utf8");

    expect(smokeScript).toContain("Script analysis graph persistence");
    expect(smokeScript).toContain("Storyboard and video persistence");
    expect(smokeScript).toContain("Collaboration persistence");
    expect(smokeScript).toContain("Export bundle persistence");
  });
});
