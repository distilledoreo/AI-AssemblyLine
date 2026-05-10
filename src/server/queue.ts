import type { ErrorClass, GenerationJobType, JobEvent } from "@/server/types";
import { createId, nowIso } from "@/server/ids";

export const queueTopology = {
  analysis: { jobTypes: ["script_analysis"], defaultConcurrency: 2 },
  image: { jobTypes: ["asset_reference", "storyboard_frame"], defaultConcurrency: 3 },
  video: { jobTypes: ["video_clip"], defaultConcurrency: 2 },
  media: { jobTypes: ["thumbnail", "media_convert"], defaultConcurrency: 4 },
  project: { jobTypes: ["export", "import"], defaultConcurrency: 1 },
} as const satisfies Record<
  string,
  { jobTypes: GenerationJobType[]; defaultConcurrency: number }
>;

export const retryPolicy: Record<ErrorClass, { maxRetries: number; backoff: string }> = {
  retriable: { maxRetries: 3, backoff: "exponential:30s,2m,8m" },
  rate_limit: { maxRetries: 5, backoff: "exponential:60s,5m,20m,60m,120m" },
  timeout: { maxRetries: 2, backoff: "fixed:60s" },
  content_policy: { maxRetries: 0, backoff: "none" },
  fatal: { maxRetries: 0, backoff: "none" },
};

type Listener = (event: JobEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeToProjectEvents(projectId: string, listener: Listener) {
  const projectListeners = listeners.get(projectId) ?? new Set<Listener>();
  projectListeners.add(listener);
  listeners.set(projectId, projectListeners);

  return () => {
    projectListeners.delete(listener);
    if (projectListeners.size === 0) {
      listeners.delete(projectId);
    }
  };
}

export function emitProjectEvent(event: Omit<JobEvent, "id" | "createdAt"> & { createdAt?: string }) {
  const fullEvent: JobEvent = {
    ...event,
    id: createId(),
    createdAt: event.createdAt ?? nowIso(),
  };
  listeners.get(fullEvent.projectId)?.forEach((listener) => listener(fullEvent));
  return fullEvent;
}

export function formatSseEvent(event: JobEvent) {
  return [
    `id: ${event.id}`,
    `event: ${event.eventType}`,
    `data: ${JSON.stringify({
      jobId: event.jobId,
      eventType: event.eventType,
      message: event.message,
      progressPct: event.progressPct,
      timestamp: event.createdAt,
    })}`,
    "",
    "",
  ].join("\n");
}

export function formatHeartbeat() {
  return `event: heartbeat\ndata: ${JSON.stringify({ timestamp: nowIso() })}\n\n`;
}

export function getQueueHealthSnapshot() {
  return Object.entries(queueTopology).map(([name, config]) => ({
    name,
    jobTypes: config.jobTypes,
    concurrency: Number(process.env[`${name.toUpperCase()}_QUEUE_CONCURRENCY`]) || config.defaultConcurrency,
    active: 0,
    waiting: 0,
    failed: 0,
  }));
}
