import { afterEach, describe, expect, it, vi } from "vitest";

describe("video clip queue handoff", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/queue");
  });

  it("queues video clip generation in Redis mode and lets a video worker complete it", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-video", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: `event-${event.progressPct ?? 0}`,
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));

    const repository = await import("@/server/repository");
    const { generateVideoClip, processVideoClipJob } = await import("@/server/video");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "video-queue@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Video Queue" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued Video",
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
      status: "storyboarded" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const frame = {
      id: "55555555-5555-4555-8555-555555555555",
      shotId: shot.id,
      keyframeIndex: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const frameVersion = {
      id: "66666666-6666-4666-8666-666666666666",
      frameId: frame.id,
      versionNumber: 1,
      prompt: "Approved frame.",
      filePath: "storage/projects/queued/storyboards/frame.png",
      thumbnailPath: "storage/projects/queued/storyboards/frame.png",
      status: "approved" as const,
      isStale: false,
      createdAt: timestamp,
    };
    const store = repository.getStore();
    store.scripts.push(script);
    store.scriptVersions.push(version);
    store.scenes.push(scene);
    store.shots.push(shot);
    store.storyboardFrames.push(frame);
    store.frameVersions.push(frameVersion);

    const queued = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: shot.id,
      providerSlug: "runway",
    });

    expect(queued.clipVersions).toHaveLength(0);
    expect(queued.jobs[0]).toMatchObject({
      type: "video_clip",
      status: "queued",
      inputPayload: { projectId: project.id, mode: "shot", shotId: shot.id, providerSlug: "runway" },
    });

    const completed = await processVideoClipJob({
      projectId: project.id,
      mode: "shot",
      shotId: shot.id,
      providerSlug: "runway",
      jobId: queued.jobs[0].id,
    });

    expect(completed.videoClips).toHaveLength(1);
    expect(completed.clipVersions).toHaveLength(1);
    expect(completed.jobs[0].status).toBe("complete");
  });
});
