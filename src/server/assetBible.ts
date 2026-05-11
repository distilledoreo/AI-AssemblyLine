import { mkdir, writeFile } from "node:fs/promises";
import { OpenAIAdapter } from "@/providers/openai";
import { StabilityAdapter } from "@/providers/stability";
import { AppError, NotFoundError } from "@/server/errors";
import {
  addJobEvent,
  completeGenerationJob,
  createGenerationJob,
  getAssetById,
  getProjectDashboard,
  getScriptAnalysisGraphForProject,
  markGenerationJobRunning,
  persistAssetMergeState,
  persistCreatedAssetState,
  persistAssetDetailState,
  persistAssetState,
  persistAssetVersionState,
  persistAssetVersionAndReference,
  persistProjectStyleState,
  refreshPrismaReadiness,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { resolveOpenAiApiKeyForProject, resolveStabilityApiKeyForProject } from "@/server/providerKeys";
import { createId, nowIso } from "@/server/ids";
import { projectFolderPath, storagePath } from "@/server/storage";
import { markFramesStaleForAsset } from "@/server/storyboard";
import type {
  Asset,
  AssetDetail,
  AssetReference,
  AssetReferenceType,
  AssetStatus,
  AssetType,
  AssetVersion,
  ProjectStyle,
  ScriptAnalysisGraph,
} from "@/server/types";

export async function upsertAssetDetail(assetId: string, input: Partial<AssetDetail>) {
  const asset = await getAssetById(assetId);
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "locked") {
    throw new AppError("This asset is locked. Unlock it before editing continuity details.", 409, "asset_locked");
  }
  const graph = await getScriptAnalysisGraphForProject(asset.projectId);
  const timestamp = nowIso();
  const existing = graph.assetDetails.find((detail) => detail.assetId === assetId);
  if (existing) {
    Object.assign(existing, input, { updatedAt: timestamp });
    asset.updatedAt = timestamp;
    await persistAssetDetailState(asset, existing);
    return existing;
  }
  const detail = { assetId, ...input, updatedAt: timestamp };
  asset.updatedAt = timestamp;
  if (asset.status === "missing") {
    asset.status = "draft";
  }
  await persistAssetDetailState(asset, detail);
  return detail;
}

export async function createAssetVersion(assetId: string, input: { description?: string; status?: AssetVersion["status"] }) {
  const asset = await getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  const graph = await getScriptAnalysisGraphForProject(asset.projectId);
  const version = buildAssetVersion(asset, graph.assetVersions, input);
  if (asset.status === "missing") {
    asset.status = "draft";
  }
  await persistAssetState(asset);
  await persistAssetVersionState(version);
  return version;
}

export async function uploadAssetReference(input: {
  projectId: string;
  assetId: string;
  filename: string;
  data: Buffer;
  mimeType: string;
  referenceType: AssetReferenceType;
}) {
  validateImageMime(input.mimeType);
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const asset = await resolveProjectAsset(input.projectId, input.assetId, graph);
  const version = await createAssetVersion(input.assetId, { description: `Uploaded reference: ${input.filename}` });
  const dir = storagePath(projectFolderPath(input.projectId, "assets"), input.assetId);
  await mkdir(dir, { recursive: true });
  const safeName = input.filename.replace(/[^a-z0-9._-]/gi, "_") || "reference.png";
  const filePath = storagePath(dir, `${version.versionNumber}-${safeName}`);
  await writeFile(filePath, input.data);
  const reference: AssetReference = {
    id: createId(),
    assetVersionId: version.id,
    referenceType: input.referenceType,
    filePath,
    mimeType: input.mimeType,
    thumbnailPath: filePath,
    createdAt: nowIso(),
  };
  asset.status = "needs_review";
  asset.updatedAt = nowIso();
  await persistAssetState(asset);
  await persistAssetVersionAndReference({ version, reference });
  return { version, reference };
}

export async function generateAssetReference(input: {
  projectId: string;
  assetId: string;
  providerSlug: "openai" | "stability";
}) {
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const asset = await resolveProjectAsset(input.projectId, input.assetId, graph);
  const adapter =
    input.providerSlug === "stability"
      ? new StabilityAdapter(await resolveStabilityApiKeyForProject(input.projectId))
      : new OpenAIAdapter(await resolveOpenAiApiKeyForProject(input.projectId));
  const job = await createGenerationJob({
    projectId: input.projectId,
    type: "asset_reference",
    providerSlug: adapter.slug,
    modelId: input.providerSlug === "stability" ? "stable-image-core" : "gpt-image-1",
    inputPayload: { projectId: input.projectId, assetId: asset.id, providerSlug: input.providerSlug },
  });
  if (isRedisQueueEnabled()) {
    return { job, graph: await getScriptAnalysisGraphForProject(input.projectId) };
  }
  return processAssetReferenceJob({
    projectId: input.projectId,
    assetId: asset.id,
    providerSlug: input.providerSlug,
    jobId: job.id,
  });
}

