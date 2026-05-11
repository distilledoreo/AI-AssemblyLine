import { afterEach, describe, expect, it, vi } from "vitest";

const graphMock = vi.hoisted(() => vi.fn());
const queueHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repository", () => ({
  getScriptAnalysisGraphForProject: graphMock,
}));

vi.mock("@/server/queue", () => ({
  getQueueHealthSnapshot: queueHealthMock,
}));

describe("observability metrics", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  it("summarizes jobs from the repository-backed project graph", async () => {
    const createdAt = "2026-05-10T12:00:00.000Z";
    graphMock.mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          projectId: "project-1",
          type: "script_analysis",
          status: "complete",
          retryCount: 0,
          inputPayload: {},
          createdAt,
          completedAt: "2026-05-10T12:00:10.000Z",
        },
        {
          id: "job-2",
          projectId: "project-1",
          type: "video_clip",
          status: "failed",
          retryCount: 1,
          inputPayload: {},
          createdAt,
        },
      ],
    });
    queueHealthMock.mockResolvedValue([{ name: "analysis", active: 0, waiting: 0, failed: 0 }]);
    process.env.SENTRY_DSN = "https://example@sentry.invalid/1";

    const { getProjectJobMetrics } = await import("@/server/observability");
    await expect(getProjectJobMetrics("project-1")).resolves.toMatchObject({
      projectId: "project-1",
      totalJobs: 2,
      jobsByType: { script_analysis: 1, video_clip: 1 },
      jobsByStatus: { complete: 1, failed: 1 },
      totalRetries: 1,
      retriedJobs: 1,
      retriesByType: { script_analysis: 0, video_clip: 1 },
      averageDurationMs: 10000,
      sentryEnabled: true,
      queueHealth: [{ name: "analysis" }],
    });
    expect(graphMock).toHaveBeenCalledWith("project-1");
  });
});
