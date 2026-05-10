import { describe, expect, it } from "vitest";
import { formatSseEvent, getQueueHealthSnapshot, retryPolicy, submitGenerationJob } from "@/server/queue";

describe("queue and SSE foundation", () => {
  it("defines the roadmap queue topology and retry policy", async () => {
    const queues = await getQueueHealthSnapshot();
    expect(queues.map((queue) => queue.name)).toEqual(["analysis", "image", "video", "media", "project"]);
    expect(retryPolicy.rate_limit.maxRetries).toBe(5);
    expect(retryPolicy.content_policy.maxRetries).toBe(0);
    expect(queues.every((queue) => queue.redisBacked === false)).toBe(true);
  });

  it("formats project job events as server-sent events", () => {
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
    const result = await submitGenerationJob({
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      type: "script_analysis",
      status: "queued",
      inputPayload: { scriptVersionId: "33333333-3333-4333-8333-333333333333" },
      retryCount: 0,
      createdAt: "2026-05-10T04:00:00.000Z",
    });

    expect(result).toMatchObject({ submitted: false, queueName: "analysis" });
  });
});
