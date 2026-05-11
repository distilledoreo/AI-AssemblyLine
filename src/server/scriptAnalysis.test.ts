import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import {
  addSceneAssetRequirement,
  detectAssets,
  extractJsonFromModelOutput,
  extractScenes,
  removeSceneAssetRequirement,
  runScriptAnalysis,
  updateAsset,
  updateScene,
  updateShot,
  uploadScriptForProject,
} from "@/server/scriptAnalysis";

const scriptText = `INT. COFFEE SHOP - MORNING
ANNA
I thought you were never coming.
David holds a brass key and scans the room.

EXT. ALLEY - NIGHT
Anna follows David through rain and neon.
Close on the brass key in her hand.`;

async function createProject() {
  const { user } = await signInWithCredentials({
    email: "writer@example.com",
    password: "assemblyline",
  });
  const workspace = await createWorkspaceForUser(user.id, { name: "Script Lab" });
  return createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Script Project" });
}

describe("script analysis pipeline", () => {
  beforeEach(() => resetStoreForTests());

  it("extracts scenes, shots, assets, requirements, and job progress", async () => {
    const project = await createProject();
    const graph = await uploadScriptForProject({
      projectId: project.id,
      filename: "pilot.txt",
      text: scriptText,
    });

    expect(graph.activeVersion?.analysisStatus).toBe("complete");
    expect(graph.scenes.map((scene) => scene.heading)).toEqual([
      "INT. COFFEE SHOP - MORNING",
      "EXT. ALLEY - NIGHT",
    ]);
    expect(graph.shots.length).toBeGreaterThanOrEqual(2);
    expect(graph.assets.some((asset) => asset.canonicalName === "Coffee Shop")).toBe(true);
    expect(graph.assets.some((asset) => asset.canonicalName === "Anna")).toBe(true);
    expect(graph.sceneAssetRequirements.length).toBeGreaterThan(0);
    expect(graph.shotAssetRequirements.length).toBeGreaterThan(0);
    expect(graph.jobs.at(-1)?.status).toBe("complete");
    expect(graph.events.at(-1)?.progressPct).toBe(100);
  });

  it("preserves user-edited scenes during re-analysis", async () => {
    const project = await createProject();
    const graph = await uploadScriptForProject({
      projectId: project.id,
      filename: "pilot.txt",
      text: scriptText,
    });
    const firstScene = graph.scenes[0];
    const firstShot = graph.shots.find((shot) => shot.sceneId === firstScene.id);

    await updateScene(project.id, firstScene.id, { summary: "User-confirmed coffee shop beat." });
    await updateShot(project.id, firstShot!.id, { userDirection: "Hold on Anna before revealing the key." });
    await runScriptAnalysis(project.id, graph.activeVersion?.id);

    const updatedGraph = getScriptAnalysisGraph(project.id);
    expect(updatedGraph.scenes[0].summary).toBe("User-confirmed coffee shop beat.");
    expect(updatedGraph.shots.find((shot) => shot.shotNumber === 1)?.userDirection).toBe(
      "Hold on Anna before revealing the key.",
    );
  });

  it("flags malformed scripts and parses fenced JSON for repair", () => {
    const scenes = extractScenes("A loose paragraph without slug lines.");
    expect(scenes[0].warnings).toBeUndefined();
    const assets = detectAssets(scenes, [{ sceneNumber: 1, shots: [{ shotNumber: 1, action: "Anna enters." }] }], "ANNA");

    expect(assets.warnings).toContain("No INT./EXT. scene headings were detected; review the generated scene manually.");
    expect(extractJsonFromModelOutput("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });

  it("rejects cross-project scene, shot, asset, and requirement mutations", async () => {
    const firstProject = await createProject();
    const firstGraph = await uploadScriptForProject({
      projectId: firstProject.id,
      filename: "first.txt",
      text: scriptText,
    });
    const secondProject = await createProject();
    const secondGraph = await uploadScriptForProject({
      projectId: secondProject.id,
      filename: "second.txt",
      text: scriptText,
    });
    const firstScene = firstGraph.scenes[0];
    const firstShot = firstGraph.shots.find((shot) => shot.sceneId === firstScene.id)!;
    const firstAsset = firstGraph.assets[0];
    const firstRequirement = firstGraph.sceneAssetRequirements[0];
    const secondScene = secondGraph.scenes[0];

    await expect(updateScene(secondProject.id, firstScene.id, { summary: "Cross-project edit" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateShot(secondProject.id, firstShot.id, { userDirection: "Cross-project edit" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateAsset(secondProject.id, firstAsset.id, { description: "Cross-project edit" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(addSceneAssetRequirement(secondProject.id, secondScene.id, firstAsset.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(removeSceneAssetRequirement(secondProject.id, firstRequirement.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const unchangedGraph = getScriptAnalysisGraph(firstProject.id);
    expect(unchangedGraph.scenes.find((scene) => scene.id === firstScene.id)?.summary).not.toBe("Cross-project edit");
    expect(unchangedGraph.shots.find((shot) => shot.id === firstShot.id)?.userDirection).toBeUndefined();
    expect(unchangedGraph.assets.find((asset) => asset.id === firstAsset.id)?.description).not.toBe("Cross-project edit");
    expect(unchangedGraph.sceneAssetRequirements.some((requirement) => requirement.id === firstRequirement.id)).toBe(true);
  });
});
