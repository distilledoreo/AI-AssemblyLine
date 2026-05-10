import type { Job } from "bullmq";
import { createGenerationWorker, isRedisQueueEnabled } from "@/server/queue";
import { processAssetReferenceJob } from "@/server/assetBible";
import { processScriptAnalysisJob } from "@/server/scriptAnalysis";
import { processStoryboardFrameJob } from "@/server/storyboard";
import { processVideoClipJob } from "@/server/video";

type WorkerJobData = {
  projectId?: string;
  scriptVersionId?: string;
  assetId?: string;
  providerSlug?: "openai" | "stability";
  shotId?: string;
  keyframeIndex?: number;
  userDirection?: string;
  mode?: "shot" | "scene";
  sceneId?: string;
};

async function processAnalysisJob(job: Job<WorkerJobData>) {
  if (job.name !== "script_analysis") {
    throw new Error(`Unsupported analysis job type: ${job.name}`);
  }
  if (!job.data.projectId || !job.data.scriptVersionId) {
    throw new Error("Script analysis jobs require projectId and scriptVersionId.");
  }
  return processScriptAnalysisJob({
    projectId: job.data.projectId,
    scriptVersionId: job.data.scriptVersionId,
    jobId: String(job.id),
  });
}

async function processImageJob(job: Job<WorkerJobData>) {
  if (job.name === "asset_reference") {
    if (!job.data.projectId || !job.data.assetId || !job.data.providerSlug) {
      throw new Error("Asset reference jobs require projectId, assetId, and providerSlug.");
    }
    return processAssetReferenceJob({
      projectId: job.data.projectId,
      assetId: job.data.assetId,
      providerSlug: job.data.providerSlug,
      jobId: String(job.id),
    });
  }
  if (job.name === "storyboard_frame") {
    if (!job.data.projectId || !job.data.shotId || typeof job.data.keyframeIndex !== "number") {
      throw new Error("Storyboard frame jobs require projectId, shotId, and keyframeIndex.");
    }
    return processStoryboardFrameJob({
      projectId: job.data.projectId,
      shotId: job.data.shotId,
      keyframeIndex: job.data.keyframeIndex,
      userDirection: job.data.userDirection,
      jobId: String(job.id),
    });
  }
  throw new Error(`Unsupported image job type: ${job.name}`);
}

async function processVideoJob(job: Job<WorkerJobData & { providerSlug?: "runway" | "kling" }>) {
  if (job.name !== "video_clip") {
    throw new Error(`Unsupported video job type: ${job.name}`);
  }
  if (!job.data.projectId || !job.data.mode || !job.data.providerSlug) {
    throw new Error("Video clip jobs require projectId, mode, and providerSlug.");
  }
  return processVideoClipJob({
    projectId: job.data.projectId,
    mode: job.data.mode,
    shotId: job.data.shotId,
    sceneId: job.data.sceneId,
    providerSlug: job.data.providerSlug,
    jobId: String(job.id),
  });
}

export function startGenerationWorkers() {
  if (!isRedisQueueEnabled()) {
    return { started: false, workers: [] };
  }
  const workers = [
    createGenerationWorker("analysis", processAnalysisJob),
    createGenerationWorker("image", processImageJob),
    createGenerationWorker("video", processVideoJob),
  ].filter(Boolean);
  return { started: workers.length > 0, workers };
}

if (process.argv[1]?.endsWith("worker.ts")) {
  const result = startGenerationWorkers();
  if (!result.started) {
    console.warn("AI AssemblyLine workers did not start because Redis queue mode is disabled.");
  } else {
    console.log(`AI AssemblyLine workers started: ${result.workers.length}`);
  }
}