export async function processAssetReferenceJob(input: {
  projectId: string;
  assetId: string;
  providerSlug: "openai" | "stability";
  jobId: string;
}) {
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const asset = await resolveProjectAsset(input.projectId, input.assetId, graph);
  const job = await markGenerationJobRunning(input.jobId);
  if (!job) {
    throw new NotFoundError("Generation job not found.");
  }
  const adapter =
    input.providerSlug === "stability"
      ? new StabilityAdapter(await resolveStabilityApiKeyForProject(input.projectId))
      : new OpenAIAdapter(await resolveOpenAiApiKeyForProject(input.projectId));
  await addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "status_change",
    message: "Asset reference generation started.",
    progressPct: 10,
  });
  const result = await adapter.generateImage(
    {
      positivePrompt: `${asset.type} reference sheet for ${asset.canonicalName}. ${asset.description ?? ""}`,
      negativePrompt: asset.negativePrompts ?? "inconsistent continuity, off-model details",
      referenceImages: [],
      generationSettings: { width: 1024, height: 1024 },
      metadata: { sourceIds: [asset.id], conflictWarnings: [], truncationWarnings: [] },
    },
    { modelId: job.modelId ?? "mock-image", width: 1024, height: 1024, count: 1 },
  );
  const version = buildAssetVersion(
    asset,
    graph.assetVersions,
    { description: `Generated ${input.providerSlug} reference sheet.` },
  );
  const dir = storagePath(projectFolderPath(input.projectId, "assets"), asset.id);
  await mkdir(dir, { recursive: true });
  const filePath = storagePath(dir, `${version.versionNumber}-${input.providerSlug}-reference.png`);
  await writeFile(filePath, result.images[0].data);
  const reference: AssetReference = {
    id: createId(),
    assetVersionId: version.id,
    referenceType: "turnaround",
    filePath,
    mimeType: result.images[0].mimeType,
    width: 1024,
    height: 1024,
    thumbnailPath: filePath,
    generationJobId: job.id,
    createdAt: nowIso(),
  };
  asset.status = "needs_review";
  asset.updatedAt = nowIso();
  await persistAssetState(asset);
  await persistAssetVersionAndReference({ version, reference });
  await completeGenerationJob(job.id, { status: "complete", outputPayload: { assetVersionId: version.id, referenceId: reference.id } });
  await addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "status_change",
    message: "Asset reference generation complete.",
    progressPct: 100,
  });
  return { version, reference, job };
}

export async function transitionAssetStatus(assetId: string, status: AssetStatus) {
  const asset = await getAssetById(assetId);
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "locked" && status !== "locked") {
    asset.continuityNotes = `${asset.continuityNotes ?? ""}\nUnlocked after warning acknowledgement.`.trim();
  }
  const wasApproved = ["approved", "locked"].includes(asset.status);
  asset.status = status;
  asset.updatedAt = nowIso();
  if (wasApproved && !["approved", "locked"].includes(status)) {
    await markFramesStaleForAsset(asset.projectId, asset.id);
  }
  refreshReadiness(asset.projectId);
  await persistAssetState(asset);
  await refreshPrismaReadiness(asset.projectId);
  return asset;
}

export async function mergeAssets(sourceAssetId: string, targetAssetId: string) {
  const source = await getAssetById(sourceAssetId);
  const target = await getAssetById(targetAssetId);
  if (!source || !target || source.projectId !== target.projectId) {
    throw new NotFoundError("Assets to merge were not found.");
  }
  target.aliases = Array.from(new Set([...target.aliases, source.canonicalName, ...source.aliases]));
  source.status = "superseded";
  source.updatedAt = nowIso();
  refreshReadiness(target.projectId);
  await persistAssetMergeState({ source, target });
  await refreshPrismaReadiness(target.projectId);
  return target;
}

export async function splitAsset(assetId: string, input: { canonicalName: string; type?: AssetType }) {
  const source = await getAssetById(assetId);
  if (!source) throw new NotFoundError("Asset not found.");
  const timestamp = nowIso();
  const asset: Asset = {
    ...source,
    id: createId(),
    canonicalName: input.canonicalName,
    type: input.type ?? source.type,
    aliases: [],
    status: "missing",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await persistCreatedAssetState(asset);
  return asset;
}

export async function updateProjectStyle(projectId: string, input: Partial<ProjectStyle>) {
  const style = (await getProjectDashboard(projectId)).style;
  if (!style) {
    throw new NotFoundError("Project style not found.");
  }
  const wasLocked = style.approvalStatus === "locked";
  Object.assign(style, input, { updatedAt: nowIso() });
  await persistProjectStyleState(style);
  return {
    style,
    warning: wasLocked ? "Changing a locked style can stale approved storyboards and clips." : undefined,
  };
}

function validateImageMime(mimeType: string) {
  if (!["image/png", "image/jpeg", "image/webp", "image/tiff", "image/bmp"].includes(mimeType)) {
    throw new AppError("Unsupported reference image format.", 400, "unsupported_media_type");
  }
}

function buildAssetVersion(asset: Asset, knownVersions: AssetVersion[], input: { description?: string; status?: AssetVersion["status"] }) {
  const versionNumber =
    knownVersions
      .filter((version) => version.assetId === asset.id)
      .reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  return {
    id: createId(),
    assetId: asset.id,
    versionNumber,
    description: input.description ?? asset.description,
    status: input.status ?? "draft",
    createdAt: nowIso(),
  };
}

async function resolveProjectAsset(projectId: string, assetId: string, graph: ScriptAnalysisGraph) {
  const asset = graph.assets.find((candidate) => candidate.id === assetId) ?? (await getAssetById(assetId));
  if (!asset || asset.projectId !== projectId) {
    throw new NotFoundError("Asset not found.");
  }
  return asset;
}

function refreshReadiness(projectId: string) {
  const store = globalThis.__assemblyLineStore;
  if (!store) {
    return;
  }
  const approvedAssetIds = new Set(
    store.assets.filter((asset) => asset.projectId === projectId && ["approved", "locked"].includes(asset.status)).map((asset) => asset.id),
  );
  for (const scene of store.scenes) {
    const reqs = store.sceneAssetRequirements.filter((req) => req.sceneId === scene.id && !req.isOptional);
    scene.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
  for (const shot of store.shots) {
    const reqs = store.shotAssetRequirements.filter((req) => req.shotId === shot.id && !req.isOptional);
    shot.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
}
