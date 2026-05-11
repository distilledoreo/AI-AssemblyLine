import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import {
  generateAssetReference,
  mergeAssets,
  splitAsset,
  transitionAssetStatus,
  updateProjectStyle,
  uploadAssetReference,
  upsertAssetDetail,
} from "@/server/assetBible";
import { uploadScriptForProject } from "@/server/scriptAnalysis";

const scriptText = `INT. COFFEE SHOP - MORNING
ANNA
Anna holds a brass key.`;

async function analyzedProject() {
  const { user } = await signInWithCredentials({
    email: "asset@example.com",
    password: "assemblyline",
  });
  const workspace = await createWorkspaceForUser(user.id, { name: "Asset Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Assets" });
  return uploadScriptForProject({ projectId: project.id, filename: "asset.txt", text: scriptText });
}

describe("asset bible lifecycle", () => {
  beforeEach(() => resetStoreForTests());

  it("generates references, versions assets, and unlocks dependencies when approved", async () => {
    const graph = await analyzedProject();
    const asset = graph.assets.find((candidate) => candidate.canonicalName === "Anna")!;

    await upsertAssetDetail(asset.projectId, asset.id, {
      narrativeDescription: "Lead character.",
      physicalDescription: "Curly hair and nervous energy.",
    });
    const generated = await generateAssetReference({
      projectId: asset.projectId,
      assetId: asset.id,
      providerSlug: "stability",
    });
    await transitionAssetStatus(asset.projectId, asset.id, "approved");

    const updated = getScriptAnalysisGraph(asset.projectId);
    expect(generated.reference.mimeType).toBe("image/png");
    expect(updated.assetVersions.some((version) => version.assetId === asset.id)).toBe(true);
    expect(updated.assetReferences).toHaveLength(1);
    expect(updated.assets.find((candidate) => candidate.id === asset.id)?.status).toBe("approved");
  });

  it("refreshes scene and shot readiness when required assets are approved", async () => {
    const graph = await analyzedProject();
    expect(graph.scenes.map((scene) => scene.status)).toContain("blocked");
    expect(graph.shots.map((shot) => shot.status)).toContain("blocked");

    for (const asset of graph.assets) {
      await transitionAssetStatus(asset.projectId, asset.id, "approved");
    }

    const updated = getScriptAnalysisGraph(graph.assets[0].projectId);
    expect(updated.scenes.every((scene) => scene.status === "ready")).toBe(true);
    expect(updated.shots.every((shot) => shot.status === "ready")).toBe(true);
  });

  it("validates reference uploads and supports split/merge corrections", async () => {
    const graph = await analyzedProject();
    const asset = graph.assets[0];

    await expect(
      uploadAssetReference({
        projectId: asset.projectId,
        assetId: asset.id,
        filename: "bad.gif",
        data: Buffer.from("bad"),
        mimeType: "image/gif",
        referenceType: "front",
      }),
    ).rejects.toMatchObject({ code: "unsupported_media_type" });
    await expect(
      uploadAssetReference({
        projectId: asset.projectId,
        assetId: asset.id,
        filename: "empty.png",
        data: Buffer.alloc(0),
        mimeType: "image/png",
        referenceType: "front",
      }),
    ).rejects.toMatchObject({ code: "empty_media" });
    expect(getScriptAnalysisGraph(asset.projectId).assetVersions).toHaveLength(0);

    const split = await splitAsset(asset.projectId, asset.id, { canonicalName: "Duplicate Location" });
    const merged = await mergeAssets(asset.projectId, split.id, asset.id);
    expect(merged.aliases).toContain("Duplicate Location");
  });

  it("rejects cross-project asset detail, status, split, and merge mutations", async () => {
    const firstGraph = await analyzedProject();
    const secondGraph = await analyzedProject();
    const firstAsset = firstGraph.assets[0];
    const secondAsset = secondGraph.assets[0];

    await expect(
      upsertAssetDetail(secondAsset.projectId, firstAsset.id, { narrativeDescription: "Cross-project edit" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(transitionAssetStatus(secondAsset.projectId, firstAsset.id, "approved")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(splitAsset(secondAsset.projectId, firstAsset.id, { canonicalName: "Cross-project split" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(mergeAssets(secondAsset.projectId, firstAsset.id, secondAsset.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const unchangedGraph = getScriptAnalysisGraph(firstAsset.projectId);
    expect(unchangedGraph.assets.find((asset) => asset.id === firstAsset.id)?.status).toBe(firstAsset.status);
    expect(unchangedGraph.assetDetails.find((detail) => detail.assetId === firstAsset.id)).toBeUndefined();
  });

  it("updates project style and warns when changing a locked style", async () => {
    const graph = await analyzedProject();
    const projectId = graph.assets[0].projectId;
    const result = await updateProjectStyle(projectId, {
      styleName: "Painterly Noir",
      approvalStatus: "locked",
    });
    const warning = await updateProjectStyle(projectId, {
      lightingRules: "Use motivated window light.",
    });

    expect(result.style.styleName).toBe("Painterly Noir");
    expect(warning.warning).toMatch(/locked style/);
  });
});
