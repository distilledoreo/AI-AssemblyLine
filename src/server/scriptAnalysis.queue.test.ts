import { afterEach, describe, expect, it, vi } from "vitest";

describe("script analysis queue handoff", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/queue");
  });

  it("returns pending script analysis in Redis queue mode and lets a worker complete the same job", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-analysis", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: `event-${event.progressPct ?? 0}`,
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));

    const repository = await import("@/server/repository");
    const { processScriptAnalysisJob, uploadScriptForProject } = await import("@/server/scriptAnalysis");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "queued@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Queued" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued Script",
    });

    const queued = await uploadScriptForProject({
      projectId: project.id,
      filename: "queued.txt",
      text: "INT. ROOM - DAY\nANNA\nAnna finds the key.",
    });

    expect(queued.activeVersion?.analysisStatus).toBe("pending");
    expect(queued.scenes).toHaveLength(0);
    expect(queued.jobs[0]).toMatchObject({
      type: "script_analysis",
      status: "queued",
      inputPayload: { projectId: project.id, scriptVersionId: queued.activeVersion?.id },
    });

    const completed = await processScriptAnalysisJob({
      projectId: project.id,
      scriptVersionId: queued.activeVersion!.id,
      jobId: queued.jobs[0].id,
    });

    expect(completed.activeVersion?.analysisStatus).toBe("complete");
    expect(completed.scenes).toHaveLength(1);
    expect(completed.jobs[0].status).toBe("complete");
    expect(completed.events.map((event) => event.message)).toContain("Script analysis started.");
  });
});
