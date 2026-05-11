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
  processStoryboardFrameJob,
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
  await Promise.all(graph.assets.map((asset) => transitionAssetStatus(project.id, asset.id, "approved")));
  return { user, project, graph: getScriptAnalysisGraph(project.id) };
}

describe("storyboard workflow", () => {
  beforeEach(() => resetStoreForTests());

  it("generates, annotates, comments, and approves frame versions for ready shots", async () => {
    const { user, project, graph } = await readyProject();
    const shot = graph.shots[0];

    const generated = await generateStoryboardFrame({ projectId: project.id, shotId: shot.id, keyframeIndex: 0 });
    const frameVersion = generated.frameVersions[0];
    await updateFrameVersion({
      projectId: project.id,
      frameVersionId: frameVersion.id,
      annotations: { library: "fabric-compatible-json", objects: [{ type: "arrow" }] },
      status: "approved",
    });
    await addFrameComment({ projectId: project.id, authorId: user.id, frameVersionId: frameVersion.id, body: "Approved." });

    const updated = getScriptAnalysisGraph(project.id);
    expect(updated.storyboardFrames[0].keyframeIndex).toBe(0);
    expect(updated.frameVersions[0].status).toBe("approved");
    expect(updated.frameVersions[0].annotations?.library).toBe("fabric-compatible-json");
    expect(updated.reviewNotes[0].body).toBe("Approved.");

    const asset = graph.assets.find((candidate) => candidate.canonicalName === "Anna")!;
    await transitionAssetStatus(project.id, asset.id, "missing");
    const staleGraph = getScriptAnalysisGraph(project.id);
    expect(staleGraph.frameVersions[0].status).toBe("stale");
    expect(staleGraph.frameVersions[0].isStale).toBe(true);
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

  it("attaches uploaded sketches to storyboard frames", async () => {
    const { project, graph } = await readyProject();
    const shot = graph.shots[0];

    const updated = await attachSketch({
      projectId: project.id,
      shotId: shot.id,
      fileName: "thumbnail.png",
      mimeType: "image/png",
      data: Buffer.from("sketch"),
    });

    expect(updated.storyboardFrames).toHaveLength(1);
    expect(updated.storyboardFrames[0].shotId).toBe(shot.id);
    expect(updated.storyboardFrames[0].sketchFilePath).toContain("thumbnail.png");
  });

  it("rejects out-of-range keyframe indexes in inline and worker paths", async () => {
    const { project, graph } = await readyProject();
    const shot = graph.shots[0];

    await expect(
      generateStoryboardFrame({ projectId: project.id, shotId: shot.id, keyframeIndex: 9 }),
    ).rejects.toMatchObject({ code: "bad_keyframe" });
    await expect(
      processStoryboardFrameJob({
        projectId: project.id,
        shotId: shot.id,
        keyframeIndex: 9,
        jobId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "bad_keyframe" });

    expect(getScriptAnalysisGraph(project.id).storyboardFrames).toHaveLength(0);
  });

  it("rejects frame updates and comments when the frame version belongs to another project", async () => {
    const first = await readyProject();
    const firstGraph = getScriptAnalysisGraph(first.project.id);
    const generated = await generateStoryboardFrame({
      projectId: first.project.id,
      shotId: firstGraph.shots[0].id,
      keyframeIndex: 0,
    });
    const foreignFrameVersionId = generated.frameVersions[0].id;
    const second = await readyProject();

    await expect(
      updateFrameVersion({
        projectId: second.project.id,
        frameVersionId: foreignFrameVersionId,
        status: "approved",
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      addFrameComment({
        projectId: second.project.id,
        authorId: second.user.id,
        frameVersionId: foreignFrameVersionId,
        body: "Looks good.",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
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
