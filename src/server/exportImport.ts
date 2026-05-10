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
  getStore,
} from "@/server/repository";
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
  project: ReturnType<typeof getProjectDashboard>["project"];
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
  const project = getProject(input.projectId);
  if (!project) {
    throw new AppError("Project not found.", 404, "not_found");
  }
  await ensureProjectStorage(input.projectId);
  const dashboard = getProjectDashboard(input.projectId);
  const graph = getScriptAnalysisGraph(input.projectId);
  const job = createGenerationJob({
    projectId: input.projectId,
    type: "export",
    inputPayload: { bundleVersion: BUNDLE_VERSION },
  });
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

  const bundle = addExportBundle({
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
  return { bundle, manifestPath, manifest };
}

function createMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, createId()]));
}

function mapId(map: Map<string, string>, id: string | undefined) {
  return id ? map.get(id) ?? id : undefined;
}

export async function importProjectBundle(input: { userId: string; manifestPath: string }) {
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

  const workspace = createWorkspaceForUser(input.userId, { name: `Imported ${manifest.project.title}` });
  const project = await createProjectForWorkspace(input.userId, {
    workspaceId: workspace.id,
    title: `Imported ${manifest.project.title}`,
    targetFormat: manifest.project.targetFormat,
    aspectRatio: manifest.project.aspectRatio,
    estimatedRuntime: manifest.project.estimatedRuntime,
    rightsPolicy: manifest.project.rightsPolicy,
  });
  const store = getStore();
  const job = createGenerationJob({
    projectId: project.id,
    type: "import",
    inputPayload: { sourceBundleVersion: manifest.bundleVersion, manifestPath: input.manifestPath },
  });
  Object.assign(job, { status: "running", startedAt: nowIso() });

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
  store.scripts.push(...scripts);
  store.scriptVersions.push(...versions);
  store.scenes.push(...scenes);
  store.shots.push(...shots);
  store.assets.push(...assets);
  store.assetDetails.push(...manifest.graph.assetDetails.map((detail) => ({ ...detail, assetId: mapId(assetMap, detail.assetId)! })));
  store.assetVersions.push(...manifest.graph.assetVersions.map((version): AssetVersion => ({ ...version, id: mapId(assetVersionMap, version.id)!, assetId: mapId(assetMap, version.assetId)! })));
  store.assetReferences.push(...manifest.graph.assetReferences.map((reference): AssetReference => ({ ...reference, id: mapId(assetReferenceMap, reference.id)!, assetVersionId: mapId(assetVersionMap, reference.assetVersionId)! })));
  store.sceneAssetRequirements.push(...manifest.graph.sceneAssetRequirements.map((requirement) => ({ ...requirement, id: createId(), sceneId: mapId(sceneMap, requirement.sceneId)!, assetId: mapId(assetMap, requirement.assetId)! })));
  store.shotAssetRequirements.push(...manifest.graph.shotAssetRequirements.map((requirement) => ({ ...requirement, id: createId(), shotId: mapId(shotMap, requirement.shotId)!, assetId: mapId(assetMap, requirement.assetId)! })));
  store.storyboardFrames.push(...manifest.graph.storyboardFrames.map((frame): StoryboardFrame => ({ ...frame, id: mapId(frameMap, frame.id)!, shotId: mapId(shotMap, frame.shotId)! })));
  store.frameVersions.push(...manifest.graph.frameVersions.map((version): FrameVersion => ({ ...version, id: mapId(frameVersionMap, version.id)!, frameId: mapId(frameMap, version.frameId)! })));
  store.videoClips.push(...manifest.graph.videoClips.map((clip): VideoClip => ({ ...clip, id: mapId(clipMap, clip.id)!, shotId: mapId(shotMap, clip.shotId), sceneId: mapId(sceneMap, clip.sceneId) })));
  store.clipVersions.push(...manifest.graph.clipVersions.map((version): ClipVersion => ({ ...version, id: mapId(clipVersionMap, version.id)!, clipId: mapId(clipMap, version.clipId)! })));
  store.reviewNotes.push(...manifest.graph.reviewNotes.map((note): ReviewNote => ({ ...note, id: createId(), projectId: project.id, targetId: mapId(frameVersionMap, note.targetId) ?? mapId(clipVersionMap, note.targetId) ?? mapId(assetVersionMap, note.targetId) ?? note.targetId })));

  completeGenerationJob(job.id, { status: "complete", outputPayload: { importedProjectId: project.id } });
  addJobEvent({ jobId: job.id, projectId: project.id, eventType: "status_change", message: "Import complete.", progressPct: 100 });
  return { project, graph: getScriptAnalysisGraph(project.id) };
}
