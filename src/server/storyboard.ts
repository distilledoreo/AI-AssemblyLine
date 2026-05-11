import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OpenAIAdapter } from "@/providers/openai";
import { AppError, NotFoundError } from "@/server/errors";
import {
  completeGenerationJob,
  createGenerationJob,
  decryptProjectProviderKey,
  getProjectDashboard,
  getScriptAnalysisGraph,
  getScriptAnalysisGraphForProject,
  getStore,
  markGenerationJobRunning,
  persistFrameVersionState,
  persistGeneratedFrameVersion,
  persistReviewNoteState,
  persistStoryboardFrameState,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { composeStoryboardPrompt } from "@/server/promptEngine";
import { createId, nowIso } from "@/server/ids";
import { projectFolderPath } from "@/server/storage";
import type { FrameVersion, ReviewNote, StoryboardFrame } from "@/server/types";

async function openAiApiKeyForProject(projectId: string) {
  return decryptProjectProviderKey(projectId, "openai").catch(() => process.env.OPENAI_API_KEY || "mock");
}

export async function generateStoryboardFrame(input: {
  projectId: string;
  shotId: string;
  keyframeIndex?: number;
  userDirection?: string;
}) {
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const shot = graph.shots.find((candidate) => candidate.id === input.shotId);
  if (!shot) throw new NotFoundError("Shot not found.");
  if (shot.status !== "ready" && shot.status !== "storyboarded") {
    throw new AppError("Storyboard generation requires approved or locked shot assets.", 409, "shot_blocked");
  }
  const scene = graph.scenes.find((candidate) => candidate.id === shot.sceneId);
  if (!scene) throw new NotFoundError("Scene not found.");
  const keyframeIndex = input.keyframeIndex ?? 0;
  if (keyframeIndex < 0 || keyframeIndex > 8) {
    throw new AppError("Storyboard keyframes must be between 1 and 9.", 400, "bad_keyframe");
  }
  const job = createGenerationJob({
    projectId: input.projectId,
    type: "storyboard_frame",
    providerSlug: "openai",
    modelId: "gpt-image-1",
    inputPayload: {
      projectId: input.projectId,
      shotId: input.shotId,
      keyframeIndex,
      userDirection: input.userDirection,
    },
  });
  if (isRedisQueueEnabled()) {
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  return processStoryboardFrameJob({
    projectId: input.projectId,
    shotId: input.shotId,
    keyframeIndex,
    userDirection: input.userDirection,
    jobId: job.id,
  });
}

export async function processStoryboardFrameJob(input: {
  projectId: string;
  shotId: string;
  keyframeIndex: number;
  userDirection?: string;
  jobId: string;
}) {
  const store = getStore();
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const shot = graph.shots.find((candidate) => candidate.id === input.shotId);
  if (!shot) throw new NotFoundError("Shot not found.");
  if (shot.status !== "ready" && shot.status !== "storyboarded") {
    throw new AppError("Storyboard generation requires approved or locked shot assets.", 409, "shot_blocked");
  }
  const scene = graph.scenes.find((candidate) => candidate.id === shot.sceneId);
  if (!scene) throw new NotFoundError("Scene not found.");
  const job = await markGenerationJobRunning(input.jobId);
  if (!job) throw new NotFoundError("Generation job not found.");
  let frame =
    graph.storyboardFrames.find((candidate) => candidate.shotId === shot.id && candidate.keyframeIndex === input.keyframeIndex) ??
    store.storyboardFrames.find((candidate) => candidate.shotId === shot.id && candidate.keyframeIndex === input.keyframeIndex);
  const timestamp = nowIso();
  if (!frame) {
    frame = { id: createId(), shotId: shot.id, keyframeIndex: input.keyframeIndex, createdAt: timestamp, updatedAt: timestamp };
  }
  mirrorStoryboardFrameForLegacyState(frame);
  const requiredAssetIds = new Set(graph.shotAssetRequirements.filter((req) => req.shotId === shot.id).map((req) => req.assetId));
  const dashboard = await getProjectDashboard(input.projectId);
  const prompt = composeStoryboardPrompt({
    style: dashboard?.style ?? store.projectStyles.find((style) => style.projectId === input.projectId),
    scene,
    shot,
    assets: graph.assets.filter((asset) => requiredAssetIds.has(asset.id)),
    userDirection: input.userDirection,
  });
  const result = await new OpenAIAdapter(await openAiApiKeyForProject(input.projectId)).generateImage(prompt, {
    modelId: "gpt-image-1",
    width: 1024,
    height: 576,
    count: 1,
  });
  const versionNumber = nextFrameVersionNumber(frame.id, [...store.frameVersions, ...graph.frameVersions]);
  const dir = path.join(projectFolderPath(input.projectId, "storyboards"), shot.id);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `frame-${input.keyframeIndex + 1}-v${versionNumber}.png`);
  await writeFile(filePath, result.images[0].data);
  const version: FrameVersion = {
    id: createId(),
    frameId: frame.id,
    versionNumber,
    prompt: prompt.positivePrompt,
    filePath,
    thumbnailPath: filePath,
    status: "draft",
    isStale: false,
    generationJobId: job.id,
    createdAt: timestamp,
  };
  store.frameVersions.push(version);
  shot.status = "storyboarded";
  await persistGeneratedFrameVersion({ frame, version, shot });
  await completeGenerationJob(job.id, { status: "complete", outputPayload: { frameId: frame.id, frameVersionId: version.id } });
  return getScriptAnalysisGraphForProject(input.projectId);
}

export async function updateFrameVersion(input: {
  projectId: string;
  frameVersionId: string;
  status?: FrameVersion["status"];
  annotations?: Record<string, unknown>;
}) {
  const store = getStore();
  const version = store.frameVersions.find((candidate) => candidate.id === input.frameVersionId);
  if (!version) throw new NotFoundError("Frame version not found.");
  if (input.status === "approved") {
    store.frameVersions
      .filter((candidate) => candidate.frameId === version.frameId && candidate.status === "approved")
      .forEach((candidate) => {
        candidate.status = "superseded";
        store.clipVersions
          .filter((clipVersion) => clipVersion.sourceFrameVersionIds.includes(candidate.id))
          .forEach((clipVersion) => {
            clipVersion.status = "stale";
            clipVersion.isStale = true;
          });
      });
  }
  Object.assign(version, { status: input.status ?? version.status, annotations: input.annotations ?? version.annotations });
  await persistFrameVersionState(version);
  return getScriptAnalysisGraph(input.projectId);
}

export async function attachSketch(input: {
  projectId: string;
  shotId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}) {
  if (!["image/png", "image/jpeg", "image/webp", "image/tiff"].includes(input.mimeType)) {
    throw new AppError("Unsupported sketch format. Use PNG, JPEG, WebP, or TIFF.", 400, "unsupported_sketch");
  }
  const store = getStore();
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const shot = graph.shots.find((candidate) => candidate.id === input.shotId);
  if (!shot) throw new NotFoundError("Shot not found.");
  const timestamp = nowIso();
  let frame =
    graph.storyboardFrames.find((candidate) => candidate.shotId === input.shotId && candidate.keyframeIndex === 0) ??
    store.storyboardFrames.find((candidate) => candidate.shotId === input.shotId && candidate.keyframeIndex === 0);
  if (!frame) {
    frame = { id: createId(), shotId: input.shotId, keyframeIndex: 0, createdAt: timestamp, updatedAt: timestamp };
  }
  mirrorStoryboardFrameForLegacyState(frame);
  const dir = path.join(projectFolderPath(input.projectId, "storyboards"), input.shotId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `sketch-${input.fileName.replace(/[^a-z0-9._-]/gi, "_")}`);
  await writeFile(filePath, input.data);
  frame.sketchFilePath = filePath;
  frame.updatedAt = timestamp;
  await persistStoryboardFrameState(frame);
  return getScriptAnalysisGraphForProject(input.projectId);
}

export async function addFrameComment(input: {
  projectId: string;
  authorId: string;
  frameVersionId: string;
  body: string;
  parentNoteId?: string;
}) {
  const note: ReviewNote = {
    id: createId(),
    projectId: input.projectId,
    authorId: input.authorId,
    targetType: "frame_version",
    targetId: input.frameVersionId,
    parentNoteId: input.parentNoteId,
    body: input.body,
    status: "open",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().reviewNotes.push(note);
  await persistReviewNoteState(note);
  return note;
}

export function markFramesStaleForAsset(projectId: string, assetId: string) {
  const store = getStore();
  const graph = getScriptAnalysisGraph(projectId);
  const affectedShotIds = new Set(
    graph.shotAssetRequirements.filter((req) => req.assetId === assetId).map((req) => req.shotId),
  );
  const affectedFrameIds = new Set(
    store.storyboardFrames.filter((frame) => affectedShotIds.has(frame.shotId)).map((frame) => frame.id),
  );
  store.frameVersions
    .filter((version) => affectedFrameIds.has(version.frameId) && version.status === "approved")
    .forEach((version) => {
      version.status = "stale";
      version.isStale = true;
    });
}

function nextFrameVersionNumber(frameId: string, knownVersions: FrameVersion[]) {
  return knownVersions
    .filter((version) => version.frameId === frameId)
    .reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

function mirrorStoryboardFrameForLegacyState(frame: StoryboardFrame) {
  const store = getStore();
  if (!store.storyboardFrames.some((candidate) => candidate.id === frame.id)) {
    store.storyboardFrames.push(frame);
  }
}
