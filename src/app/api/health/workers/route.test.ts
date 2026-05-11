import { afterEach, describe, expect, it, vi } from "vitest";

const queueHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/queue", () => ({
  getQueueHealthSnapshot: queueHealthMock,
}));

describe("worker health route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when all queue health reads succeed", async () => {
    queueHealthMock.mockResolvedValue([
      {
        name: "analysis",
        active: 0,
        waiting: 0,
        delayed: 0,
        failed: 0,
        completed: 1,
        latestFailures: [],
        redisBacked: true,
      },
    ]);
    const { GET } = await import("@/app/api/health/workers/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      queues: [expect.objectContaining({ name: "analysis" })],
    });
  });

  it("returns degraded when any queue reports a health error", async () => {
    queueHealthMock.mockResolvedValue([
      {
        name: "analysis",
        active: 0,
        waiting: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
        latestFailures: [],
        redisBacked: true,
        healthError: "redis count failed",
      },
    ]);
    const { GET } = await import("@/app/api/health/workers/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      queues: [expect.objectContaining({ name: "analysis", healthError: "redis count failed" })],
    });
  });
});
