import type { Job, Processor } from "bullmq";
import { createGenerationWorker, isRedisQueueEnabled, scheduleProviderPollJob } from "@/server/queue";
import { processAssetReferenceJob } from "@/server/assetBible";
import { processExportProjectBundleJob, processImportProjectBundleJob } from "@/server/exportImport";
import { processMediaUtilityJob } from "@/server/media";
import { addJobEvent, completeGenerationJob, getGenerationJob } from "@/server/repository";
import { processScriptAnalysisJob } from "@/server/scriptAnalysis";
import { processStoryboardFrameJob } from "@/server/storyboard";
import { processSubmittedVideoProviderJobs, processVideoClipJob } from "@/server/video";
import type { ErrorClass, GenerationJobStatus } from "@/server/types";

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
  userId?: string;
  manifestPath?: string;
  sourceFilePath?: string;
  filePath?: string;
  outputFilePath?: string;
  outputPath?: string;
  seekSeconds?: number;
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

async function processVideoJob(job: Job<WorkerJobData & { providerSlug?: string }>) {
  if (job.name === "provider_poll") {
    return processSubmittedVideoProviderJobs();
  }
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

async function processProjectJob(job: Job<WorkerJobData>) {
  if (job.name === "export") {
    if (!job.data.projectId || !job.data.userId) {
      throw new Error("Export jobs require projectId and userId.");
    }
    return processExportProjectBundleJob({
      projectId: job.data.projectId,
      userId: job.data.userId,
      jobId: String(job.id),
    });
  }
  if (job.name === "import") {
    if (!job.data.projectId || !job.data.userId || !job.data.manifestPath) {
      throw new Error("Import jobs require projectId, userId, and manifestPath.");
    }
    return processImportProjectBundleJob({
      projectId: job.data.projectId,
      userId: job.data.userId,
      manifestPath: job.data.manifestPath,
      jobId: String(job.id),
    });
  }
  throw new Error(`Unsupported project job type: ${job.name}`);
}

async function processMediaJob(job: Job<WorkerJobData>) {
  if (job.name !== "thumbnail" && job.name !== "media_convert") {
    throw new Error(`Unsupported media job type: ${job.name}`);
  }
  const sourceFilePath = job.data.sourceFilePath ?? job.data.filePath;
  const outputFilePath = job.data.outputFilePath ?? job.data.outputPath;
  if (!job.data.projectId || !sourceFilePath) {
    throw new Error("Media utility jobs require projectId and sourceFilePath.");
  }
  return processMediaUtilityJob({
    jobId: String(job.id),
    projectId: job.data.projectId,
    type: job.name,
    sourceFilePath,
    outputFilePath,
    seekSeconds: job.data.seekSeconds,
  });
}

export async function startGenerationWorkers() {
  if (!isRedisQueueEnabled()) {
    return { started: false, workers: [] };
  }
  const workers = [
    createGenerationWorker("analysis", withFailurePersistence(processAnalysisJob)),
    createGenerationWorker("image", withFailurePersistence(processImageJob)),
    createGenerationWorker("video", withFailurePersistence(processVideoJob)),
    createGenerationWorker("media", withFailurePersistence(processMediaJob)),
    createGenerationWorker("project", withFailurePersistence(processProjectJob)),
  ].filter(Boolean);
  const providerPollSchedule = await scheduleProviderPollJob("video", Number(process.env.PROVIDER_POLL_INTERVAL_MS) || 15000);
  return { started: workers.length > 0, workers, providerPollSchedule };
}

function withFailurePersistence<T extends WorkerJobData>(processor: Processor<T>): Processor<T> {
  return async (job, token) => {
    try {
      return await processor(job, token);
    } catch (error) {
      await persistWorkerFailure(job, error);
      throw error;
    }
  };
}

async function persistWorkerFailure(job: Job<WorkerJobData>, error: unknown) {
  if (job.name === "provider_poll" || !job.id) {
    return;
  }
  const jobId = String(job.id);
  const existing = await getGenerationJob(jobId);
  if (existing && terminalStatuses.has(existing.status)) {
    return;
  }
  const projectId = job.data.projectId ?? existing?.projectId;
  if (!projectId) {
    return;
  }
  const message = error instanceof Error ? error.message : "Worker job failed.";
  const errorClass = classifyWorkerError(error);
  await completeGenerationJob(jobId, {
    status: "failed",
    errorMessage: message,
    errorClass,
    retryCount: retryCountForAttempt(job),
  });
  await addJobEvent({
    jobId,
    projectId,
    eventType: "status_change",
    message,
    progressPct: 100,
  });
}

const terminalStatuses = new Set<GenerationJobStatus>(["complete", "failed", "canceled"]);

function retryCountForAttempt(job: Job<WorkerJobData>) {
  return Math.max(1, Number(job.attemptsMade ?? 0) + 1);
}

function classifyWorkerError(error: unknown): ErrorClass {
  const errorClass = readErrorClass(error);
  if (errorClass) {
    return errorClass;
  }
  const status = readStatus(error);
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status && status >= 500 && status !== 501 && status !== 503) return "retriable";
  return "fatal";
}

function readErrorClass(error: unknown): ErrorClass | undefined {
  if (!error || typeof error !== "object" || !("errorClass" in error)) {
    return undefined;
  }
  const value = (error as { errorClass?: unknown }).errorClass;
  return value === "retriable" ||
    value === "fatal" ||
    value === "content_policy" ||
    value === "rate_limit" ||
    value === "timeout"
    ? value
    : undefined;
}

function readStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : undefined;
}

if (process.argv[1]?.endsWith("worker.ts")) {
  startGenerationWorkers()
    .then((result) => {
      if (!result.started) {
        console.warn("AI AssemblyLine workers did not start because Redis queue mode is disabled.");
      } else {
        console.log(`AI AssemblyLine workers started: ${result.workers.length}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
