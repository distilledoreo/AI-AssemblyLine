import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KlingAdapter, RunwayAdapter } from "@/providers/videoProviders";
import { AppError, NotFoundError } from "@/server/errors";
import {
  completeGenerationJob,
  createGenerationJob,
  getClipVersionById,
  getScriptAnalysisGraphForProject,
  getStore,
  getVideoClipForScene,
  getVideoClipForShot,
  markGenerationJobProviderSubmitted,
  markGenerationJobRunning,
  persistClipVersionState,
  persistGeneratedClipVersion,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { inspectClip } from "@/server/media";
import { createId, nowIso } from "@/server/ids";
import { projectFolderPath } from "@/server/storage";
import { resolveRunwayApiKeyForProject } from "@/server/providerKeys";
import type { ClipVersion, ScriptAnalysisGraph, VideoClip } from "@/server/types";

export async function generateVideoClip(input: {
  projectId: string;
  mode: "shot" | "scene";
  shotId?: string;
  sceneId?: string;
  providerSlug?: "runway" | "kling";
}) {
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const frameVersions =
    input.mode === "shot"
      ? approvedFrameVersionsForShot(graph, input.shotId)
      : approvedFrameVersionsForScene(graph, input.sceneId);
  if (frameVersions.length === 0) {
    throw new AppError("Video generation requires approved storyboard frames.", 409, "missing_approved_frames");
  }
  const adapter = input.providerSlug === "kling" ? new KlingAdapter() : new RunwayAdapter(await resolveRunwayApiKeyForProject(input.projectId));
  const prompt = composeVideoPrompt(input.mode, graph, input.shotId, input.sceneId);
  const job = createGenerationJob({
    projectId: input.projectId,
    type: "video_clip",
    providerSlug: adapter.slug,
    modelId: adapter.getCapabilities().models[0],
    inputPayload: {
      projectId: input.projectId,
      mode: input.mode,
      shotId: input.shotId,
      sceneId: input.sceneId,
      providerSlug: input.providerSlug ?? "runway",
      prompt,
      sourceFrameVersionIds: frameVersions.map((version) => version.id),
      polling: { intervalSeconds: 15, maxAttempts: 120 },
    },
  });
  if (isRedisQueueEnabled()) {
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  return processVideoClipJob({
    projectId: input.projectId,
    mode: input.mode,
    shotId: input.shotId,
    sceneId: input.sceneId,
    providerSlug: input.providerSlug ?? "runway",
    jobId: job.id,
  });
}

export async function processVideoClipJob(input: {
  projectId: string;
  mode: "shot" | "scene";
  shotId?: string;
  sceneId?: string;
  providerSlug: "runway" | "kling";
  jobId: string;
}) {
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const store = getStore();
  const frameVersions =
    input.mode === "shot"
      ? approvedFrameVersionsForShot(graph, input.shotId)
      : approvedFrameVersionsForScene(graph, input.sceneId);
  if (frameVersions.length === 0) {
    throw new AppError("Video generation requires approved storyboard frames.", 409, "missing_approved_frames");
  }
  const adapter = input.providerSlug === "kling" ? new KlingAdapter() : new RunwayAdapter(await resolveRunwayApiKeyForProject(input.projectId));
  const prompt = composeVideoPrompt(input.mode, graph, input.shotId, input.sceneId);
  const job = await markGenerationJobRunning(input.jobId, "polling");
  if (!job) throw new NotFoundError("Generation job not found.");
  const result = await adapter.generateVideo(
    {
      positivePrompt: prompt,
      negativePrompt: "continuity breaks, off-model assets, flicker",
      referenceImages: [],
      generationSettings: { width: 1024, height: 576, duration: input.mode === "scene" ? frameVersions.length * 3 : 3 },
      metadata: { sourceIds: frameVersions.map((version) => version.id), conflictWarnings: [], truncationWarnings: [] },
    },
    { modelId: job.modelId ?? "video-model", width: 1024, height: 576, durationSeconds: 3 },
  );
  if (result.isAsync && result.providerJobId && !result.video) {
    markGenerationJobProviderSubmitted(job.id, {
      providerJobId: result.providerJobId,
      outputPayload: {
        providerJobId: result.providerJobId,
        sourceFrameVersionIds: frameVersions.map((frame) => frame.id),
        prompt,
      },
    });
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  let clip =
    input.mode === "shot" && input.shotId
      ? await getVideoClipForShot(input.shotId)
      : input.mode === "scene" && input.sceneId
        ? await getVideoClipForScene(input.sceneId)
        : undefined;
  const timestamp = nowIso();
  if (!clip) {
    clip = { id: createId(), shotId: input.shotId, sceneId: input.sceneId, createdAt: timestamp, updatedAt: timestamp };
  } else {
    clip.updatedAt = timestamp;
  }
  if (!store.videoClips.some((candidate) => candidate.id === clip.id)) {
    store.videoClips.push(clip);
  }
  const dir = path.join(projectFolderPath(input.projectId, "videos"), clip.id);
  await mkdir(dir, { recursive: true });
  const knownClipVersions = [
    ...store.clipVersions.filter((version) => version.clipId === clip.id),
    ...graph.clipVersions.filter((version) => version.clipId === clip.id),
  ];
  const versionNumber = knownClipVersions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  const filePath = path.join(dir, `clip-v${versionNumber}.mp4`);
  await writeFile(filePath, result.video?.data ?? Buffer.from("mock-video"));
  const info = await inspectClip(filePath);
  const version: ClipVersion = {
    id: createId(),
    clipId: clip.id,
    versionNumber,
    prompt,
    filePath,
    thumbnailPath: filePath,
    durationMs: info.durationMs,
    status: "draft",
    isStale: false,
    sourceFrameVersionIds: frameVersions.map((frame) => frame.id),
    generationJobId: job.id,
    createdAt: timestamp,
  };
  store.clipVersions.push(version);
  await persistGeneratedClipVersion({ clip, version });
  await completeGenerationJob(job.id, { status: "complete", outputPayload: { clipId: clip.id, clipVersionId: version.id, media: info } });
  return getScriptAnalysisGraphForProject(input.projectId);
}

export async function updateClipVersion(input: { projectId: string; clipVersionId: string; status: ClipVersion["status"] }) {
  const version = await getClipVersionById(input.clipVersionId);
  if (!version) throw new NotFoundError("Clip version not found.");
  mirrorClipVersionForLegacyState(version);
  const store = getStore();
  if (input.status === "approved") {
    store.clipVersions
      .filter((candidate) => candidate.clipId === version.clipId && candidate.status === "approved")
      .forEach((candidate) => {
        candidate.status = "superseded";
      });
  }
  version.status = input.status;
  await persistClipVersionState(version);
  return getScriptAnalysisGraphForProject(input.projectId);
}

function mirrorClipVersionForLegacyState(version: ClipVersion) {
  const store = getStore();
  if (!store.clipVersions.some((candidate) => candidate.id === version.id)) {
    store.clipVersions.push(version);
  }
}

function approvedFrameVersionsForShot(graph: ScriptAnalysisGraph, shotId?: string) {
  const frameIds = new Set(graph.storyboardFrames.filter((frame) => frame.shotId === shotId).map((frame) => frame.id));
  return graph.frameVersions.filter((version) => frameIds.has(version.frameId) && version.status === "approved");
}

function approvedFrameVersionsForScene(graph: ScriptAnalysisGraph, sceneId?: string) {
  const shotIds = new Set(graph.shots.filter((shot) => shot.sceneId === sceneId).map((shot) => shot.id));
  const frameIds = new Set(graph.storyboardFrames.filter((frame) => shotIds.has(frame.shotId)).map((frame) => frame.id));
  return graph.frameVersions.filter((version) => frameIds.has(version.frameId) && version.status === "approved");
}

function composeVideoPrompt(
  mode: "shot" | "scene",
  graph: ScriptAnalysisGraph,
  shotId?: string,
  sceneId?: string,
) {
  if (mode === "shot") {
    const shot = graph.shots.find((candidate) => candidate.id === shotId);
    return `Shot-by-shot video clip. Action: ${shot?.action ?? ""}. Camera: ${shot?.cameraMovement ?? ""}.`;
  }
  const scene = graph.scenes.find((candidate) => candidate.id === sceneId);
  const shots = graph.shots.filter((shot) => shot.sceneId === sceneId).map((shot) => shot.action).join(" ");
  return `Scene-level video clip. Scene: ${scene?.summary ?? ""}. Shots in order: ${shots}`;
}
