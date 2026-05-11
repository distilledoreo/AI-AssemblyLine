import pino from "pino";
import { getQueueHealthSnapshot } from "@/server/queue";
import { getScriptAnalysisGraphForProject } from "@/server/repository";
import type { GenerationJob } from "@/server/types";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function captureError(error: unknown, context: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  logger.error({ ...context, sentryEnabled: Boolean(process.env.SENTRY_DSN), err: message }, message);
  return { sentryEnabled: Boolean(process.env.SENTRY_DSN), message };
}

export async function getProjectJobMetrics(projectId: string) {
  const graph = await getScriptAnalysisGraphForProject(projectId);
  const jobsByType = graph.jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.type] = (acc[job.type] ?? 0) + 1;
    return acc;
  }, {});
  const jobsByStatus = graph.jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});
  const completed = graph.jobs.filter((job): job is GenerationJob & { completedAt: string } => Boolean(job.completedAt));
  const totalRetries = graph.jobs.reduce((sum, job) => sum + job.retryCount, 0);
  const retriedJobs = graph.jobs.filter((job) => job.retryCount > 0);
  const retriesByType = graph.jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.type] = (acc[job.type] ?? 0) + job.retryCount;
    return acc;
  }, {});
  const averageDurationMs = completed.length
    ? Math.round(
        completed.reduce((sum, job) => sum + (new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()), 0) /
          completed.length,
      )
    : 0;

  return {
    projectId,
    totalJobs: graph.jobs.length,
    jobsByType,
    jobsByStatus,
    totalRetries,
    retriedJobs: retriedJobs.length,
    retriesByType,
    averageDurationMs,
    queueHealth: await getQueueHealthSnapshot(),
    sentryEnabled: Boolean(process.env.SENTRY_DSN),
  };
}
