import { describe, expect, it } from "vitest";
import { formatSseEvent, getQueueHealthSnapshot, retryPolicy } from "@/server/queue";

describe("queue and SSE foundation", () => {
  it("defines the roadmap queue topology and retry policy", () => {
    const queues = getQueueHealthSnapshot();
    expect(queues.map((queue) => queue.name)).toEqual(["analysis", "image", "video", "media", "project"]);
    expect(retryPolicy.rate_limit.maxRetries).toBe(5);
    expect(retryPolicy.content_policy.maxRetries).toBe(0);
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
});
