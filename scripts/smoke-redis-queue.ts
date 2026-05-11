import { setTimeout as delay } from "node:timers/promises";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { GenerationJob, JobEvent } from "../src/server/types";

type SmokeCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
process.env.REDIS_URL = redisUrl;
process.env.QUEUE_MODE = "redis";

async function main() {
  await assertRedisReachable();
  const {
    closeQueueConnections,
    emitProjectEvent,
    getQueueHealthSnapshot,
    submitGenerationJob,
  } = await import("../src/server/queue");

  const checks: SmokeCheck[] = [];
  const projectId = `redis-smoke-project-${Date.now()}`;
  const jobId = `redis-smoke-job-${Date.now()}`;
  const generationJob: GenerationJob = {
    id: jobId,
    projectId,
    type: "script_analysis",
    status: "queued",
    inputPayload: { scriptVersionId: "redis-smoke-script-version" },
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  let unsubscribe: (() => void) | undefined;
  let cleanupQueue: Queue | undefined;
  let cleanupConnection: IORedis | undefined;
  let submittedSmokeJob = false;

  try {
    const submission = await submitGenerationJob(generationJob);
    checks.push({
      name: "BullMQ submission",
      ok: submission.submitted && submission.queueName === "assemblyline-analysis" && submission.bullJobId === jobId,
      detail: submission.submitted ? `${submission.queueName} accepted ${submission.bullJobId}` : "job was not submitted",
    });
    submittedSmokeJob = submission.submitted;

    const health = await getQueueHealthSnapshot();
    const analysisHealth = health.find((queue) => queue.name === "analysis");
    checks.push({
      name: "Redis queue health",
      ok: Boolean(analysisHealth?.redisBacked) && (analysisHealth?.waiting ?? 0) >= 1 && !analysisHealth?.healthError,
      detail: analysisHealth
        ? `redisBacked=${analysisHealth.redisBacked}, waiting=${analysisHealth.waiting}, failed=${analysisHealth.failed}`
        : "analysis queue missing from health snapshot",
    });

    const event = await receiveProjectEvent(projectId, async () => {
      await emitProjectEvent({
        projectId,
        jobId,
        eventType: "progress",
        message: "Redis pub/sub smoke event",
        progressPct: 42,
      });
    });
    unsubscribe = event.unsubscribe;
    checks.push({
      name: "Redis pub/sub project event",
      ok: event.received?.projectId === projectId && event.received.jobId === jobId && event.received.progressPct === 42,
      detail: event.received ? `${event.received.eventType} event delivered to ${projectId}` : "event was not delivered",
    });
  } finally {
    unsubscribe?.();
    if (submittedSmokeJob) {
      cleanupConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      cleanupQueue = new Queue("assemblyline-analysis", { connection: cleanupConnection });
      const queuedSmokeJob = await cleanupQueue.getJob(jobId);
      await queuedSmokeJob?.remove();
      await cleanupQueue.close();
      cleanupConnection.disconnect();
    }
    await closeQueueConnections();
  }

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    console.error(`Redis queue smoke failed with ${failures.length} blocker(s).`);
    process.exitCode = 1;
  }
}

async function assertRedisReachable() {
  const redis = new IORedis(redisUrl, {
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  try {
    await redis.ping();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Redis ping failed.";
    throw new Error(`Redis is not reachable at ${redisUrl}: ${detail}`);
  } finally {
    redis.disconnect();
  }
}

async function receiveProjectEvent(projectId: string, publish: () => Promise<void>) {
  const { subscribeToProjectEvents } = await import("../src/server/queue");
  let unsubscribe: (() => void) | undefined;
  const received = new Promise<JobEvent | undefined>((resolve) => {
    unsubscribe = subscribeToProjectEvents(
      projectId,
      (event) => resolve(event),
      (error) => {
        console.error(error);
        resolve(undefined);
      },
    );
  });

  await delay(250);
  await publish();
  const timed = await Promise.race([received, delay(5000).then(() => undefined)]);
  return { received: timed, unsubscribe };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
