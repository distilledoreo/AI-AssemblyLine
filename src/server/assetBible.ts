import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OpenAIAdapter } from "@/providers/openai";
import { StabilityAdapter } from "@/providers/stability";
import { AppError, NotFoundError } from "@/server/errors";
import { createGenerationJob, getStore, persistAssetState, refreshPrismaReadiness } from "@/server/repository";
import { createId, nowIso } from "@/server/ids";
import { projectFolderPath } from "@/server/storage";
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
} from "@/server/types";

export function upsertAssetDetail(assetId: string, input: Partial<AssetDetail>) {
  const store = getStore();
  const asset = store.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  if (asset.status === "locked") {
    throw new AppError("This asset is locked. Unlock it before editing continuity details.", 409, "asset_locked");
  }
  const timestamp = nowIso();
  const existing = store.assetDetails.find((detail) => detail.assetId === assetId);
  if (existing) {
    Object.assign(existing, input, { updatedAt: timestamp });
    asset.updatedAt = timestamp;
    return existing;
  }
  const detail = { assetId, ...input, updatedAt: timestamp };
  store.assetDetails.push(detail);
  asset.updatedAt = timestamp;
  if (asset.status === "missing") {
    asset.status = "draft";
  }
  return detail;
}

export function createAssetVersion(assetId: string, input: { description?: string; status?: AssetVersion["status"] }) {
  const store = getStore();
  const asset = store.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  const versionNumber = store.assetVersions.filter((version) => version.assetId === assetId).length + 1;
  const version: AssetVersion = {
    id: createId(),
    assetId,
    versionNumber,
    description: input.description ?? asset.description,
    status: input.status ?? "draft",
    createdAt: nowIso(),
  };
  store.assetVersions.push(version);
  if (asset.status === "missing") {
    asset.status = "draft";
  }
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
  const store = getStore();
  const asset = store.assets.find((candidate) => candidate.id === input.assetId && candidate.projectId === input.projectId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  const version = createAssetVersion(input.assetId, { description: `Uploaded reference: ${input.filename}` });
  const dir = path.join(projectFolderPath(input.projectId, "assets"), input.assetId);
  await mkdir(dir, { recursive: true });
  const safeName = input.filename.replace(/[^a-z0-9._-]/gi, "_") || "reference.png";
  const filePath = path.join(dir, `${version.versionNumber}-${safeName}`);
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
  store.assetReferences.push(reference);
  asset.status = "needs_review";
  asset.updatedAt = nowIso();
  return { version, reference };
}

export async function generateAssetReference(input: {
  projectId: string;
  assetId: string;
  providerSlug: "openai" | "stability";
}) {
  const store = getStore();
  const asset = store.assets.find((candidate) => candidate.id === input.assetId && candidate.projectId === input.projectId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  const adapter = input.providerSlug === "stability" ? new StabilityAdapter() : new OpenAIAdapter("mock");
  const job = createGenerationJob({
    projectId: input.projectId,
    type: "asset_reference",
    providerSlug: adapter.slug,
    modelId: input.providerSlug === "stability" ? "stable-image-core" : "gpt-image-1",
    inputPayload: { assetId: asset.id, assetName: asset.canonicalName, assetType: asset.type },
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
  const version = createAssetVersion(asset.id, { description: `Generated ${input.providerSlug} reference sheet.` });
  const dir = path.join(projectFolderPath(input.projectId, "assets"), asset.id);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${version.versionNumber}-${input.providerSlug}-reference.png`);
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
  store.assetReferences.push(reference);
  asset.status = "needs_review";
  job.status = "complete";
  job.outputPayload = { assetVersionId: version.id, referenceId: reference.id };
  job.completedAt = nowIso();
  return { version, reference, job };
}

export async function transitionAssetStatus(assetId: string, status: AssetStatus) {
  const store = getStore();
  const asset = store.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  if (asset.status === "locked" && status !== "locked") {
    asset.continuityNotes = `${asset.continuityNotes ?? ""}\nUnlocked after warning acknowledgement.`.trim();
  }
  const wasApproved = ["approved", "locked"].includes(asset.status);
  asset.status = status;
  asset.updatedAt = nowIso();
  if (wasApproved && !["approved", "locked"].includes(status)) {
    markFramesStaleForAsset(asset.projectId, asset.id);
  }
  refreshReadiness(asset.projectId);
  await persistAssetState(asset);
  await refreshPrismaReadiness(asset.projectId);
  return asset;
}

export function mergeAssets(sourceAssetId: string, targetAssetId: string) {
  const store = getStore();
  const source = store.assets.find((asset) => asset.id === sourceAssetId);
  const target = store.assets.find((asset) => asset.id === targetAssetId);
  if (!source || !target || source.projectId !== target.projectId) {
    throw new NotFoundError("Assets to merge were not found.");
  }
  store.sceneAssetRequirements.forEach((req) => {
    if (req.assetId === source.id) req.assetId = target.id;
  });
  store.shotAssetRequirements.forEach((req) => {
    if (req.assetId === source.id) req.assetId = target.id;
  });
  target.aliases = Array.from(new Set([...target.aliases, source.canonicalName, ...source.aliases]));
  source.status = "superseded";
  source.updatedAt = nowIso();
  refreshReadiness(target.projectId);
  return target;
}

export function splitAsset(assetId: string, input: { canonicalName: string; type?: AssetType }) {
  const store = getStore();
  const source = store.assets.find((asset) => asset.id === assetId);
  if (!source) {
    throw new NotFoundError("Asset not found.");
  }
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
  store.assets.push(asset);
  return asset;
}

export function updateProjectStyle(projectId: string, input: Partial<ProjectStyle>) {
  const style = getStore().projectStyles.find((candidate) => candidate.projectId === projectId);
  if (!style) {
    throw new NotFoundError("Project style not found.");
  }
  const wasLocked = style.approvalStatus === "locked";
  Object.assign(style, input, { updatedAt: nowIso() });
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

function refreshReadiness(projectId: string) {
  const store = getStore();
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
