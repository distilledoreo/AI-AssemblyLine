import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KlingAdapter, RunwayAdapter } from "@/providers/videoProviders";
import { AppError, NotFoundError } from "@/server/errors";
import {
  addJobEvent,
  completeGenerationJob,
  createGenerationJob,
  getClipVersionById,
  getGenerationJob,
  getScriptAnalysisGraphForProject,
  getVideoClipForScene,
  getVideoClipForShot,
  listSubmittedProviderJobs,
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
import type { ClipVersion, GenerationJob, ScriptAnalysisGraph, VideoClip } from "@/server/types";

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
  const job = await createGenerationJob({
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
    await markGenerationJobProviderSubmitted(job.id, {
      providerJobId: result.providerJobId,
      outputPayload: {
        providerJobId: result.providerJobId,
        sourceFrameVersionIds: frameVersions.map((frame) => frame.id),
        prompt,
      },
    });
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  return persistVideoClipBytes({
    projectId: input.projectId,
    mode: input.mode,
    shotId: input.shotId,
    sceneId: input.sceneId,
    graph,
    job,
    prompt,
    sourceFrameVersionIds: frameVersions.map((frame) => frame.id),
    data: result.video?.data ?? Buffer.from("mock-video"),
    mimeType: result.video?.mimeType ?? "video/mp4",
  });
}

export async function processVideoProviderResult(input: {
  projectId: string;
  jobId: string;
  fetchImpl?: typeof fetch;
}) {
  const job = await getGenerationJob(input.jobId);
  if (!job) {
    throw new NotFoundError("Generation job not found.");
  }
  if (job.type !== "video_clip" || job.providerSlug !== "runway" || !job.providerJobId) {
    throw new AppError("Only submitted Runway video jobs can be polled.", 400, "unsupported_provider_poll");
  }

  const adapter = new RunwayAdapter(await resolveRunwayApiKeyForProject(input.projectId), input.fetchImpl ?? fetch);
  const status = await adapter.checkJobStatus(job.providerJobId);
  if (status.status === "pending" || status.status === "processing") {
    await markGenerationJobRunning(input.jobId, "polling");
    await addJobEvent({
      jobId: job.id,
      projectId: input.projectId,
      eventType: "progress",
      message: "Runway video task is still processing.",
      progressPct: status.progress ?? 50,
    });
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  if (status.status === "failed") {
    await completeGenerationJob(job.id, { status: "failed", errorMessage: status.error ?? "Runway video task failed." });
    await addJobEvent({
      jobId: job.id,
      projectId: input.projectId,
      eventType: "status_change",
      message: status.error ?? "Runway video task failed.",
      progressPct: 100,
    });
    return getScriptAnalysisGraphForProject(input.projectId);
  }
  if (!status.resultUrl) {
    throw new AppError("Runway task completed without an output URL.", 502, "provider_output_missing");
  }

  await markGenerationJobRunning(input.jobId, "processing_output");
  const output = await (input.fetchImpl ?? fetch)(status.resultUrl, { signal: AbortSignal.timeout(120000) });
  if (!output.ok) {
    throw new AppError(`Runway output download failed with status ${output.status}.`, 502, "provider_output_download_failed");
  }
  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const payload = normalizeVideoJobPayload(job);
  return persistVideoClipBytes({
    projectId: input.projectId,
    mode: payload.mode,
    shotId: payload.shotId,
    sceneId: payload.sceneId,
    graph,
    job,
    prompt: payload.prompt ?? composeVideoPrompt(payload.mode, graph, payload.shotId, payload.sceneId),
    sourceFrameVersionIds: payload.sourceFrameVersionIds,
    data: Buffer.from(await output.arrayBuffer()),
    mimeType: output.headers.get("content-type")?.split(";")[0] || "video/mp4",
  });
}

export async function processSubmittedVideoProviderJobs(input: { fetchImpl?: typeof fetch } = {}) {
  const jobs = await listSubmittedProviderJobs({ type: "video_clip", providerSlug: "runway" });
  const results = [];
  for (const job of jobs) {
    results.push(
      await processVideoProviderResult({
        projectId: job.projectId,
        jobId: job.id,
        fetchImpl: input.fetchImpl,
      }),
    );
  }
  return { processed: jobs.length, results };
}

async function persistVideoClipBytes(input: {
  projectId: string;
  mode: "shot" | "scene";
  shotId?: string;
  sceneId?: string;
  graph: ScriptAnalysisGraph;
  job: GenerationJob;
  prompt: string;
  sourceFrameVersionIds: string[];
  data: Buffer;
  mimeType: string;
}) {
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
  const dir = path.join(projectFolderPath(input.projectId, "videos"), clip.id);
  await mkdir(dir, { recursive: true });
  const knownClipVersions = input.graph.clipVersions.filter((version) => version.clipId === clip.id);
  const versionNumber = knownClipVersions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  const filePath = path.join(dir, `clip-v${versionNumber}.mp4`);
  await writeFile(filePath, input.data);
  const info = await inspectClip(filePath);
  const version: ClipVersion = {
    id: createId(),
    clipId: clip.id,
    versionNumber,
    prompt: input.prompt,
    filePath,
    thumbnailPath: filePath,
    durationMs: info.durationMs,
    status: "draft",
    isStale: false,
    sourceFrameVersionIds: input.sourceFrameVersionIds,
    generationJobId: input.job.id,
    createdAt: timestamp,
  };
  await persistGeneratedClipVersion({ clip, version });
  await completeGenerationJob(input.job.id, {
    status: "complete",
    outputPayload: { clipId: clip.id, clipVersionId: version.id, media: info, mimeType: input.mimeType },
  });
  return getScriptAnalysisGraphForProject(input.projectId);
}

export async function updateClipVersion(input: { projectId: string; clipVersionId: string; status: ClipVersion["status"] }) {
  const version = await getClipVersionById(input.clipVersionId);
  if (!version) throw new NotFoundError("Clip version not found.");
  version.status = input.status;
  await persistClipVersionState(version);
  return getScriptAnalysisGraphForProject(input.projectId);
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

function normalizeVideoJobPayload(job: GenerationJob): {
  mode: "shot" | "scene";
  shotId?: string;
  sceneId?: string;
  prompt?: string;
  sourceFrameVersionIds: string[];
} {
  const payload = job.inputPayload && typeof job.inputPayload === "object" ? (job.inputPayload as Record<string, unknown>) : {};
  const output = job.outputPayload && typeof job.outputPayload === "object" ? (job.outputPayload as Record<string, unknown>) : {};
  const mode = payload.mode === "scene" ? "scene" : "shot";
  const sourceFrameVersionIds = Array.isArray(output.sourceFrameVersionIds)
    ? output.sourceFrameVersionIds.map(String)
    : Array.isArray(payload.sourceFrameVersionIds)
      ? payload.sourceFrameVersionIds.map(String)
      : [];
  return {
    mode,
    shotId: typeof payload.shotId === "string" ? payload.shotId : undefined,
    sceneId: typeof payload.sceneId === "string" ? payload.sceneId : undefined,
    prompt: typeof output.prompt === "string" ? output.prompt : typeof payload.prompt === "string" ? payload.prompt : undefined,
    sourceFrameVersionIds,
  };
}
