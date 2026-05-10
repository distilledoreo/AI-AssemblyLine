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

    await upsertAssetDetail(asset.id, {
      narrativeDescription: "Lead character.",
      physicalDescription: "Curly hair and nervous energy.",
    });
    const generated = await generateAssetReference({
      projectId: asset.projectId,
      assetId: asset.id,
      providerSlug: "stability",
    });
    await transitionAssetStatus(asset.id, "approved");

    const updated = getScriptAnalysisGraph(asset.projectId);
    expect(generated.reference.mimeType).toBe("image/png");
    expect(updated.assetVersions.some((version) => version.assetId === asset.id)).toBe(true);
    expect(updated.assetReferences).toHaveLength(1);
    expect(updated.assets.find((candidate) => candidate.id === asset.id)?.status).toBe("approved");
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

    const split = splitAsset(asset.id, { canonicalName: "Duplicate Location" });
    const merged = mergeAssets(split.id, asset.id);
    expect(merged.aliases).toContain("Duplicate Location");
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
