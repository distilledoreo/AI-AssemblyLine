import type { Job } from "bullmq";
import { createGenerationWorker, isRedisQueueEnabled } from "@/server/queue";
import { processAssetReferenceJob } from "@/server/assetBible";
import { processScriptAnalysisJob } from "@/server/scriptAnalysis";

type WorkerJobData = {
  projectId?: string;
  scriptVersionId?: string;
  assetId?: string;
  providerSlug?: "openai" | "stability";
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
  if (job.name !== "asset_reference") {
    throw new Error(`Unsupported image job type: ${job.name}`);
  }
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

export function startGenerationWorkers() {
  if (!isRedisQueueEnabled()) {
    return { started: false, workers: [] };
  }
  const workers = [
    createGenerationWorker("analysis", processAnalysisJob),
    createGenerationWorker("image", processImageJob),
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
