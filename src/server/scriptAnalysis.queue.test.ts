import { afterEach, describe, expect, it, vi } from "vitest";

describe("script analysis queue handoff", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/server/queue");
    vi.doUnmock("@/server/repository");
    vi.doUnmock("@/server/providerKeys");
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

  it("labels queued script analysis jobs as OpenAI when a live key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-live-analysis");
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
    const { uploadScriptForProject } = await import("@/server/scriptAnalysis");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "queued-openai@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Queued OpenAI" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued OpenAI Script",
    });

    const queued = await uploadScriptForProject({
      projectId: project.id,
      filename: "queued-openai.txt",
      text: "INT. ROOM - DAY\nANNA\nAnna finds the key.",
    });

    expect(queued.jobs[0]).toMatchObject({
      type: "script_analysis",
      providerSlug: "openai",
      modelId: "gpt-4.1-mini",
    });
  });

  it("uses the async repository graph readback for queued upload and re-analysis responses", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-analysis", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: "event-queued",
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));
    vi.doMock("@/server/providerKeys", () => ({
      resolveOpenAiApiKeyForProject: vi.fn(async () => "mock"),
    }));

    const graph = {
      project: { id: "project-prisma-queued" },
      script: undefined,
      activeVersion: { id: "script-version-prisma-queued", analysisStatus: "pending" },
      scenes: [],
      shots: [],
      assets: [],
      sceneAssetRequirements: [],
      shotAssetRequirements: [],
      assetVersions: [],
      storyboardFrames: [],
      frameVersions: [],
      videoClips: [],
      clipVersions: [],
      reviewNotes: [],
      assignments: [],
      activityEvents: [],
      exportBundles: [],
      jobs: [{ id: "job-prisma-queued", type: "script_analysis", status: "queued" }],
      events: [],
    };
    const repositoryMocks = {
      createGenerationJob: vi.fn(async () => ({ id: "job-prisma-queued" })),
      createScriptVersionForProject: vi.fn(async () => ({
        version: { id: "script-version-prisma-queued" },
        previousVersionIds: [],
      })),
      getNextScriptVersionNumberForProject: vi.fn(async () => 1),
      getProject: vi.fn(async () => ({ id: "project-prisma-queued" })),
      getScriptAnalysisGraph: vi.fn(() => {
        throw new Error("synchronous local graph should not be used for queued responses");
      }),
      getScriptAnalysisGraphForProject: vi.fn(async () => graph),
      getScriptVersionById: vi.fn(async () => ({ id: "script-version-prisma-queued" })),
      supersedeScriptVersionScenes: vi.fn(async () => undefined),
    };
    vi.doMock("@/server/repository", () => repositoryMocks);

    const { runScriptAnalysis, uploadScriptForProject } = await import("@/server/scriptAnalysis");

    await expect(
      uploadScriptForProject({
        projectId: "project-prisma-queued",
        filename: "queued.txt",
        text: "INT. ROOM - DAY\nANNA\nAnna finds the key.",
      }),
    ).resolves.toMatchObject({ activeVersion: { id: "script-version-prisma-queued" } });
    await expect(runScriptAnalysis("project-prisma-queued", "script-version-prisma-queued")).resolves.toMatchObject({
      jobs: [{ id: "job-prisma-queued" }],
    });

    expect(repositoryMocks.getScriptAnalysisGraph).not.toHaveBeenCalled();
    expect(repositoryMocks.getScriptAnalysisGraphForProject).toHaveBeenCalledTimes(2);
  });
});
