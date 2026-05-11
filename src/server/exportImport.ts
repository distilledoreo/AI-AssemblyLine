import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
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
  getScriptAnalysisGraphForProject,
  markGenerationJobRunning,
  persistImportedProjectGraph,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { ensureProjectStorage, getStorageRoot, projectFolderPath } from "@/server/storage";
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

const importRecordSchema = z.object({ id: z.string() }).passthrough();
const importGraphSchema = z.object({
  scripts: z.array(importRecordSchema),
  activeVersion: importRecordSchema.optional(),
  scenes: z.array(importRecordSchema.extend({ scriptVersionId: z.string() })),
  shots: z.array(importRecordSchema.extend({ sceneId: z.string() })),
  assets: z.array(importRecordSchema),
  assetDetails: z.array(z.object({ assetId: z.string() }).passthrough()),
  assetVersions: z.array(importRecordSchema.extend({ assetId: z.string() })),
  assetReferences: z.array(importRecordSchema.extend({ assetVersionId: z.string() })),
  storyboardFrames: z.array(importRecordSchema.extend({ shotId: z.string() })),
  frameVersions: z.array(importRecordSchema.extend({ frameId: z.string() })),
  reviewNotes: z.array(importRecordSchema.extend({ targetId: z.string() })),
  videoClips: z.array(importRecordSchema.extend({ shotId: z.string().optional(), sceneId: z.string().optional() })),
  clipVersions: z.array(importRecordSchema.extend({ clipId: z.string() })),
  invitations: z.array(z.unknown()).default([]),
  assignments: z.array(z.unknown()).default([]),
  activityEvents: z.array(z.unknown()).default([]),
  sceneAssetRequirements: z.array(importRecordSchema.extend({ sceneId: z.string(), assetId: z.string() })),
  shotAssetRequirements: z.array(importRecordSchema.extend({ shotId: z.string(), assetId: z.string() })),
  jobs: z.array(z.unknown()).default([]),
  events: z.array(z.unknown()).default([]),
});
const importManifestSchema = z.object({
  bundleVersion: z.number(),
  exportedAt: z.string(),
  project: z.object({
    title: z.string().min(1),
    targetFormat: z.string(),
    aspectRatio: z.string(),
    estimatedRuntime: z.number().optional(),
    rightsPolicy: z.unknown(),
  }).passthrough(),
  style: z.unknown().optional(),
  graph: importGraphSchema,
  media: z.array(z.unknown()).default([]),
  importInstructions: z.array(z.string()).default([]),
});

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
  const job = await createGenerationJob({
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
  const job = await markGenerationJobRunning(input.jobId);
  if (!job) {
    throw new AppError("Export job not found.", 404, "not_found");
  }
  await ensureProjectStorage(input.projectId);
  const dashboard = await getProjectDashboard(input.projectId);
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  await addJobEvent({ jobId: job.id, projectId: input.projectId, eventType: "status_change", message: "Export started.", progressPct: 10 });

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
  await completeGenerationJob(job.id, { status: "complete", outputPayload: { manifestPath, bundleId: bundle.id } });
  await addJobEvent({ jobId: job.id, projectId: input.projectId, eventType: "status_change", message: "Export complete.", progressPct: 100 });
  return { bundle, manifestPath, manifest, job };
}

function createMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, createId()]));
}

function mapId(map: Map<string, string>, id: string | undefined) {
  return id ? map.get(id) ?? id : undefined;
}

function requireKnownId(knownIds: Set<string>, id: string | undefined, label: string) {
  if (id && !knownIds.has(id)) {
    throw new AppError(`Import bundle has an invalid ${label} reference.`, 400, "invalid_import_bundle");
  }
}

