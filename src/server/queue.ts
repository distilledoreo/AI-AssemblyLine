import { Queue, Worker, type Job as BullJob, type Processor } from "bullmq";
import IORedis from "ioredis";
import { getConfig } from "@/lib/config";
import type { ErrorClass, GenerationJob, GenerationJobType, JobEvent } from "@/server/types";
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
const queues = new Map<string, Queue>();
let redisConnection: IORedis | undefined;
let redisPublisher: IORedis | undefined;

export function isRedisQueueEnabled() {
  if (process.env.NODE_ENV === "test" || process.env.QUEUE_MODE === "inline") {
    return false;
  }
  if (process.env.QUEUE_MODE === "redis" || process.env.NODE_ENV === "production") {
    return true;
  }
  return Boolean(process.env.REDIS_URL);
}

function getRedisConnection() {
  if (!isRedisQueueEnabled()) {
    return undefined;
  }
  redisConnection ??= new IORedis(getConfig().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return redisConnection;
}

function getRedisPublisher() {
  if (!isRedisQueueEnabled()) {
    return undefined;
  }
  redisPublisher ??= new IORedis(getConfig().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return redisPublisher;
}

function queueNameForJobType(type: GenerationJobType) {
  const match = Object.entries(queueTopology).find(([, config]) => (config.jobTypes as readonly GenerationJobType[]).includes(type));
  return match?.[0] ?? "project";
}

function getBullQueue(name: string) {
  const connection = getRedisConnection();
  if (!connection) {
    return undefined;
  }
  const existing = queues.get(name);
  if (existing) {
    return existing;
  }
  const queue = new Queue(`assemblyline-${name}`, { connection });
  queues.set(name, queue);
  return queue;
}

export function subscribeToProjectEvents(projectId: string, listener: Listener) {
  const projectListeners = listeners.get(projectId) ?? new Set<Listener>();
  projectListeners.add(listener);
  listeners.set(projectId, projectListeners);

  const subscriber = isRedisQueueEnabled() ? new IORedis(getConfig().REDIS_URL, { maxRetriesPerRequest: null }) : undefined;
  if (subscriber) {
    const channel = projectEventChannel(projectId);
    subscriber.subscribe(channel).catch(() => undefined);
    subscriber.on("message", (messageChannel, payload) => {
      if (messageChannel !== channel) {
        return;
      }
      try {
        listener(JSON.parse(payload) as JobEvent);
      } catch {
        // Ignore malformed events from outside this app.
      }
    });
  }

  return () => {
    projectListeners.delete(listener);
    if (projectListeners.size === 0) {
      listeners.delete(projectId);
    }
    subscriber?.disconnect();
  };
}

export function emitProjectEvent(event: Omit<JobEvent, "id" | "createdAt"> & { createdAt?: string }) {
  const fullEvent: JobEvent = {
    ...event,
    id: createId(),
    createdAt: event.createdAt ?? nowIso(),
  };
  listeners.get(fullEvent.projectId)?.forEach((listener) => listener(fullEvent));
  getRedisPublisher()?.publish(projectEventChannel(fullEvent.projectId), JSON.stringify(fullEvent)).catch(() => undefined);
  return fullEvent;
}

export async function submitGenerationJob(job: GenerationJob) {
  const queue = getBullQueue(queueNameForJobType(job.type));
  if (!queue) {
    return { submitted: false, queueName: queueNameForJobType(job.type), bullJobId: undefined };
  }
  const policy = retryPolicy[job.errorClass ?? "retriable"];
  const bullJob = await queue.add(job.type, job.inputPayload, {
    jobId: job.id,
    attempts: policy.maxRetries + 1,
    backoff: toBullBackoff(policy.backoff),
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  });
  return { submitted: true, queueName: queue.name, bullJobId: String(bullJob.id) };
}

export function createGenerationWorker(queueName: keyof typeof queueTopology, processor: Processor) {
  const connection = getRedisConnection();
  if (!connection) {
    return undefined;
  }
  return new Worker(`assemblyline-${queueName}`, processor, {
    connection,
    concurrency: Number(process.env[`${queueName.toUpperCase()}_QUEUE_CONCURRENCY`]) || queueTopology[queueName].defaultConcurrency,
  });
}

export async function scheduleProviderPollJob(queueName: keyof typeof queueTopology, intervalMs = 15000) {
  const queue = getBullQueue(queueName);
  if (!queue) {
    return { scheduled: false, queueName };
  }
  await queue.add(
    "provider_poll",
    { queueName },
    {
      jobId: `${queueName}-provider-poll`,
      repeat: { every: intervalMs },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );
  return { scheduled: true, queueName: queue.name };
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

export async function getQueueHealthSnapshot() {
  return Promise.all(
    Object.entries(queueTopology).map(async ([name, config]) => {
      const queue = getBullQueue(name);
      const counts = queue
        ? await queue
            .getJobCounts("active", "waiting", "delayed", "failed", "completed")
            .catch(() => ({ active: 0, waiting: 0, delayed: 0, failed: 0, completed: 0 }))
        : { active: 0, waiting: 0, delayed: 0, failed: 0, completed: 0 };
      const latestFailures = queue ? await getRecentFailedJobs(queue) : [];
      return {
        name,
        jobTypes: config.jobTypes,
        concurrency: Number(process.env[`${name.toUpperCase()}_QUEUE_CONCURRENCY`]) || config.defaultConcurrency,
        active: counts.active,
        waiting: counts.waiting,
        delayed: counts.delayed,
        failed: counts.failed,
        completed: counts.completed,
        latestFailures,
        redisBacked: Boolean(queue),
      };
    }),
  );
}

async function getRecentFailedJobs(queue: Queue) {
  const failedJobs = await queue.getJobs(["failed"], 0, 9, false).catch(() => [] as BullJob[]);
  return failedJobs.map((job) => ({
    id: String(job.id),
    name: job.name,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
  }));
}

function projectEventChannel(projectId: string) {
  return `project:${projectId}:events`;
}

function toBullBackoff(backoff: string) {
  if (backoff.startsWith("exponential")) {
    return { type: "exponential", delay: 30000 };
  }
  if (backoff.startsWith("fixed")) {
    return { type: "fixed", delay: 60000 };
  }
  return undefined;
}
