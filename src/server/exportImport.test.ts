import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getRemainingAdapterCapabilities } from "@/providers/extendedAdapters";
import { transitionAssetStatus } from "@/server/assetBible";
import { exportProjectBundle, importProjectBundle } from "@/server/exportImport";
import { getProjectJobMetrics } from "@/server/observability";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import { uploadScriptForProject } from "@/server/scriptAnalysis";
import { generateStoryboardFrame, updateFrameVersion } from "@/server/storyboard";
import { projectFolderPath } from "@/server/storage";
import { cleanupOrphanFiles, getProjectStorageUsage } from "@/server/storageManagement";
import { generateVideoClip } from "@/server/video";

const scriptText = `INT. OBSERVATORY - NIGHT
MARA
The lens is already awake.
Mara points the silver telescope at the storm.`;

async function createPortableProject() {
  const { user } = await signInWithCredentials({ email: "phase7@example.com", password: "assemblyline" });
  const workspace = createWorkspaceForUser(user.id, { name: "Phase 7 Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Portable Project" });
  const analyzed = await uploadScriptForProject({ projectId: project.id, filename: "portable.txt", text: scriptText });
  analyzed.assets.forEach((asset) => transitionAssetStatus(asset.id, "approved"));
  const ready = getScriptAnalysisGraph(project.id);
  const storyboard = await generateStoryboardFrame({ projectId: project.id, shotId: ready.shots[0].id });
  updateFrameVersion({ projectId: project.id, frameVersionId: storyboard.frameVersions[0].id, status: "approved" });
  await generateVideoClip({ projectId: project.id, mode: "shot", shotId: ready.shots[0].id, providerSlug: "runway" });
  return { user, project };
}

describe("phase 7 export, import, operations, and adapters", () => {
  beforeEach(() => resetStoreForTests());

  it("exports a versioned project bundle and re-imports it into a fresh store", async () => {
    const { user, project } = await createPortableProject();
    const original = getScriptAnalysisGraph(project.id);
    const exported = await exportProjectBundle({ projectId: project.id, userId: user.id });

    expect(exported.manifest.bundleVersion).toBe(1);
    expect(exported.manifest.media.length).toBeGreaterThan(0);
    expect(exported.manifestPath.endsWith(".assemblyline-bundle.json")).toBe(true);
    expect(exported.manifest).not.toHaveProperty("providerKeys");

    resetStoreForTests();
    const { user: importUser } = await signInWithCredentials({ email: "import@example.com", password: "assemblyline" });
    const imported = await importProjectBundle({ userId: importUser.id, manifestPath: exported.manifestPath });
    const importedGraph = getScriptAnalysisGraph(imported.project.id);

    expect(imported.project.title).toContain("Imported");
    expect(importedGraph.scenes).toHaveLength(original.scenes.length);
    expect(importedGraph.shots).toHaveLength(original.shots.length);
    expect(importedGraph.assets).toHaveLength(original.assets.length);
    expect(importedGraph.frameVersions).toHaveLength(original.frameVersions.length);
    expect(importedGraph.clipVersions).toHaveLength(original.clipVersions.length);
    expect(importedGraph.jobs.at(-1)?.type).toBe("import");
  });

  it("reports job metrics, storage warnings, orphan cleanup, and remaining adapter capabilities", async () => {
    const { project } = await createPortableProject();
    const orphanDir = path.join(projectFolderPath(project.id, "assets"), "orphan");
    await mkdir(orphanDir, { recursive: true });
    const orphanPath = path.join(orphanDir, "partial.tmp");
    await writeFile(orphanPath, "partial generation output");

    const usage = await getProjectStorageUsage(project.id);
    expect(usage.orphanFiles).toContain(orphanPath);
    expect(await cleanupOrphanFiles(project.id)).toMatchObject({ removedFiles: 1 });
    expect((await getProjectStorageUsage(project.id)).orphanFiles).not.toContain(orphanPath);

    const metrics = getProjectJobMetrics(project.id);
    expect(metrics.totalJobs).toBeGreaterThan(0);
    expect(metrics.jobsByStatus.complete).toBeGreaterThan(0);

    const adapters = getRemainingAdapterCapabilities();
    expect(adapters.map((adapter) => adapter.slug)).toEqual([
      "bytedance-seedance",
      "pika",
      "luma",
      "elevenlabs",
    ]);
    expect(adapters.find((adapter) => adapter.slug === "pika")?.capabilities).toMatchObject({
      supportsVideoExtension: true,
    });
  });

  it("rejects unreadable import manifests with a user-facing error", async () => {
    const { user } = await signInWithCredentials({ email: "bad-import@example.com", password: "assemblyline" });

    await expect(importProjectBundle({ userId: user.id, manifestPath: "C:/does-not-exist/phase7.json" })).rejects.toMatchObject({
      code: "invalid_import_bundle",
      status: 400,
    });
  });
});
