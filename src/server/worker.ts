import type { Job } from "bullmq";
import { createGenerationWorker, isRedisQueueEnabled } from "@/server/queue";
import { processScriptAnalysisJob } from "@/server/scriptAnalysis";

type WorkerJobData = {
  projectId?: string;
  scriptVersionId?: string;
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

export function startGenerationWorkers() {
  if (!isRedisQueueEnabled()) {
    return { started: false, workers: [] };
  }
  const workers = [createGenerationWorker("analysis", processAnalysisJob)].filter(Boolean);
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
