import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const redisInstances = vi.hoisted(() => [] as Array<{
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>);

const queueInstances = vi.hoisted(() => [] as Array<{
  name: string;
  add: ReturnType<typeof vi.fn>;
  getJobCounts: ReturnType<typeof vi.fn>;
}>);

const RedisConstructorMock = vi.hoisted(() =>
  vi.fn(function Redis() {
    const instance = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    redisInstances.push(instance);
    return instance;
  }),
);

const QueueConstructorMock = vi.hoisted(() =>
  vi.fn(function Queue(name: string) {
    const instance = {
      name,
      add: vi.fn().mockResolvedValue({ id: "bull-job-1" }),
      getJobCounts: vi.fn().mockResolvedValue({ active: 0, waiting: 1, failed: 0 }),
    };
    queueInstances.push(instance);
    return instance;
  }),
);

vi.mock("ioredis", () => ({ default: RedisConstructorMock }));
vi.mock("bullmq", () => ({ Queue: QueueConstructorMock, Worker: vi.fn() }));

const generationJob = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  type: "script_analysis" as const,
  status: "queued" as const,
  inputPayload: { scriptVersionId: "33333333-3333-4333-8333-333333333333" },
  retryCount: 0,
  createdAt: "2026-05-10T04:00:00.000Z",
};

async function importQueueModule() {
  return import("@/server/queue");
}

describe("queue and SSE foundation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
    redisInstances.length = 0;
    queueInstances.length = 0;
    resetConfigForTests();
  });

  it("defines the roadmap queue topology and retry policy", async () => {
    const { getQueueHealthSnapshot, retryPolicy } = await importQueueModule();
    const queues = await getQueueHealthSnapshot();
    expect(queues.map((queue) => queue.name)).toEqual(["analysis", "image", "video", "media", "project"]);
    expect(retryPolicy.rate_limit.maxRetries).toBe(5);
    expect(retryPolicy.content_policy.maxRetries).toBe(0);
    expect(queues.every((queue) => queue.redisBacked === false)).toBe(true);
  });

  it("formats project job events as server-sent events", async () => {
    const { formatSseEvent } = await importQueueModule();
    const payload = formatSseEvent({
      id: "event-1",
      projectId: "project-1",
      jobId: "job-1",
      eventType: "progress",
      message: "Halfway",
      progressPct: 50,
      createdAt: "2026-05-10T04:00:00.000Z",
    });

    expect(payload).toContain("id: event-1");
    expect(payload).toContain("event: progress");
    expect(payload).toContain('"progressPct":50');
  });

  it("does not open Redis sockets in test mode when submitting jobs", async () => {
    const { submitGenerationJob } = await importQueueModule();
    const result = await submitGenerationJob(generationJob);

    expect(result).toMatchObject({ submitted: false, queueName: "analysis" });
    expect(RedisConstructorMock).not.toHaveBeenCalled();
    expect(QueueConstructorMock).not.toHaveBeenCalled();
  });

  it("submits generation jobs to the BullMQ queue selected for the job type", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QUEUE_MODE", "redis");
    vi.stubEnv("REDIS_URL", "redis://queue.test:6379");
    resetConfigForTests();

    const { submitGenerationJob } = await importQueueModule();
    const result = await submitGenerationJob(generationJob);

    expect(result).toMatchObject({ submitted: true, queueName: "assemblyline-analysis", bullJobId: "bull-job-1" });
    expect(RedisConstructorMock).toHaveBeenCalledWith(
      "redis://queue.test:6379",
      expect.objectContaining({ maxRetriesPerRequest: null, enableReadyCheck: false }),
    );
    expect(QueueConstructorMock).toHaveBeenCalledWith("assemblyline-analysis", expect.objectContaining({ connection: redisInstances[0] }));
    expect(queueInstances[0].add).toHaveBeenCalledWith(
      "script_analysis",
      generationJob.inputPayload,
      expect.objectContaining({
        jobId: generationJob.id,
        attempts: 4,
        backoff: { type: "exponential", delay: 30000 },
      }),
    );
  });

  it("publishes project events to the documented Redis pub/sub channel", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QUEUE_MODE", "redis");
    vi.stubEnv("REDIS_URL", "redis://events.test:6379");
    resetConfigForTests();

    const { emitProjectEvent } = await importQueueModule();
    const event = emitProjectEvent({
      projectId: "project-1",
      jobId: "job-1",
      eventType: "progress",
      message: "Working",
      progressPct: 20,
    });

    expect(redisInstances[0].publish).toHaveBeenCalledWith("project:project-1:events", JSON.stringify(event));
  });

  it("subscribes to the project Redis channel and ignores malformed or unrelated messages", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QUEUE_MODE", "redis");
    vi.stubEnv("REDIS_URL", "redis://events.test:6379");
    resetConfigForTests();

    const { subscribeToProjectEvents } = await importQueueModule();
    const listener = vi.fn();
    const unsubscribe = subscribeToProjectEvents("project-1", listener);
    const messageHandler = redisInstances[0].on.mock.calls.find((call) => call[0] === "message")?.[1] as
      | ((channel: string, payload: string) => void)
      | undefined;

    expect(redisInstances[0].subscribe).toHaveBeenCalledWith("project:project-1:events");
    expect(messageHandler).toBeTypeOf("function");
    if (!messageHandler) throw new Error("Expected Redis message handler to be registered.");

    messageHandler("project:other:events", JSON.stringify({ id: "wrong-project" }));
    messageHandler("project:project-1:events", "not json");
    messageHandler(
      "project:project-1:events",
      JSON.stringify({
        id: "event-1",
        projectId: "project-1",
        jobId: "job-1",
        eventType: "progress",
        createdAt: "2026-05-10T04:00:00.000Z",
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: "event-1", projectId: "project-1" }));

    unsubscribe();
    expect(redisInstances[0].disconnect).toHaveBeenCalled();
  });
});
