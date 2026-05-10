import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import { transitionAssetStatus } from "@/server/assetBible";
import { uploadScriptForProject } from "@/server/scriptAnalysis";
import {
  addFrameComment,
  attachSketch,
  generateStoryboardFrame,
  updateFrameVersion,
} from "@/server/storyboard";
import { composeStoryboardPrompt } from "@/server/promptEngine";

const scriptText = `INT. COFFEE SHOP - MORNING
ANNA
Anna holds a brass key.`;

async function readyProject() {
  const { user } = await signInWithCredentials({
    email: "boards@example.com",
    password: "assemblyline",
  });
  const workspace = await createWorkspaceForUser(user.id, { name: "Board Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Boards" });
  const graph = await uploadScriptForProject({ projectId: project.id, filename: "boards.txt", text: scriptText });
  graph.assets.forEach((asset) => transitionAssetStatus(asset.id, "approved"));
  return { user, project, graph: getScriptAnalysisGraph(project.id) };
}

describe("storyboard workflow", () => {
  beforeEach(() => resetStoreForTests());

  it("generates, annotates, comments, and approves frame versions for ready shots", async () => {
    const { user, project, graph } = await readyProject();
    const shot = graph.shots[0];

    const generated = await generateStoryboardFrame({ projectId: project.id, shotId: shot.id, keyframeIndex: 0 });
    const frameVersion = generated.frameVersions[0];
    updateFrameVersion({
      projectId: project.id,
      frameVersionId: frameVersion.id,
      annotations: { library: "fabric-compatible-json", objects: [{ type: "arrow" }] },
      status: "approved",
    });
    addFrameComment({ projectId: project.id, authorId: user.id, frameVersionId: frameVersion.id, body: "Approved." });

    const updated = getScriptAnalysisGraph(project.id);
    expect(updated.storyboardFrames[0].keyframeIndex).toBe(0);
    expect(updated.frameVersions[0].status).toBe("approved");
    expect(updated.frameVersions[0].annotations?.library).toBe("fabric-compatible-json");
    expect(updated.reviewNotes[0].body).toBe("Approved.");
  });

  it("blocks storyboard generation until assets are approved and validates sketch input", async () => {
    const { user } = await signInWithCredentials({ email: "blocked@example.com", password: "assemblyline" });
    const workspace = await createWorkspaceForUser(user.id, { name: "Blocked" });
    const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Blocked" });
    const graph = await uploadScriptForProject({ projectId: project.id, filename: "blocked.txt", text: scriptText });

    await expect(generateStoryboardFrame({ projectId: project.id, shotId: graph.shots[0].id })).rejects.toMatchObject({
      code: "shot_blocked",
    });
    await expect(
      attachSketch({
        projectId: project.id,
        shotId: graph.shots[0].id,
        fileName: "bad.gif",
        mimeType: "image/gif",
        data: Buffer.from("bad"),
      }),
    ).rejects.toMatchObject({ code: "unsupported_sketch" });
  });

  it("composes prompts with conflict and truncation warnings", async () => {
    const { graph } = await readyProject();
    const prompt = composeStoryboardPrompt({
      style: {
        id: "style",
        projectId: "project",
        styleName: "Watercolor",
        description: "Loose watercolor",
        colorPalette: [],
        lightingRules: "soft",
        renderingMedium: "watercolor",
        lensLanguage: "observational",
        negativeConstraints: "photorealism",
        modelPromptFragments: {},
        approvalStatus: "locked",
        createdAt: "",
        updatedAt: "",
      },
      scene: graph.scenes[0],
      shot: graph.shots[0],
      assets: graph.assets,
      userDirection: "make it photoreal",
      maxLength: 80,
    });

    expect(prompt.metadata.conflictWarnings).toHaveLength(1);
    expect(prompt.metadata.truncationWarnings).toHaveLength(1);
  });
});
