import { afterEach, describe, expect, it, vi } from "vitest";

describe("storyboard frame queue handoff", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/queue");
  });

  it("queues storyboard frame generation in Redis mode and lets an image worker complete it", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-image", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: `event-${event.progressPct ?? 0}`,
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));

    const repository = await import("@/server/repository");
    const { generateStoryboardFrame, processStoryboardFrameJob } = await import("@/server/storyboard");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "storyboard-queue@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Storyboard Queue" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued Storyboard",
    });
    const timestamp = "2026-05-10T12:00:00.000Z";
    const script = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: project.id,
      filename: "queued.txt",
      createdAt: timestamp,
    };
    const version = {
      id: "22222222-2222-4222-8222-222222222222",
      scriptId: script.id,
      versionNumber: 1,
      filePath: "storage/projects/queued/uploads/v1.txt",
      rawText: "INT. ROOM - DAY",
      analysisStatus: "complete" as const,
      isActive: true,
      createdAt: timestamp,
    };
    const scene = {
      id: "33333333-3333-4333-8333-333333333333",
      scriptVersionId: version.id,
      sceneNumber: 1,
      heading: "INT. ROOM - DAY",
      summary: "Anna waits.",
      scriptStartLine: 1,
      scriptEndLine: 1,
      status: "ready" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const shot = {
      id: "44444444-4444-4444-8444-444444444444",
      sceneId: scene.id,
      shotNumber: 1,
      action: "Anna waits with the key.",
      status: "ready" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    repository.getStore().scripts.push(script);
    repository.getStore().scriptVersions.push(version);
    repository.getStore().scenes.push(scene);
    repository.getStore().shots.push(shot);

    const queued = await generateStoryboardFrame({
      projectId: project.id,
      shotId: shot.id,
      keyframeIndex: 0,
    });

    expect(queued.frameVersions).toHaveLength(0);
    expect(queued.jobs[0]).toMatchObject({
      type: "storyboard_frame",
      status: "queued",
      inputPayload: { projectId: project.id, shotId: shot.id, keyframeIndex: 0 },
    });

    const completed = await processStoryboardFrameJob({
      projectId: project.id,
      shotId: shot.id,
      keyframeIndex: 0,
      jobId: queued.jobs[0].id,
    });

    expect(completed.storyboardFrames).toHaveLength(1);
    expect(completed.frameVersions).toHaveLength(1);
    expect(completed.jobs[0].status).toBe("complete");
  });
});