function validateImportManifestReferences(manifest: ExportManifest) {
  const graph = manifest.graph;
  const scriptVersionIds = new Set<string>();
  if (graph.activeVersion) {
    scriptVersionIds.add(graph.activeVersion.id);
  }
  graph.scenes.forEach((scene) => scriptVersionIds.add(scene.scriptVersionId));
  const sceneIds = new Set(graph.scenes.map((scene) => scene.id));
  const shotIds = new Set(graph.shots.map((shot) => shot.id));
  const assetIds = new Set(graph.assets.map((asset) => asset.id));
  const assetVersionIds = new Set(graph.assetVersions.map((version) => version.id));
  const frameIds = new Set(graph.storyboardFrames.map((frame) => frame.id));
  const frameVersionIds = new Set(graph.frameVersions.map((version) => version.id));
  const clipIds = new Set(graph.videoClips.map((clip) => clip.id));
  const clipVersionIds = new Set(graph.clipVersions.map((version) => version.id));

  graph.shots.forEach((shot) => requireKnownId(sceneIds, shot.sceneId, "shot scene"));
  graph.assetDetails.forEach((detail) => requireKnownId(assetIds, detail.assetId, "asset detail asset"));
  graph.assetVersions.forEach((version) => requireKnownId(assetIds, version.assetId, "asset version asset"));
  graph.assetReferences.forEach((reference) => requireKnownId(assetVersionIds, reference.assetVersionId, "asset reference version"));
  graph.sceneAssetRequirements.forEach((requirement) => {
    requireKnownId(sceneIds, requirement.sceneId, "scene requirement scene");
    requireKnownId(assetIds, requirement.assetId, "scene requirement asset");
  });
  graph.shotAssetRequirements.forEach((requirement) => {
    requireKnownId(shotIds, requirement.shotId, "shot requirement shot");
    requireKnownId(assetIds, requirement.assetId, "shot requirement asset");
  });
  graph.storyboardFrames.forEach((frame) => requireKnownId(shotIds, frame.shotId, "storyboard frame shot"));
  graph.frameVersions.forEach((version) => requireKnownId(frameIds, version.frameId, "frame version frame"));
  graph.videoClips.forEach((clip) => {
    requireKnownId(shotIds, clip.shotId, "video clip shot");
    requireKnownId(sceneIds, clip.sceneId, "video clip scene");
  });
  graph.clipVersions.forEach((version) => requireKnownId(clipIds, version.clipId, "clip version clip"));
  graph.reviewNotes.forEach((note) => {
    if (
      !frameVersionIds.has(note.targetId) &&
      !clipVersionIds.has(note.targetId) &&
      !assetVersionIds.has(note.targetId)
    ) {
      throw new AppError("Import bundle has an invalid review note target reference.", 400, "invalid_import_bundle");
    }
  });
  graph.scenes.forEach((scene) => requireKnownId(scriptVersionIds, scene.scriptVersionId, "scene script version"));
}

function resolveImportManifestPath(manifestPath: string) {
  const resolvedPath = path.resolve(manifestPath);
  const storageRoot = getStorageRoot();
  const relativePath = path.relative(storageRoot, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new AppError("Import bundle must be a stored AI AssemblyLine bundle manifest.", 400, "invalid_import_bundle_path");
  }
  if (!resolvedPath.endsWith(".assemblyline-bundle.json")) {
    throw new AppError("Import bundle must use the .assemblyline-bundle.json manifest format.", 400, "invalid_import_bundle_path");
  }
  return resolvedPath;
}

export async function importProjectBundle(input: { userId: string; manifestPath: string; projectId?: string }) {
  const manifestPath = resolveImportManifestPath(input.manifestPath);
  if (isRedisQueueEnabled()) {
    const projectId = input.projectId;
    if (!projectId) {
      throw new AppError("Project ID is required to queue an import job.", 400, "missing_project_id");
    }
    const job = await createGenerationJob({
      projectId,
      type: "import",
      inputPayload: { userId: input.userId, manifestPath, projectId },
    });
    return { job };
  }
  return processImportProjectBundleJob({ ...input, manifestPath });
}

export async function processImportProjectBundleJob(input: { userId: string; manifestPath: string; projectId?: string; jobId?: string }) {
  const manifestPath = resolveImportManifestPath(input.manifestPath);
  let manifest: ExportManifest;
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = importManifestSchema.parse(JSON.parse(raw)) as ExportManifest;
  } catch {
    throw new AppError("Import bundle could not be read. Choose a valid AI AssemblyLine bundle manifest.", 400, "invalid_import_bundle");
  }
  if (manifest.bundleVersion !== BUNDLE_VERSION) {
    throw new AppError(`Unsupported bundle version ${manifest.bundleVersion}.`, 400, "unsupported_bundle_version");
  }
  validateImportManifestReferences(manifest);

  const workspace = await createWorkspaceForUser(input.userId, { name: `Imported ${manifest.project.title}` });
  const project = await createProjectForWorkspace(input.userId, {
    workspaceId: workspace.id,
    title: `Imported ${manifest.project.title}`,
    targetFormat: manifest.project.targetFormat,
    aspectRatio: manifest.project.aspectRatio,
    estimatedRuntime: manifest.project.estimatedRuntime,
    rightsPolicy: manifest.project.rightsPolicy,
  });
  const job = input.jobId
    ? await markGenerationJobRunning(input.jobId)
    : await createGenerationJob({
      projectId: project.id,
      type: "import",
      inputPayload: { sourceBundleVersion: manifest.bundleVersion, manifestPath },
      });
  if (!job) {
    throw new AppError("Import job not found.", 404, "not_found");
  }
  if (!input.jobId) {
    Object.assign(job, { status: "running", startedAt: nowIso() });
  }
  await addJobEvent({ jobId: job.id, projectId: job.projectId, eventType: "status_change", message: "Import started.", progressPct: 10 });

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

  await completeGenerationJob(job.id, { status: "complete", outputPayload: { importedProjectId: project.id } });
  await addJobEvent({ jobId: job.id, projectId: job.projectId, eventType: "status_change", message: "Import complete.", progressPct: 100 });
  return { project, graph: await getScriptAnalysisGraphForProject(project.id), job };
}
