import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/server/errors";
import { createId, nowIso, slugify } from "@/server/ids";
import {
  addExportBundle,
  addJobEvent,
  completeGenerationJob,
  createGenerationJob,
  createProjectForWorkspace,
  createWorkspaceForUser,
  getProject,
  getProjectDashboard,
  getScriptAnalysisGraph,
  getScriptAnalysisGraphForProject,
  getStore,
  persistImportedProjectGraph,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { ensureProjectStorage, projectFolderPath } from "@/server/storage";
import type {
  Asset,
  AssetReference,
  AssetVersion,
  ClipVersion,
  FrameVersion,
  ProjectStyle,
  ReviewNote,
  Scene,
  Script,
  ScriptAnalysisGraph,
  ScriptVersion,
  Shot,
  StoryboardFrame,
  VideoClip,
} from "@/server/types";

export const BUNDLE_VERSION = 1;

type ExportManifest = {
  bundleVersion: number;
  exportedAt: string;
  project: Awaited<ReturnType<typeof getProjectDashboard>>["project"];
  style?: ProjectStyle;
  graph: ScriptAnalysisGraph;
  media: Array<{ sourcePath: string; bundledPath: string; kind: string; exists: boolean }>;
  importInstructions: string[];
};

function collectMedia(graph: ScriptAnalysisGraph) {
  return [
    ...graph.assetReferences.map((reference) => ({ sourcePath: reference.filePath, kind: "asset_reference" })),
    ...graph.frameVersions.map((version) => ({ sourcePath: version.filePath, kind: "storyboard_frame" })),
    ...graph.clipVersions.map((version) => ({ sourcePath: version.filePath, kind: "video_clip" })),
  ].filter((item) => item.sourcePath);
}

async function copyMediaFiles(projectId: string, graph: ScriptAnalysisGraph) {
  const mediaRoot = path.join(projectFolderPath(projectId, "exports"), "media");
  await mkdir(mediaRoot, { recursive: true });
  const copied = [];
  for (const [index, media] of collectMedia(graph).entries()) {
    const ext = path.extname(media.sourcePath) || ".bin";
    const bundledPath = path.join(mediaRoot, `${String(index + 1).padStart(3, "0")}-${media.kind}${ext}`);
    let exists = true;
    try {
      await copyFile(media.sourcePath, bundledPath);
    } catch {
      exists = false;
    }
    copied.push({ ...media, bundledPath, exists });
  }
  return copied;
}

export async function exportProjectBundle(input: { projectId: string; userId: string }) {
  const project = await getProject(input.projectId);
  if (!project) {
    throw new AppError("Project not found.", 404, "not_found");
  }
  const job = createGenerationJob({
    projectId: input.projectId,
    type: "export",
    inputPayload: { projectId: input.projectId, userId: input.userId, bundleVersion: BUNDLE_VERSION },
  });
  if (isRedisQueueEnabled()) {
    return { job, graph: await getScriptAnalysisGraphForProject(input.projectId) };
  }
  return processExportProjectBundleJob({ ...input, jobId: job.id });
}

export async function processExportProjectBundleJob(input: { projectId: string; userId: string; jobId: string }) {
  const project = await getProject(input.projectId);
  if (!project) {
    throw new AppError("Project not found.", 404, "not_found");
  }
  const job = getStore().generationJobs.find((candidate) => candidate.id === input.jobId);
  if (!job) {
    throw new AppError("Export job not found.", 404, "not_found");
  }
  await ensureProjectStorage(input.projectId);
  const dashboard = await getProjectDashboard(input.projectId);
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  Object.assign(job, { status: "running", startedAt: nowIso() });
  addJobEvent({ jobId: job.id, projectId: input.projectId, eventType: "status_change", message: "Export started.", progressPct: 10 });

  const media = await copyMediaFiles(input.projectId, graph);
  const manifest: ExportManifest = {
    bundleVersion: BUNDLE_VERSION,
    exportedAt: nowIso(),
    project: dashboard.project,
    style: dashboard.style,
    graph,
    media,
    importInstructions: [
      "Import this manifest through the project operations panel.",
      "Provider API keys are intentionally excluded and must be configured in the target workspace.",
    ],
  };
  const safeTitle = slugify(project.title) || "project";
  const manifestPath = path.join(projectFolderPath(input.projectId, "exports"), `${safeTitle}-${Date.now()}.assemblyline-bundle.json`);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const bundle = await addExportBundle({
    id: createId(),
    projectId: input.projectId,
    bundleVersion: BUNDLE_VERSION,
    manifestPath,
    mediaFileCount: media.length,
    metadataRecordCount: Object.values(graph).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value ? 1 : 0), 1),
    createdById: input.userId,
    createdAt: nowIso(),
  });
  completeGenerationJob(job.id, { status: "complete", outputPayload: { manifestPath, bundleId: bundle.id } });
  addJobEvent({ jobId: job.id, projectId: input.projectId, eventType: "status_change", message: "Export complete.", progressPct: 100 });
  return { bundle, manifestPath, manifest, job };
}

function createMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, createId()]));
}

function mapId(map: Map<string, string>, id: string | undefined) {
  return id ? map.get(id) ?? id : undefined;
}

export async function importProjectBundle(input: { userId: string; manifestPath: string; projectId?: string }) {
  if (isRedisQueueEnabled()) {
    const projectId = input.projectId;
    if (!projectId) {
      throw new AppError("Project ID is required to queue an import job.", 400, "missing_project_id");
    }
    const job = createGenerationJob({
      projectId,
      type: "import",
      inputPayload: { userId: input.userId, manifestPath: input.manifestPath, projectId },
    });
    return { job };
  }
  return processImportProjectBundleJob(input);
}

export async function processImportProjectBundleJob(input: { userId: string; manifestPath: string; projectId?: string; jobId?: string }) {
  let manifest: ExportManifest;
  try {
    const raw = await readFile(input.manifestPath, "utf8");
    manifest = JSON.parse(raw) as ExportManifest;
  } catch {
    throw new AppError("Import bundle could not be read. Choose a valid AI AssemblyLine bundle manifest.", 400, "invalid_import_bundle");
  }
  if (manifest.bundleVersion !== BUNDLE_VERSION) {
    throw new AppError(`Unsupported bundle version ${manifest.bundleVersion}.`, 400, "unsupported_bundle_version");
  }

  const workspace = await createWorkspaceForUser(input.userId, { name: `Imported ${manifest.project.title}` });
  const project = await createProjectForWorkspace(input.userId, {
    workspaceId: workspace.id,
    title: `Imported ${manifest.project.title}`,
    targetFormat: manifest.project.targetFormat,
    aspectRatio: manifest.project.aspectRatio,
    estimatedRuntime: manifest.project.estimatedRuntime,
    rightsPolicy: manifest.project.rightsPolicy,
  });
  const store = getStore();
  const job = input.jobId
    ? store.generationJobs.find((candidate) => candidate.id === input.jobId)
    : createGenerationJob({
        projectId: project.id,
        type: "import",
        inputPayload: { sourceBundleVersion: manifest.bundleVersion, manifestPath: input.manifestPath },
      });
  if (!job) {
    throw new AppError("Import job not found.", 404, "not_found");
  }
  Object.assign(job, { status: "running", startedAt: nowIso() });
  addJobEvent({ jobId: job.id, projectId: job.projectId, eventType: "status_change", message: "Import started.", progressPct: 10 });

  const scriptMap = createMap(manifest.graph.scripts);
  const versionMap = createMap(manifest.graph.activeVersion ? [manifest.graph.activeVersion, ...manifest.graph.scripts.flatMap(() => [])] : []);
  manifest.graph.scripts.forEach((script) => scriptMap.set(script.id, createId()));
  manifest.graph.activeVersion && versionMap.set(manifest.graph.activeVersion.id, createId());
  manifest.graph.scenes.forEach((scene) => versionMap.set(scene.scriptVersionId, versionMap.get(scene.scriptVersionId) ?? createId()));
  const sceneMap = createMap(manifest.graph.scenes);
  const shotMap = createMap(manifest.graph.shots);
  const assetMap = createMap(manifest.graph.assets);
  const assetVersionMap = createMap(manifest.graph.assetVersions);
  const assetReferenceMap = createMap(manifest.graph.assetReferences);
  const frameMap = createMap(manifest.graph.storyboardFrames);
  const frameVersionMap = createMap(manifest.graph.frameVersions);
  const clipMap = createMap(manifest.graph.videoClips);
  const clipVersionMap = createMap(manifest.graph.clipVersions);

  const firstScriptId = scriptMap.get(manifest.graph.scripts[0]?.id ?? "") ?? createId();
  const scripts: Script[] = manifest.graph.scripts.map((script) => ({ ...script, id: mapId(scriptMap, script.id)!, projectId: project.id }));
  const versions: ScriptVersion[] = manifest.graph.activeVersion
    ? [{ ...manifest.graph.activeVersion, id: mapId(versionMap, manifest.graph.activeVersion.id)!, scriptId: firstScriptId, isActive: true }]
    : [];
  const scenes: Scene[] = manifest.graph.scenes.map((scene) => ({
    ...scene,
    id: mapId(sceneMap, scene.id)!,
    scriptVersionId: versions[0]?.id ?? scene.scriptVersionId,
  }));
  const shots: Shot[] = manifest.graph.shots.map((shot) => ({ ...shot, id: mapId(shotMap, shot.id)!, sceneId: mapId(sceneMap, shot.sceneId)! }));
  const assets: Asset[] = manifest.graph.assets.map((asset) => ({ ...asset, id: mapId(assetMap, asset.id)!, projectId: project.id }));
  const assetDetails = manifest.graph.assetDetails.map((detail) => ({ ...detail, assetId: mapId(assetMap, detail.assetId)! }));
  const assetVersions = manifest.graph.assetVersions.map((version): AssetVersion => ({ ...version, id: mapId(assetVersionMap, version.id)!, assetId: mapId(assetMap, version.assetId)! }));
  const assetReferences = manifest.graph.assetReferences.map((reference): AssetReference => ({ ...reference, id: mapId(assetReferenceMap, reference.id)!, assetVersionId: mapId(assetVersionMap, reference.assetVersionId)! }));
  const sceneAssetRequirements = manifest.graph.sceneAssetRequirements.map((requirement) => ({ ...requirement, id: createId(), sceneId: mapId(sceneMap, requirement.sceneId)!, assetId: mapId(assetMap, requirement.assetId)! }));
  const shotAssetRequirements = manifest.graph.shotAssetRequirements.map((requirement) => ({ ...requirement, id: createId(), shotId: mapId(shotMap, requirement.shotId)!, assetId: mapId(assetMap, requirement.assetId)! }));
  const storyboardFrames = manifest.graph.storyboardFrames.map((frame): StoryboardFrame => ({ ...frame, id: mapId(frameMap, frame.id)!, shotId: mapId(shotMap, frame.shotId)! }));
  const frameVersions = manifest.graph.frameVersions.map((version): FrameVersion => ({ ...version, id: mapId(frameVersionMap, version.id)!, frameId: mapId(frameMap, version.frameId)! }));
  const videoClips = manifest.graph.videoClips.map((clip): VideoClip => ({ ...clip, id: mapId(clipMap, clip.id)!, shotId: mapId(shotMap, clip.shotId), sceneId: mapId(sceneMap, clip.sceneId) }));
  const clipVersions = manifest.graph.clipVersions.map((version): ClipVersion => ({ ...version, id: mapId(clipVersionMap, version.id)!, clipId: mapId(clipMap, version.clipId)! }));
  const reviewNotes = manifest.graph.reviewNotes.map((note): ReviewNote => ({
    ...note,
    id: createId(),
    projectId: project.id,
    authorId: input.userId,
    targetId: mapId(frameVersionMap, note.targetId) ?? mapId(clipVersionMap, note.targetId) ?? mapId(assetVersionMap, note.targetId) ?? note.targetId,
  }));
  store.scripts.push(...scripts);
  store.scriptVersions.push(...versions);
  store.scenes.push(...scenes);
  store.shots.push(...shots);
  store.assets.push(...assets);
  store.assetDetails.push(...assetDetails);
  store.assetVersions.push(...assetVersions);
  store.assetReferences.push(...assetReferences);
  store.sceneAssetRequirements.push(...sceneAssetRequirements);
  store.shotAssetRequirements.push(...shotAssetRequirements);
  store.storyboardFrames.push(...storyboardFrames);
  store.frameVersions.push(...frameVersions);
  store.videoClips.push(...videoClips);
  store.clipVersions.push(...clipVersions);
  store.reviewNotes.push(...reviewNotes);
  await persistImportedProjectGraph({
    ...manifest.graph,
    scripts,
    activeVersion: versions[0],
    scenes,
    shots,
    assets,
    assetDetails,
    assetVersions,
    assetReferences,
    sceneAssetRequirements,
    shotAssetRequirements,
    storyboardFrames,
    frameVersions,
    videoClips,
    clipVersions,
    reviewNotes,
  });

  completeGenerationJob(job.id, { status: "complete", outputPayload: { importedProjectId: project.id } });
  addJobEvent({ jobId: job.id, projectId: job.projectId, eventType: "status_change", message: "Import complete.", progressPct: 100 });
  return { project, graph: getScriptAnalysisGraph(project.id), job };
}
