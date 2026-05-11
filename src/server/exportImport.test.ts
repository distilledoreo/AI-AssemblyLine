import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { assignProjectTarget, createInvitation } from "@/server/collaboration";
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
  const workspace = await createWorkspaceForUser(user.id, { name: "Phase 7 Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Portable Project" });
  const analyzed = await uploadScriptForProject({ projectId: project.id, filename: "portable.txt", text: scriptText });
  await Promise.all(analyzed.assets.map((asset) => transitionAssetStatus(project.id, asset.id, "approved")));
  const ready = getScriptAnalysisGraph(project.id);
  await createInvitation({
    workspaceId: workspace.id,
    projectId: project.id,
    email: "artist@example.com",
    role: "artist",
    invitedById: user.id,
  });
  await assignProjectTarget({
    projectId: project.id,
    userId: user.id,
    targetType: "scene",
    sceneId: ready.scenes[0].id,
    actorId: user.id,
  });
  const storyboard = await generateStoryboardFrame({ projectId: project.id, shotId: ready.shots[0].id });
  await updateFrameVersion({ projectId: project.id, frameVersionId: storyboard.frameVersions[0].id, status: "approved" });
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
    expect(importedGraph.invitations).toHaveLength(original.invitations.length);
    expect(importedGraph.assignments).toHaveLength(original.assignments.length);
    expect(importedGraph.activityEvents.length).toBeGreaterThanOrEqual(original.activityEvents.length);
    expect(importedGraph.assignments[0]).toMatchObject({
      projectId: imported.project.id,
      userId: importUser.id,
      targetType: "scene",
      sceneId: importedGraph.scenes[0].id,
    });
    expect(importedGraph.invitations[0]).toMatchObject({
      workspaceId: imported.project.workspaceId,
      projectId: imported.project.id,
      email: "artist@example.com",
      invitedById: importUser.id,
    });
    expect(importedGraph.jobs.some((job) => job.type === "export" && job.status === "canceled")).toBe(true);
    expect(importedGraph.events.some((event) => importedGraph.jobs.some((job) => job.id === event.jobId))).toBe(true);
    expect(importedGraph.jobs.some((job) => job.type === "import" && job.status === "complete")).toBe(true);
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

    const metrics = await getProjectJobMetrics(project.id);
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

    const missingBundlePath = path.join(projectFolderPath("missing-project", "exports"), "missing.assemblyline-bundle.json");
    await expect(importProjectBundle({ userId: user.id, manifestPath: missingBundlePath })).rejects.toMatchObject({
      code: "invalid_import_bundle",
      status: 400,
    });
  });

  it("rejects malformed bundle manifests before importing records", async () => {
    const { user } = await signInWithCredentials({ email: "malformed-import@example.com", password: "assemblyline" });
    const bundleDir = projectFolderPath("malformed-project", "exports");
    await mkdir(bundleDir, { recursive: true });
    const malformedPath = path.join(bundleDir, "malformed.assemblyline-bundle.json");
    await writeFile(
      malformedPath,
      JSON.stringify({
        bundleVersion: 1,
        exportedAt: new Date().toISOString(),
        project: { title: "Malformed" },
        graph: { scripts: [] },
        media: [],
        importInstructions: [],
      }),
    );

    await expect(importProjectBundle({ userId: user.id, manifestPath: malformedPath })).rejects.toMatchObject({
      code: "invalid_import_bundle",
      status: 400,
    });
  });

  it("rejects bundle manifests with broken graph references before importing records", async () => {
    const { user } = await signInWithCredentials({ email: "broken-reference-import@example.com", password: "assemblyline" });
    const bundleDir = projectFolderPath("broken-reference-project", "exports");
    await mkdir(bundleDir, { recursive: true });
    const brokenReferencePath = path.join(bundleDir, "broken-reference.assemblyline-bundle.json");
    await writeFile(
      brokenReferencePath,
      JSON.stringify({
        bundleVersion: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: "Broken Reference",
          targetFormat: "short",
          aspectRatio: "16:9",
          rightsPolicy: {},
        },
        graph: {
          scripts: [],
          scenes: [{ id: "scene-1", scriptVersionId: "version-1" }],
          shots: [{ id: "shot-1", sceneId: "missing-scene" }],
          assets: [],
          assetDetails: [],
          assetVersions: [],
          assetReferences: [],
          storyboardFrames: [],
          frameVersions: [],
          reviewNotes: [],
          videoClips: [],
          clipVersions: [],
          sceneAssetRequirements: [],
          shotAssetRequirements: [],
        },
        media: [],
        importInstructions: [],
      }),
    );

    await expect(importProjectBundle({ userId: user.id, manifestPath: brokenReferencePath })).rejects.toMatchObject({
      code: "invalid_import_bundle",
      status: 400,
    });
  });

  it("rejects bundle manifests with duplicate graph IDs before importing records", async () => {
    const { user } = await signInWithCredentials({ email: "duplicate-import@example.com", password: "assemblyline" });
    const bundleDir = projectFolderPath("duplicate-import-project", "exports");
    await mkdir(bundleDir, { recursive: true });
    const duplicatePath = path.join(bundleDir, "duplicate.assemblyline-bundle.json");
    await writeFile(
      duplicatePath,
      JSON.stringify({
        bundleVersion: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: "Duplicate IDs",
          targetFormat: "short",
          aspectRatio: "16:9",
          rightsPolicy: {},
        },
        graph: {
          scripts: [],
          scenes: [
            { id: "scene-1", scriptVersionId: "version-1" },
            { id: "scene-1", scriptVersionId: "version-1" },
          ],
          shots: [],
          assets: [],
          assetDetails: [],
          assetVersions: [],
          assetReferences: [],
          storyboardFrames: [],
          frameVersions: [],
          reviewNotes: [],
          videoClips: [],
          clipVersions: [],
          sceneAssetRequirements: [],
          shotAssetRequirements: [],
        },
        media: [],
        importInstructions: [],
      }),
    );

    await expect(importProjectBundle({ userId: user.id, manifestPath: duplicatePath })).rejects.toMatchObject({
      code: "invalid_import_bundle",
      status: 400,
    });
  });

  it("rejects import manifests outside storage or with the wrong extension", async () => {
    const { user } = await signInWithCredentials({ email: "unsafe-import@example.com", password: "assemblyline" });

    await expect(importProjectBundle({ userId: user.id, manifestPath: "C:/Windows/win.ini" })).rejects.toMatchObject({
      code: "invalid_import_bundle_path",
      status: 400,
    });
    await expect(
      importProjectBundle({ userId: user.id, manifestPath: path.join(projectFolderPath("unsafe-project", "exports"), "bundle.json") }),
    ).rejects.toMatchObject({
      code: "invalid_import_bundle_path",
      status: 400,
    });
  });
});
