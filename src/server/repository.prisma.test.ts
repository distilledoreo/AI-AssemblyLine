import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    upsert: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
  workspace: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  workspaceMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  project: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  projectMember: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  projectStyle: {
    update: vi.fn(),
  },
  providerKey: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  generationJob: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  jobEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  script: {
    create: vi.fn(),
    createMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  scriptVersion: {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  scene: {
    create: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  shot: {
    create: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  asset: {
    create: vi.fn(),
    createMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  characterDetail: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  wardrobeDetail: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  locationDetail: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  creatureDetail: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  propDetail: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  assetVersion: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  assetReference: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  storyboardFrame: {
    createMany: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  frameVersion: {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  reviewNote: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  videoClip: {
    createMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  clipVersion: {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  invitation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  assignment: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  activityEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  exportBundle: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  sceneAssetReq: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  shotAssetReq: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/server/prisma", () => ({ prisma: prismaMock }));

const timestamp = new Date("2026-05-10T12:00:00.000Z");

describe("Prisma repository mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REPOSITORY_MODE = "prisma";
  });

  afterEach(() => {
    delete process.env.REPOSITORY_MODE;
  });

  it("uses Prisma for auth, ownership, dashboard, and provider key repository operations", async () => {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "producer@example.com",
      name: "Producer",
      avatarUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const workspace = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Studio",
      slug: "studio",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const project = {
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId: workspace.id,
      title: "Pilot",
      targetFormat: "short_film",
      aspectRatio: "16:9",
      estimatedRuntime: null,
      storagePath: "storage/projects/33333333-3333-4333-8333-333333333333",
      rightsPolicy: "unrestricted",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const style = {
      id: "44444444-4444-4444-8444-444444444444",
      projectId: project.id,
      styleName: "Project Style",
      description: "Draft visual style.",
      colorPalette: ["#111111", "#ffffff"],
      lightingRules: "Neutral.",
      renderingMedium: "digital painting",
      lensLanguage: "Clear coverage.",
      negativeConstraints: "Avoid drift.",
      modelPromptFragments: {},
      approvalStatus: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const job = {
      id: "55555555-5555-4555-8555-555555555555",
      projectId: project.id,
      type: "script_analysis",
      providerSlug: null,
      modelId: null,
      status: "queued",
      inputPayload: {},
      outputPayload: null,
      errorMessage: null,
      errorClass: null,
      retryCount: 0,
      providerJobId: null,
      createdAt: timestamp,
      startedAt: null,
      completedAt: null,
    };
    const event = {
      id: "66666666-6666-4666-8666-666666666666",
      projectId: project.id,
      jobId: job.id,
      eventType: "progress",
      message: "Queued",
      progressPct: 10,
      createdAt: timestamp,
    };

    prismaMock.user.upsert.mockResolvedValue(user);
    prismaMock.session.create.mockResolvedValue({
      sessionToken: "session-token",
      userId: user.id,
      expires: new Date("2026-06-10T12:00:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValue({
      sessionToken: "session-token",
      userId: user.id,
      expires: new Date("2026-06-10T12:00:00.000Z"),
      user,
    });
    prismaMock.workspace.findUnique.mockResolvedValueOnce(null).mockResolvedValue(workspace);
    prismaMock.workspace.create.mockResolvedValue(workspace);
    prismaMock.workspaceMember.findMany.mockResolvedValue([{ workspace }]);
    prismaMock.workspaceMember.findUnique.mockResolvedValue({ role: "owner" });
    prismaMock.project.create.mockResolvedValue({ ...project, storagePath: "" });
    prismaMock.project.update.mockResolvedValue(project);
    prismaMock.project.findUnique.mockResolvedValue({ ...project, style, generationJobs: [job], jobEvents: [event] });
    prismaMock.projectMember.findMany.mockResolvedValue([{ project }]);
    prismaMock.projectMember.findUnique.mockResolvedValue({ role: "owner" });
    prismaMock.providerKey.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.providerKey.create.mockImplementation(async ({ data }) => ({
      id: "77777777-7777-4777-8777-777777777777",
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const repository = await import("@/server/repository");
    const signedIn = await repository.signInWithCredentials({
      email: "Producer@Example.com",
      password: "assemblyline",
      name: "Producer",
    });
    const createdWorkspace = await repository.createWorkspaceForUser(signedIn.user.id, { name: "Studio" });
    const createdProject = await repository.createProjectForWorkspace(signedIn.user.id, {
      workspaceId: createdWorkspace.id,
      title: "Pilot",
    });
    const providerKey = await repository.saveProviderKey(createdWorkspace.id, {
      providerSlug: "openai",
      apiKey: "sk-live-repository-test",
      label: "OpenAI",
    });
    const prismaProviderKey = await prismaMock.providerKey.create.mock.results[0].value;
    prismaMock.providerKey.findMany.mockResolvedValue([prismaProviderKey]);
    prismaMock.providerKey.findFirst.mockResolvedValue(prismaProviderKey);

    expect(repository.isPrismaRepositoryEnabled()).toBe(true);
    expect(prismaMock.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "producer@example.com" } }));
    expect(await repository.getOptionalSessionUser("session-token")).toMatchObject({ id: user.id });
    expect(await repository.listWorkspacesForUser(user.id)).toEqual([createdWorkspace]);
    expect(await repository.getWorkspaceRole(user.id, createdWorkspace.id)).toBe("owner");
    expect(createdProject.storagePath).toContain(project.id);
    expect(await repository.listProjectsForUser(user.id)).toEqual([createdProject]);
    expect(await repository.getProjectRole(user.id, createdProject.id)).toBe("owner");
    expect((await repository.getProjectDashboard(createdProject.id)).jobs[0].id).toBe(job.id);
    expect(providerKey.maskedKey).toBe("sk-l...test");
    expect(await repository.decryptWorkspaceProviderKey(createdWorkspace.id, "openai")).toBe("sk-live-repository-test");
    expect(await repository.decryptProjectProviderKey(createdProject.id, "openai")).toBe("sk-live-repository-test");
    expect(await repository.listProviderKeys(createdWorkspace.id)).toHaveLength(1);
  });

  it("mirrors generation jobs and job events into Prisma in production repository mode", async () => {
    prismaMock.generationJob.create.mockResolvedValue({});
    prismaMock.generationJob.update.mockResolvedValue({});
    prismaMock.jobEvent.create.mockResolvedValue({});

    const repository = await import("@/server/repository");
    const job = await repository.createGenerationJob({
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "script_analysis",
      providerSlug: "local-mock",
      modelId: "deterministic-script-pass-v1",
      inputPayload: {
        projectId: "33333333-3333-4333-8333-333333333333",
        scriptVersionId: "88888888-8888-4888-8888-888888888888",
      },
    });
    await repository.completeGenerationJob(job.id, {
      status: "complete",
      outputPayload: { scenes: 1, shots: 1, assets: 2 },
    });

    expect(prismaMock.generationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: job.id,
        projectId: job.projectId,
        type: "script_analysis",
        status: "queued",
        inputPayload: expect.objectContaining({ scriptVersionId: "88888888-8888-4888-8888-888888888888" }),
      }),
    });
    expect(prismaMock.jobEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: job.id,
        projectId: job.projectId,
        eventType: "status_change",
        message: "Job queued.",
      }),
    });
    expect(prismaMock.generationJob.update).toHaveBeenCalledWith({
      where: { id: job.id },
      data: expect.objectContaining({
        status: "complete",
        outputPayload: { scenes: 1, shots: 1, assets: 2 },
      }),
    });
  });

  it("rejects job creation when the Prisma job write fails", async () => {
    prismaMock.generationJob.create.mockRejectedValue(new Error("database unavailable"));
    prismaMock.jobEvent.create.mockResolvedValue({});

    const repository = await import("@/server/repository");
    repository.resetStoreForTests();

    await expect(
      repository.createGenerationJob({
        projectId: "33333333-3333-4333-8333-333333333333",
        type: "script_analysis",
        providerSlug: "local-mock",
        inputPayload: { scriptVersionId: "88888888-8888-4888-8888-888888888888" },
      }),
    ).rejects.toThrow("database unavailable");
    expect(prismaMock.jobEvent.create).not.toHaveBeenCalled();
    expect(repository.getStore().generationJobs).toHaveLength(0);
  });

  it("updates worker job lifecycle from Prisma when the local store is empty", async () => {
    const job = {
      id: "99999999-9999-4999-8999-999999999999",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "export",
      providerSlug: null,
      modelId: null,
      status: "running",
      inputPayload: { projectId: "33333333-3333-4333-8333-333333333333" },
      outputPayload: null,
      errorMessage: null,
      errorClass: null,
      retryCount: 0,
      providerJobId: null,
      createdAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
    };
    prismaMock.generationJob.findUnique.mockResolvedValue(job);
    prismaMock.generationJob.update.mockResolvedValue(job);

    const repository = await import("@/server/repository");
    repository.resetStoreForTests();

    await expect(repository.markGenerationJobRunning(job.id)).resolves.toMatchObject({
      id: job.id,
      status: "running",
    });
    await expect(repository.completeGenerationJob(job.id, {
      status: "complete",
      outputPayload: { manifestPath: "storage/projects/project/export.json" },
      retryCount: 2,
    })).resolves.toBeUndefined();

    expect(prismaMock.generationJob.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.generationJob.update).toHaveBeenNthCalledWith(1, {
      where: { id: job.id },
      data: expect.objectContaining({ status: "running", startedAt: expect.any(Date) }),
    });
    expect(prismaMock.generationJob.update).toHaveBeenNthCalledWith(2, {
      where: { id: job.id },
      data: expect.objectContaining({
        status: "complete",
        outputPayload: { manifestPath: "storage/projects/project/export.json" },
        retryCount: 2,
        completedAt: expect.any(Date),
      }),
    });

    vi.clearAllMocks();
    prismaMock.generationJob.findUnique.mockResolvedValue({ ...job, status: "polling" });
    prismaMock.generationJob.update.mockResolvedValue({ ...job, status: "polling" });

    await expect(repository.markGenerationJobRunning(job.id, "polling")).resolves.toMatchObject({
      id: job.id,
      status: "polling",
    });
    expect(prismaMock.generationJob.update).toHaveBeenCalledWith({
      where: { id: job.id },
      data: expect.objectContaining({ status: "polling", startedAt: expect.any(Date) }),
    });
  });

  it("lists submitted provider jobs through Prisma for poll workers", async () => {
    const submitted = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "video_clip" as const,
      providerSlug: "runway",
      modelId: "gen4.5",
      status: "provider_submitted" as const,
      inputPayload: { mode: "shot" },
      outputPayload: { providerJobId: "task-1" },
      errorMessage: null,
      errorClass: null,
      retryCount: 0,
      providerJobId: "task-1",
      createdAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
    };
    prismaMock.generationJob.findMany.mockResolvedValue([submitted]);

    const repository = await import("@/server/repository");
    await expect(repository.listSubmittedProviderJobs({ type: "video_clip", providerSlug: "runway" })).resolves.toMatchObject([
      { id: submitted.id, providerJobId: "task-1", status: "provider_submitted" },
    ]);
    expect(prismaMock.generationJob.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["provider_submitted", "polling"] },
        type: "video_clip",
        providerSlug: "runway",
      },
      orderBy: { createdAt: "asc" },
    });
  });

  it("loads script versions from Prisma for out-of-process analysis workers", async () => {
    const version = {
      id: "88888888-8888-4888-8888-888888888888",
      scriptId: "99999999-9999-4999-8999-999999999999",
      versionNumber: 1,
      filePath: "storage/projects/project/uploads/v1-pilot.txt",
      rawText: "INT. ROOM - DAY\nANNA\nAnna waits.",
      analysisStatus: "pending",
      isActive: true,
      createdAt: timestamp,
    };
    prismaMock.scriptVersion.findUnique.mockResolvedValue(version);

    const repository = await import("@/server/repository");
    repository.resetStoreForTests();

    await expect(repository.getScriptVersionById(version.id)).resolves.toMatchObject({
      id: version.id,
      rawText: version.rawText,
      analysisStatus: "pending",
    });
    expect(prismaMock.scriptVersion.findUnique).toHaveBeenCalledWith({ where: { id: version.id } });
  });

  it("persists uploaded script versions through Prisma while mirroring the local graph", async () => {
    prismaMock.script.findFirst.mockResolvedValue(undefined);
    prismaMock.script.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
    }));
    prismaMock.scriptVersion.findMany.mockResolvedValue([]);
    prismaMock.scriptVersion.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.scriptVersion.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
    }));

    const repository = await import("@/server/repository");
    const created = await repository.createScriptVersionForProject({
      projectId: "33333333-3333-4333-8333-333333333333",
      filename: "pilot.txt",
      filePath: "storage/projects/project/uploads/v1-pilot.txt",
      rawText: "INT. ROOM - DAY\nANNA\nAnna waits.",
    });

    expect(prismaMock.script.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: created.script.id,
        projectId: created.script.projectId,
        filename: "pilot.txt",
      }),
    });
    expect(prismaMock.scriptVersion.updateMany).toHaveBeenCalledWith({
      where: { scriptId: created.script.id },
      data: { isActive: false },
    });
    expect(prismaMock.scriptVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: created.version.id,
        scriptId: created.script.id,
        versionNumber: 1,
        analysisStatus: "pending",
        isActive: true,
      }),
    });
    expect(repository.getScriptAnalysisGraph(created.script.projectId).activeVersion?.id).toBe(created.version.id);
  });

  it("uses persisted Prisma script versions for upload numbering", async () => {
    const script = {
      id: "99999999-9999-4999-8999-999999999999",
      projectId: "33333333-3333-4333-8333-333333333333",
      filename: "pilot.txt",
      createdAt: timestamp,
    };
    prismaMock.script.findFirst.mockResolvedValue(script);
    prismaMock.scriptVersion.findMany.mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        scriptId: script.id,
        versionNumber: 1,
        filePath: "storage/projects/project/uploads/v1-pilot.txt",
        rawText: "INT. ROOM - DAY",
        analysisStatus: "complete",
        isActive: false,
        createdAt: timestamp,
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        scriptId: script.id,
        versionNumber: 2,
        filePath: "storage/projects/project/uploads/v2-pilot.txt",
        rawText: "INT. HALL - DAY",
        analysisStatus: "complete",
        isActive: true,
        createdAt: timestamp,
      },
    ]);

    const repository = await import("@/server/repository");
    await expect(repository.getNextScriptVersionNumberForProject(script.projectId)).resolves.toBe(3);
    expect(prismaMock.scriptVersion.findMany).toHaveBeenCalledWith({
      where: { scriptId: script.id },
      orderBy: { versionNumber: "asc" },
    });
  });

  it("supersedes previous script scenes and shots through Prisma", async () => {
    const scriptVersionId = "88888888-8888-4888-8888-888888888888";
    prismaMock.scene.findMany.mockResolvedValue([
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    ]);
    prismaMock.scene.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.shot.updateMany.mockResolvedValue({ count: 4 });

    const repository = await import("@/server/repository");
    await repository.supersedeScriptVersionScenes([scriptVersionId]);

    expect(prismaMock.scene.findMany).toHaveBeenCalledWith({
      where: { scriptVersionId: { in: [scriptVersionId] } },
      select: { id: true },
    });
    expect(prismaMock.scene.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] } },
      data: expect.objectContaining({ status: "superseded", updatedAt: expect.any(Date) }),
    });
    expect(prismaMock.shot.updateMany).toHaveBeenCalledWith({
      where: { sceneId: { in: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] } },
      data: expect.objectContaining({ status: "superseded", updatedAt: expect.any(Date) }),
    });
  });

  it("persists generated script analysis graph records through Prisma", async () => {
    prismaMock.scene.findMany.mockResolvedValue([]);
    prismaMock.shot.findMany.mockResolvedValue([]);
    prismaMock.scene.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
      isUserEdited: false,
    }));
    prismaMock.shot.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
      isUserEdited: false,
    }));
    prismaMock.asset.findFirst.mockResolvedValue(undefined);
    prismaMock.asset.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
      isUserEdited: false,
    }));
    prismaMock.sceneAssetReq.createMany.mockResolvedValue({ count: 1 });
    prismaMock.shotAssetReq.createMany.mockResolvedValue({ count: 1 });
    prismaMock.scriptVersion.update.mockResolvedValue({});

    const repository = await import("@/server/repository");
    await repository.persistGeneratedScriptAnalysis({
      projectId: "33333333-3333-4333-8333-333333333333",
      scriptVersionId: "88888888-8888-4888-8888-888888888888",
      scenes: [
        {
          sceneNumber: 1,
          heading: "INT. ROOM - DAY",
          summary: "Anna waits.",
          scriptStartLine: 1,
          scriptEndLine: 3,
          locationHint: "Room",
        },
      ],
      shotBreakdowns: [
        {
          sceneNumber: 1,
          shots: [
            {
              shotNumber: 1,
              action: "Anna waits.",
              cameraAngle: "establishing wide",
              cameraMovement: "static",
            },
          ],
        },
      ],
      assets: [
        {
          canonicalName: "Room",
          type: "location",
          aliases: ["INT. ROOM - DAY"],
          description: "Location inferred from heading.",
          firstAppearance: { sceneNumber: 1 },
        },
      ],
      sceneAssetLinks: [{ sceneNumber: 1, assetName: "Room" }],
      shotAssetLinks: [{ sceneNumber: 1, shotNumber: 1, assetName: "Room" }],
      warnings: [],
    });
    await repository.updateScriptVersionAnalysisStatus("88888888-8888-4888-8888-888888888888", "complete");

    expect(prismaMock.scene.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scriptVersionId: "88888888-8888-4888-8888-888888888888",
        sceneNumber: 1,
        heading: "INT. ROOM - DAY",
      }),
    });
    expect(prismaMock.shot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shotNumber: 1,
        action: "Anna waits.",
      }),
    });
    expect(prismaMock.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "33333333-3333-4333-8333-333333333333",
        canonicalName: "Room",
        type: "location",
      }),
    });
    expect(prismaMock.sceneAssetReq.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ isOptional: false, detectedBy: "ai" })],
      skipDuplicates: true,
    });
    expect(prismaMock.shotAssetReq.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ isOptional: false, detectedBy: "ai" })],
      skipDuplicates: true,
    });
    expect(prismaMock.scriptVersion.update).toHaveBeenCalledWith({
      where: { id: "88888888-8888-4888-8888-888888888888" },
      data: { analysisStatus: "complete" },
    });
  });

  it("reads and persists scene, shot, and asset editor mutations through Prisma", async () => {
    const repository = await import("@/server/repository");
    const scene = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scriptVersionId: "88888888-8888-4888-8888-888888888888",
      sceneNumber: 1,
      heading: "INT. ROOM - DAY",
      summary: "Anna waits.",
      scriptStartLine: 1,
      scriptEndLine: 3,
      locationHint: "Room",
      status: "blocked",
      isUserEdited: false,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const shot = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sceneId: scene.id,
      shotNumber: 1,
      action: "Anna waits.",
      cameraAngle: "wide",
      cameraMovement: "static",
      lensNotes: null,
      lightingNotes: null,
      userDirection: null,
      status: "blocked",
      isUserEdited: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const asset = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "location",
      canonicalName: "Room",
      aliases: ["INT. ROOM - DAY"],
      status: "missing",
      continuityNotes: null,
      negativePrompts: null,
      description: "Location inferred from heading.",
      firstAppearance: { sceneNumber: 1 },
      isUserEdited: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    prismaMock.scene.findUnique.mockResolvedValue(scene);
    prismaMock.shot.findUnique.mockResolvedValue(shot);
    prismaMock.asset.findUnique.mockResolvedValue(asset);
    prismaMock.scene.update.mockResolvedValue({});
    prismaMock.shot.update.mockResolvedValue({});
    prismaMock.asset.update.mockResolvedValue({});

    expect(await repository.getSceneById(scene.id)).toMatchObject({ id: scene.id, summary: "Anna waits." });
    expect(await repository.getShotById(shot.id)).toMatchObject({ id: shot.id, action: "Anna waits." });
    expect(await repository.getAssetById(asset.id)).toMatchObject({ id: asset.id, canonicalName: "Room" });

    await repository.persistSceneState({
      id: scene.id,
      scriptVersionId: scene.scriptVersionId,
      sceneNumber: scene.sceneNumber,
      heading: scene.heading,
      summary: "User-edited beat.",
      scriptStartLine: scene.scriptStartLine,
      scriptEndLine: scene.scriptEndLine,
      locationHint: scene.locationHint,
      status: "ready",
      isUserEdited: true,
      warnings: [],
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    await repository.persistShotState({
      id: shot.id,
      sceneId: shot.sceneId,
      shotNumber: shot.shotNumber,
      action: "Anna opens the window.",
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensNotes: undefined,
      lightingNotes: undefined,
      userDirection: "Hold on Anna.",
      status: "ready",
      isUserEdited: true,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    await repository.persistAssetState({
      id: asset.id,
      projectId: asset.projectId,
      type: "location",
      canonicalName: "Workshop",
      aliases: asset.aliases,
      status: "approved",
      continuityNotes: "Keep the workbench camera-left.",
      negativePrompts: undefined,
      description: asset.description,
      firstAppearance: { sceneNumber: 1 },
      isUserEdited: true,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });

    expect(prismaMock.scene.update).toHaveBeenCalledWith({
      where: { id: scene.id },
      data: expect.objectContaining({
        summary: "User-edited beat.",
        status: "ready",
        isUserEdited: true,
      }),
    });
    expect(prismaMock.shot.update).toHaveBeenCalledWith({
      where: { id: shot.id },
      data: expect.objectContaining({
        action: "Anna opens the window.",
        userDirection: "Hold on Anna.",
        isUserEdited: true,
      }),
    });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: asset.id },
      data: expect.objectContaining({
        canonicalName: "Workshop",
        status: "approved",
        isUserEdited: true,
      }),
    });
  });

  it("reads script analysis graph records back from Prisma", async () => {
    const repository = await import("@/server/repository");
    const script = {
      id: "99999999-9999-4999-8999-999999999999",
      projectId: "33333333-3333-4333-8333-333333333333",
      filename: "pilot.txt",
      createdAt: timestamp,
    };
    const version = {
      id: "88888888-8888-4888-8888-888888888888",
      scriptId: script.id,
      versionNumber: 1,
      filePath: "storage/projects/project/uploads/v1-pilot.txt",
      rawText: "INT. ROOM - DAY\nANNA\nAnna waits.",
      analysisStatus: "complete",
      isActive: true,
      createdAt: timestamp,
    };
    const scene = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scriptVersionId: version.id,
      sceneNumber: 1,
      heading: "INT. ROOM - DAY",
      summary: "Anna waits.",
      scriptStartLine: 1,
      scriptEndLine: 3,
      locationHint: "Room",
      status: "blocked",
      isUserEdited: false,
      warnings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const shot = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sceneId: scene.id,
      shotNumber: 1,
      action: "Anna waits.",
      cameraAngle: "establishing wide",
      cameraMovement: "static",
      lensNotes: null,
      lightingNotes: null,
      userDirection: null,
      status: "blocked",
      isUserEdited: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const asset = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: script.projectId,
      type: "location",
      canonicalName: "Room",
      aliases: ["INT. ROOM - DAY"],
      status: "missing",
      continuityNotes: null,
      negativePrompts: null,
      description: "Location inferred from heading.",
      firstAppearance: { sceneNumber: 1 },
      isUserEdited: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const sceneReq = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sceneId: scene.id,
      assetId: asset.id,
      isOptional: false,
      detectedBy: "ai",
      createdAt: timestamp,
    };
    const shotReq = {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      shotId: shot.id,
      assetId: asset.id,
      isOptional: false,
      detectedBy: "ai",
      createdAt: timestamp,
    };
    const assetVersion = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      assetId: asset.id,
      versionNumber: 1,
      description: "Uploaded reference.",
      promptFragments: { style: "soft daylight" },
      status: "draft",
      createdAt: timestamp,
    };
    const assetReference = {
      id: "abababab-abab-4aba-8aba-abababababab",
      assetVersionId: assetVersion.id,
      referenceType: "front",
      filePath: "storage/projects/project/assets/reference.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      thumbnailPath: "storage/projects/project/assets/reference-thumb.png",
      generationJobId: null,
      createdAt: timestamp,
    };
    const locationDetail = {
      id: "12121212-1212-4121-8121-121212121212",
      assetId: asset.id,
      floorPlanNotes: "One practical counter and a back exit.",
      entranceExitNotes: null,
      setDressing: "Warm practical lamps.",
      lightingStates: ["day", "night"],
      cameraSafeZones: null,
    };
    const storyboardFrame = {
      id: "13131313-1313-4131-8131-131313131313",
      shotId: shot.id,
      keyframeIndex: 0,
      sketchFilePath: "storage/projects/project/storyboards/sketch.png",
      sketchWarning: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const frameVersion = {
      id: "14141414-1414-4141-8141-141414141414",
      frameId: storyboardFrame.id,
      versionNumber: 1,
      prompt: "Wide frame of Anna in the room.",
      filePath: "storage/projects/project/storyboards/frame.png",
      thumbnailPath: "storage/projects/project/storyboards/frame-thumb.png",
      status: "approved",
      isStale: false,
      generationJobId: null,
      annotations: { rectangle: true },
      createdAt: timestamp,
    };
    const reviewNote = {
      id: "15151515-1515-4151-8151-151515151515",
      projectId: script.projectId,
      authorId: "11111111-1111-4111-8111-111111111111",
      targetType: "frame_version",
      targetId: frameVersion.id,
      parentNoteId: null,
      body: "Composition approved.",
      markupFilePath: null,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const videoClip = {
      id: "16161616-1616-4161-8161-161616161616",
      shotId: shot.id,
      sceneId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const clipVersion = {
      id: "17171717-1717-4171-8171-171717171717",
      clipId: videoClip.id,
      versionNumber: 1,
      prompt: "Shot-by-shot video clip.",
      filePath: "storage/projects/project/videos/clip.mp4",
      thumbnailPath: "storage/projects/project/videos/clip.mp4",
      durationMs: 3000,
      status: "approved",
      isStale: false,
      sourceFrameVersionIds: [frameVersion.id],
      generationJobId: null,
      createdAt: timestamp,
    };
    const invitation = {
      id: "18181818-1818-4181-8181-181818181818",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      projectId: script.projectId,
      email: "artist@example.com",
      tokenHash: "hashed-token",
      scope: "project",
      role: "artist",
      status: "accepted",
      expiresAt: new Date("2026-05-17T12:00:00.000Z"),
      invitedById: "11111111-1111-4111-8111-111111111111",
      acceptedAt: timestamp,
      createdAt: timestamp,
    };
    const assignment = {
      id: "19191919-1919-4191-8191-191919191919",
      projectId: script.projectId,
      userId: "11111111-1111-4111-8111-111111111111",
      targetType: "scene",
      sceneId: scene.id,
      shotId: null,
      assetId: null,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const activityEvent = {
      id: "20202020-2020-4202-8202-202020202020",
      projectId: script.projectId,
      actorId: "11111111-1111-4111-8111-111111111111",
      eventType: "assignment_created",
      message: "Assigned scene.",
      metadata: { assignmentId: assignment.id },
      createdAt: timestamp,
    };
    prismaMock.script.findMany.mockResolvedValue([script]);
    prismaMock.scriptVersion.findMany.mockResolvedValue([version]);
    prismaMock.scene.findMany.mockResolvedValue([scene]);
    prismaMock.shot.findMany.mockResolvedValue([shot]);
    prismaMock.asset.findMany.mockResolvedValue([asset]);
    prismaMock.characterDetail.findMany.mockResolvedValue([]);
    prismaMock.wardrobeDetail.findMany.mockResolvedValue([]);
    prismaMock.locationDetail.findMany.mockResolvedValue([locationDetail]);
    prismaMock.creatureDetail.findMany.mockResolvedValue([]);
    prismaMock.propDetail.findMany.mockResolvedValue([]);
    prismaMock.assetVersion.findMany.mockResolvedValue([assetVersion]);
    prismaMock.assetReference.findMany.mockResolvedValue([assetReference]);
    prismaMock.sceneAssetReq.findMany.mockResolvedValue([sceneReq]);
    prismaMock.shotAssetReq.findMany.mockResolvedValue([shotReq]);
    prismaMock.storyboardFrame.findMany.mockResolvedValue([storyboardFrame]);
    prismaMock.frameVersion.findMany.mockResolvedValue([frameVersion]);
    prismaMock.reviewNote.findMany.mockResolvedValue([reviewNote]);
    prismaMock.videoClip.findMany.mockResolvedValue([videoClip]);
    prismaMock.clipVersion.findMany.mockResolvedValue([clipVersion]);
    prismaMock.invitation.findMany.mockResolvedValue([invitation]);
    prismaMock.assignment.findMany.mockResolvedValue([assignment]);
    prismaMock.activityEvent.findMany.mockResolvedValue([activityEvent]);
    prismaMock.generationJob.findMany.mockResolvedValue([]);
    prismaMock.jobEvent.findMany.mockResolvedValue([]);

    const graph = await repository.getScriptAnalysisGraphForProject(script.projectId);

    expect(graph.activeVersion?.id).toBe(version.id);
    expect(graph.scenes[0]).toMatchObject({ id: scene.id, heading: "INT. ROOM - DAY" });
    expect(graph.shots[0]).toMatchObject({ id: shot.id, action: "Anna waits." });
    expect(graph.assets[0]).toMatchObject({ id: asset.id, canonicalName: "Room" });
    expect(graph.assetDetails[0]).toMatchObject({
      assetId: asset.id,
      floorPlanNotes: "One practical counter and a back exit.",
      lightingStates: ["day", "night"],
      updatedAt: timestamp.toISOString(),
    });
    expect(graph.assetVersions[0]).toMatchObject({
      id: assetVersion.id,
      assetId: asset.id,
      promptFragments: { style: "soft daylight" },
    });
    expect(graph.assetReferences[0]).toMatchObject({
      id: assetReference.id,
      assetVersionId: assetVersion.id,
      thumbnailPath: "storage/projects/project/assets/reference-thumb.png",
    });
    expect(graph.storyboardFrames[0]).toMatchObject({
      id: storyboardFrame.id,
      shotId: shot.id,
      sketchFilePath: "storage/projects/project/storyboards/sketch.png",
    });
    expect(graph.frameVersions[0]).toMatchObject({
      id: frameVersion.id,
      frameId: storyboardFrame.id,
      status: "approved",
      annotations: { rectangle: true },
    });
    expect(graph.reviewNotes[0]).toMatchObject({
      id: reviewNote.id,
      targetId: frameVersion.id,
      body: "Composition approved.",
    });
    expect(graph.videoClips[0]).toMatchObject({
      id: videoClip.id,
      shotId: shot.id,
    });
    expect(graph.clipVersions[0]).toMatchObject({
      id: clipVersion.id,
      clipId: videoClip.id,
      sourceFrameVersionIds: [frameVersion.id],
    });
    expect(graph.invitations[0]).toMatchObject({
      id: invitation.id,
      email: "artist@example.com",
      status: "accepted",
    });
    expect(graph.assignments[0]).toMatchObject({
      id: assignment.id,
      sceneId: scene.id,
      status: "open",
    });
    expect(graph.activityEvents[0]).toMatchObject({
      eventType: "assignment_created",
      metadata: { assignmentId: assignment.id },
    });
    expect(graph.sceneAssetRequirements[0]).toMatchObject({ sceneId: scene.id, assetId: asset.id });
    expect(graph.shotAssetRequirements[0]).toMatchObject({ shotId: shot.id, assetId: asset.id });
  });

  it("persists Asset Bible status and manual requirements through Prisma", async () => {
    const repository = await import("@/server/repository");
    const asset = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "location" as const,
      canonicalName: "Room",
      aliases: ["INT. ROOM - DAY"],
      status: "approved" as const,
      continuityNotes: "Locked visual reference.",
      negativePrompts: undefined,
      description: "Location inferred from heading.",
      firstAppearance: { sceneNumber: 1 },
      isUserEdited: true,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const requirement = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sceneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assetId: asset.id,
      isOptional: false,
      detectedBy: "user" as const,
      createdAt: timestamp.toISOString(),
    };

    prismaMock.asset.update.mockResolvedValue(asset);
    prismaMock.sceneAssetReq.findFirst.mockResolvedValue({ ...requirement, createdAt: timestamp });
    prismaMock.sceneAssetReq.findUnique.mockResolvedValue({ ...requirement, createdAt: timestamp });
    prismaMock.sceneAssetReq.createMany.mockResolvedValue({ count: 1 });
    prismaMock.sceneAssetReq.deleteMany.mockResolvedValue({ count: 1 });

    await expect(repository.getSceneAssetRequirementBySceneAndAsset(requirement.sceneId, requirement.assetId)).resolves.toMatchObject({
      id: requirement.id,
      sceneId: requirement.sceneId,
      assetId: requirement.assetId,
    });
    await expect(repository.getSceneAssetRequirementById(requirement.id)).resolves.toMatchObject({
      id: requirement.id,
      sceneId: requirement.sceneId,
      assetId: requirement.assetId,
    });
    await repository.persistAssetState(asset);
    await repository.persistSceneAssetRequirement(requirement);
    await repository.deleteSceneAssetRequirement(requirement.id);

    expect(prismaMock.sceneAssetReq.findFirst).toHaveBeenCalledWith({
      where: { sceneId: requirement.sceneId, assetId: requirement.assetId },
    });
    expect(prismaMock.sceneAssetReq.findUnique).toHaveBeenCalledWith({ where: { id: requirement.id } });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: asset.id },
      data: expect.objectContaining({
        status: "approved",
        continuityNotes: "Locked visual reference.",
        isUserEdited: true,
      }),
    });
    expect(prismaMock.sceneAssetReq.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: requirement.id,
          sceneId: requirement.sceneId,
          assetId: requirement.assetId,
          detectedBy: "user",
        }),
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.sceneAssetReq.deleteMany).toHaveBeenCalledWith({ where: { id: requirement.id } });
  });

  it("persists Asset Bible merge and split corrections through Prisma", async () => {
    const repository = await import("@/server/repository");
    const source = {
      id: "cdcdcdcd-cdcd-4cdc-8dcd-cdcdcdcdcdcd",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "location" as const,
      canonicalName: "Duplicate Room",
      aliases: [],
      status: "superseded" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const target = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: source.projectId,
      type: "location" as const,
      canonicalName: "Room",
      aliases: ["Duplicate Room"],
      status: "approved" as const,
      isUserEdited: true,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };

    prismaMock.asset.create.mockResolvedValue(source);
    prismaMock.asset.update.mockResolvedValue(target);
    prismaMock.sceneAssetReq.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.shotAssetReq.updateMany.mockResolvedValue({ count: 1 });

    await repository.persistCreatedAssetState(source);
    await repository.persistAssetMergeState({ source, target });

    expect(prismaMock.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: source.id,
        projectId: source.projectId,
        canonicalName: "Duplicate Room",
      }),
    });
    expect(prismaMock.sceneAssetReq.updateMany).toHaveBeenCalledWith({
      where: { assetId: source.id },
      data: { assetId: target.id },
    });
    expect(prismaMock.shotAssetReq.updateMany).toHaveBeenCalledWith({
      where: { assetId: source.id },
      data: { assetId: target.id },
    });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: expect.objectContaining({ status: "superseded" }),
    });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: expect.objectContaining({ aliases: ["Duplicate Room"] }),
    });
  });

  it("persists Asset Bible versions and references through Prisma", async () => {
    const repository = await import("@/server/repository");
    const version = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      assetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      versionNumber: 1,
      description: "Uploaded reference.",
      status: "draft" as const,
      createdAt: timestamp.toISOString(),
    };
    const reference = {
      id: "abababab-abab-4aba-8aba-abababababab",
      assetVersionId: version.id,
      referenceType: "front" as const,
      filePath: "storage/projects/project/assets/reference.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      thumbnailPath: "storage/projects/project/assets/reference.png",
      createdAt: timestamp.toISOString(),
    };

    prismaMock.assetVersion.create.mockResolvedValue(version);
    prismaMock.assetReference.create.mockResolvedValue(reference);
    await repository.persistAssetVersionAndReference({ version, reference });

    expect(prismaMock.assetVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: version.id,
        assetId: version.assetId,
        versionNumber: 1,
        description: "Uploaded reference.",
      }),
    });
    expect(prismaMock.assetReference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: reference.id,
        assetVersionId: version.id,
        referenceType: "front",
        mimeType: "image/png",
      }),
    });
  });

  it("rejects Asset Bible reference persistence when the reference write fails", async () => {
    const repository = await import("@/server/repository");
    const version = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      assetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      versionNumber: 1,
      description: "Uploaded reference.",
      status: "draft" as const,
      createdAt: timestamp.toISOString(),
    };
    const reference = {
      id: "abababab-abab-4aba-8aba-abababababab",
      assetVersionId: version.id,
      referenceType: "front" as const,
      filePath: "storage/projects/project/assets/reference.png",
      mimeType: "image/png",
      thumbnailPath: "storage/projects/project/assets/reference.png",
      createdAt: timestamp.toISOString(),
    };

    prismaMock.assetVersion.create.mockResolvedValue(version);
    prismaMock.assetReference.create.mockRejectedValue(new Error("asset reference write failed"));

    await expect(repository.persistAssetVersionAndReference({ version, reference })).rejects.toThrow(
      "asset reference write failed",
    );
  });

  it("persists typed Asset Bible details through Prisma", async () => {
    const repository = await import("@/server/repository");
    const asset = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "location" as const,
      canonicalName: "Room",
      aliases: [],
      status: "draft" as const,
      isUserEdited: true,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const detail = {
      assetId: asset.id,
      floorPlanNotes: "One practical counter and a back exit.",
      lightingStates: ["day", "night"],
      setDressing: "Warm practical lamps.",
      updatedAt: timestamp.toISOString(),
    };

    prismaMock.asset.update.mockResolvedValue(asset);
    prismaMock.locationDetail.upsert.mockResolvedValue(detail);
    await repository.persistAssetDetailState(asset, detail);

    expect(prismaMock.asset.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: asset.id } }));
    expect(prismaMock.locationDetail.upsert).toHaveBeenCalledWith({
      where: { assetId: asset.id },
      update: expect.objectContaining({
        floorPlanNotes: "One practical counter and a back exit.",
        lightingStates: ["day", "night"],
      }),
      create: expect.objectContaining({
        assetId: asset.id,
        setDressing: "Warm practical lamps.",
      }),
    });
  });

  it("persists project style updates through Prisma", async () => {
    const repository = await import("@/server/repository");
    const style = {
      id: "44444444-4444-4444-8444-444444444444",
      projectId: "33333333-3333-4333-8333-333333333333",
      styleName: "Painterly Noir",
      description: "High contrast production look.",
      colorPalette: ["#111111", "#f8fafc"],
      lightingRules: "Use motivated window light.",
      renderingMedium: "digital painting",
      lensLanguage: "Long lenses for close coverage.",
      negativeConstraints: "Avoid plastic skin.",
      modelPromptFragments: { openai: "cinematic noir" },
      approvalStatus: "approved" as const,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };

    prismaMock.projectStyle.update.mockResolvedValue(style);
    await repository.persistProjectStyleState(style);

    expect(prismaMock.projectStyle.update).toHaveBeenCalledWith({
      where: { projectId: style.projectId },
      data: expect.objectContaining({
        styleName: "Painterly Noir",
        colorPalette: ["#111111", "#f8fafc"],
        modelPromptFragments: { openai: "cinematic noir" },
        approvalStatus: "approved",
      }),
    });
  });

  it("persists storyboard frame writes through Prisma", async () => {
    const repository = await import("@/server/repository");
    const frame = {
      id: "13131313-1313-4131-8131-131313131313",
      shotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      keyframeIndex: 0,
      sketchFilePath: "storage/projects/project/storyboards/sketch.png",
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const version = {
      id: "14141414-1414-4141-8141-141414141414",
      frameId: frame.id,
      versionNumber: 1,
      prompt: "Wide frame of Anna in the room.",
      filePath: "storage/projects/project/storyboards/frame.png",
      thumbnailPath: "storage/projects/project/storyboards/frame-thumb.png",
      status: "approved" as const,
      isStale: false,
      generationJobId: "99999999-9999-4999-8999-999999999999",
      annotations: { library: "fabric-compatible-json" },
      createdAt: timestamp.toISOString(),
    };
    const shot = {
      id: frame.shotId,
      sceneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      shotNumber: 1,
      action: "Anna waits.",
      status: "storyboarded" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const note = {
      id: "15151515-1515-4151-8151-151515151515",
      projectId: "33333333-3333-4333-8333-333333333333",
      authorId: "11111111-1111-4111-8111-111111111111",
      targetType: "frame_version" as const,
      targetId: version.id,
      body: "Composition approved.",
      status: "open" as const,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };

    prismaMock.storyboardFrame.upsert.mockResolvedValue(frame);
    prismaMock.frameVersion.create.mockResolvedValue(version);
    prismaMock.frameVersion.findUnique.mockResolvedValue({ ...version, createdAt: timestamp });
    prismaMock.frameVersion.update.mockResolvedValue(version);
    prismaMock.frameVersion.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.shot.update.mockResolvedValue(shot);
    prismaMock.generationJob.update.mockResolvedValue({ id: version.generationJobId });
    prismaMock.reviewNote.create.mockResolvedValue(note);

    await repository.persistGeneratedFrameVersion({ frame, version, shot });
    await expect(repository.getFrameVersionById(version.id)).resolves.toMatchObject({
      id: version.id,
      frameId: frame.id,
      annotations: { library: "fabric-compatible-json" },
    });
    await repository.persistFrameVersionState(version);
    await repository.persistReviewNoteState(note);

    expect(prismaMock.storyboardFrame.upsert).toHaveBeenCalledWith({
      where: { id: frame.id },
      update: expect.objectContaining({ sketchFilePath: frame.sketchFilePath }),
      create: expect.objectContaining({ id: frame.id, shotId: frame.shotId }),
    });
    expect(prismaMock.frameVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: version.id,
        frameId: frame.id,
        annotations: { library: "fabric-compatible-json" },
      }),
    });
    expect(prismaMock.frameVersion.updateMany).toHaveBeenCalledWith({
      where: { frameId: frame.id, status: "approved", id: { not: version.id } },
      data: { status: "superseded" },
    });
    expect(prismaMock.reviewNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: note.id, targetId: version.id, body: "Composition approved." }),
    });
  });

  it("rejects generated storyboard persistence when the frame-version write fails", async () => {
    const repository = await import("@/server/repository");
    const frame = {
      id: "13131313-1313-4131-8131-131313131313",
      shotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      keyframeIndex: 0,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const version = {
      id: "14141414-1414-4141-8141-141414141414",
      frameId: frame.id,
      versionNumber: 1,
      prompt: "Wide frame of Anna in the room.",
      filePath: "storage/projects/project/storyboards/frame.png",
      thumbnailPath: "storage/projects/project/storyboards/frame-thumb.png",
      status: "draft" as const,
      isStale: false,
      generationJobId: "99999999-9999-4999-8999-999999999999",
      createdAt: timestamp.toISOString(),
    };
    const shot = {
      id: frame.shotId,
      sceneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      shotNumber: 1,
      action: "Anna waits.",
      status: "storyboarded" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    prismaMock.storyboardFrame.upsert.mockResolvedValue(frame);
    prismaMock.frameVersion.create.mockRejectedValue(new Error("frame version write failed"));

    await expect(repository.persistGeneratedFrameVersion({ frame, version, shot })).rejects.toThrow(
      "frame version write failed",
    );
    expect(prismaMock.shot.update).not.toHaveBeenCalled();
    expect(prismaMock.generationJob.update).not.toHaveBeenCalled();
  });

  it("persists video clip writes through Prisma", async () => {
    const repository = await import("@/server/repository");
    const clip = {
      id: "16161616-1616-4161-8161-161616161616",
      shotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const version = {
      id: "17171717-1717-4171-8171-171717171717",
      clipId: clip.id,
      versionNumber: 1,
      prompt: "Shot-by-shot video clip.",
      filePath: "storage/projects/project/videos/clip.mp4",
      thumbnailPath: "storage/projects/project/videos/clip.mp4",
      durationMs: 3000,
      status: "approved" as const,
      isStale: false,
      sourceFrameVersionIds: ["14141414-1414-4141-8141-141414141414"],
      generationJobId: "99999999-9999-4999-8999-999999999999",
      createdAt: timestamp.toISOString(),
    };

    prismaMock.videoClip.upsert.mockResolvedValue(clip);
    prismaMock.videoClip.findFirst.mockResolvedValue(clip);
    prismaMock.clipVersion.create.mockResolvedValue(version);
    prismaMock.clipVersion.findUnique.mockResolvedValue(version);
    prismaMock.clipVersion.update.mockResolvedValue(version);
    prismaMock.clipVersion.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.generationJob.update.mockResolvedValue({ id: version.generationJobId });

    await expect(repository.getClipVersionById(version.id)).resolves.toMatchObject({
      id: version.id,
      clipId: clip.id,
      sourceFrameVersionIds: version.sourceFrameVersionIds,
    });
    await expect(repository.getVideoClipForShot(clip.shotId)).resolves.toMatchObject({ id: clip.id, shotId: clip.shotId });
    await repository.persistGeneratedClipVersion({ clip, version });
    await repository.persistClipVersionState(version);

    expect(prismaMock.videoClip.findFirst).toHaveBeenCalledWith({ where: { shotId: clip.shotId } });
    expect(prismaMock.clipVersion.findUnique).toHaveBeenCalledWith({ where: { id: version.id } });
    expect(prismaMock.videoClip.upsert).toHaveBeenCalledWith({
      where: { id: clip.id },
      update: expect.objectContaining({ shotId: clip.shotId }),
      create: expect.objectContaining({ id: clip.id, shotId: clip.shotId }),
    });
    expect(prismaMock.clipVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: version.id,
        clipId: clip.id,
        sourceFrameVersionIds: version.sourceFrameVersionIds,
      }),
    });
    expect(prismaMock.clipVersion.updateMany).toHaveBeenCalledWith({
      where: { clipId: clip.id, status: "approved", id: { not: version.id } },
      data: { status: "superseded" },
    });
    expect(prismaMock.clipVersion.update).toHaveBeenCalledWith({
      where: { id: version.id },
      data: expect.objectContaining({ status: "approved", isStale: false }),
    });
  });

  it("rejects generated video persistence when the clip-version write fails", async () => {
    const repository = await import("@/server/repository");
    const clip = {
      id: "16161616-1616-4161-8161-161616161616",
      shotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const version = {
      id: "17171717-1717-4171-8171-171717171717",
      clipId: clip.id,
      versionNumber: 1,
      prompt: "Shot-by-shot video clip.",
      filePath: "storage/projects/project/videos/clip.mp4",
      thumbnailPath: "storage/projects/project/videos/clip.mp4",
      durationMs: 3000,
      status: "draft" as const,
      isStale: false,
      sourceFrameVersionIds: ["14141414-1414-4141-8141-141414141414"],
      generationJobId: "99999999-9999-4999-8999-999999999999",
      createdAt: timestamp.toISOString(),
    };
    prismaMock.videoClip.upsert.mockResolvedValue(clip);
    prismaMock.clipVersion.create.mockRejectedValue(new Error("clip version write failed"));

    await expect(repository.persistGeneratedClipVersion({ clip, version })).rejects.toThrow("clip version write failed");
    expect(prismaMock.generationJob.update).not.toHaveBeenCalled();
  });

  it("persists collaboration records through Prisma", async () => {
    const repository = await import("@/server/repository");
    const invitation = {
      id: "18181818-1818-4181-8181-181818181818",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      projectId: "33333333-3333-4333-8333-333333333333",
      email: "artist@example.com",
      tokenHash: "hashed-token",
      scope: "project" as const,
      role: "artist",
      status: "accepted" as const,
      expiresAt: "2026-05-17T12:00:00.000Z",
      invitedById: "11111111-1111-4111-8111-111111111111",
      acceptedAt: timestamp.toISOString(),
      createdAt: timestamp.toISOString(),
    };
    const member = {
      id: "21212121-2121-4212-8212-212121212121",
      projectId: invitation.projectId,
      userId: "22222222-2222-4222-8222-222222222222",
      role: "artist" as const,
      joinedAt: timestamp.toISOString(),
    };
    const assignment = {
      id: "19191919-1919-4191-8191-191919191919",
      projectId: invitation.projectId,
      userId: member.userId,
      targetType: "scene" as const,
      sceneId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "open" as const,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const activity = {
      id: "20202020-2020-4202-8202-202020202020",
      projectId: invitation.projectId,
      actorId: "11111111-1111-4111-8111-111111111111",
      eventType: "assignment_created",
      message: "Assigned scene.",
      metadata: { assignmentId: assignment.id },
      createdAt: timestamp.toISOString(),
    };

    prismaMock.invitation.findUnique.mockResolvedValue({ ...invitation, expiresAt: timestamp, acceptedAt: timestamp, createdAt: timestamp });
    prismaMock.invitation.upsert.mockResolvedValue(invitation);
    prismaMock.projectMember.findUnique.mockResolvedValue({ ...member, joinedAt: timestamp });
    prismaMock.projectMember.upsert.mockResolvedValue(member);
    prismaMock.assignment.upsert.mockResolvedValue(assignment);
    prismaMock.activityEvent.create.mockResolvedValue(activity);

    await expect(repository.findInvitationByTokenHash("hashed-token")).resolves.toMatchObject({ id: invitation.id });
    await expect(repository.getProjectMemberForUser(member.projectId, member.userId)).resolves.toMatchObject({
      id: member.id,
      role: "artist",
      joinedAt: timestamp.toISOString(),
    });
    await repository.persistInvitationState(invitation);
    await repository.persistProjectMemberState(member);
    await repository.persistAssignmentState(assignment);
    await repository.persistActivityEventState(activity);

    expect(prismaMock.invitation.upsert).toHaveBeenCalledWith({
      where: { id: invitation.id },
      update: expect.objectContaining({ status: "accepted", acceptedAt: expect.any(Date) }),
      create: expect.objectContaining({ id: invitation.id, tokenHash: "hashed-token" }),
    });
    expect(prismaMock.projectMember.upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: member.projectId, userId: member.userId } },
      update: { role: "artist" },
      create: expect.objectContaining({ id: member.id, role: "artist" }),
    });
    expect(prismaMock.assignment.upsert).toHaveBeenCalledWith({
      where: { id: assignment.id },
      update: expect.objectContaining({ targetType: "scene", sceneId: assignment.sceneId }),
      create: expect.objectContaining({ id: assignment.id, status: "open" }),
    });
    expect(prismaMock.activityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: activity.id,
        eventType: "assignment_created",
        metadata: { assignmentId: assignment.id },
      }),
    });
  });

  it("rejects collaboration persistence when an assignment write fails", async () => {
    const repository = await import("@/server/repository");
    const assignment = {
      id: "19191919-1919-4191-8191-191919191919",
      projectId: "33333333-3333-4333-8333-333333333333",
      userId: "22222222-2222-4222-8222-222222222222",
      targetType: "shot" as const,
      shotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "open" as const,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    prismaMock.assignment.upsert.mockRejectedValue(new Error("assignment write failed"));

    await expect(repository.persistAssignmentState(assignment)).rejects.toThrow("assignment write failed");
  });

  it("persists and lists export bundle records through Prisma", async () => {
    const repository = await import("@/server/repository");
    const bundle = {
      id: "23232323-2323-4232-8232-232323232323",
      projectId: "33333333-3333-4333-8333-333333333333",
      bundleVersion: 1,
      manifestPath: "storage/projects/project/exports/project.assemblyline-bundle.json",
      mediaFileCount: 3,
      metadataRecordCount: 24,
      createdById: "11111111-1111-4111-8111-111111111111",
      generationJobId: "99999999-9999-4999-8999-999999999999",
      createdAt: timestamp.toISOString(),
    };
    prismaMock.exportBundle.create.mockResolvedValue(bundle);
    prismaMock.exportBundle.findMany.mockResolvedValue([{ ...bundle, createdAt: timestamp }]);

    await repository.addExportBundle(bundle);
    await expect(repository.listExportBundles(bundle.projectId)).resolves.toEqual([
      expect.objectContaining({ id: bundle.id, manifestPath: bundle.manifestPath }),
    ]);

    expect(prismaMock.exportBundle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: bundle.id,
        projectId: bundle.projectId,
        manifestPath: bundle.manifestPath,
        mediaFileCount: 3,
      }),
    });
    expect(prismaMock.exportBundle.findMany).toHaveBeenCalledWith({
      where: { projectId: bundle.projectId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("rejects export bundle persistence when the Prisma write fails", async () => {
    const repository = await import("@/server/repository");
    const bundle = {
      id: "23232323-2323-4232-8232-232323232323",
      projectId: "33333333-3333-4333-8333-333333333333",
      bundleVersion: 1,
      manifestPath: "storage/projects/project/exports/project.assemblyline-bundle.json",
      mediaFileCount: 3,
      metadataRecordCount: 24,
      createdById: "11111111-1111-4111-8111-111111111111",
      createdAt: timestamp.toISOString(),
    };
    prismaMock.exportBundle.create.mockRejectedValue(new Error("export bundle write failed"));

    await expect(repository.addExportBundle(bundle)).rejects.toThrow("export bundle write failed");
  });

  it("persists imported project graph records through Prisma", async () => {
    const repository = await import("@/server/repository");
    const projectId = "33333333-3333-4333-8333-333333333333";
    const script = {
      id: "99999999-9999-4999-8999-999999999999",
      projectId,
      filename: "imported.txt",
      createdAt: timestamp.toISOString(),
    };
    const activeVersion = {
      id: "88888888-8888-4888-8888-888888888888",
      scriptId: script.id,
      versionNumber: 1,
      filePath: "storage/projects/import/uploads/imported.txt",
      rawText: "INT. ROOM - DAY",
      analysisStatus: "complete" as const,
      isActive: true,
      createdAt: timestamp.toISOString(),
    };
    const scene = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scriptVersionId: activeVersion.id,
      sceneNumber: 1,
      heading: "INT. ROOM - DAY",
      summary: "Imported room.",
      scriptStartLine: 1,
      scriptEndLine: 1,
      status: "ready" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const shot = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sceneId: scene.id,
      shotNumber: 1,
      action: "Imported action.",
      status: "storyboarded" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const asset = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      projectId,
      type: "location" as const,
      canonicalName: "Room",
      aliases: [],
      status: "approved" as const,
      isUserEdited: false,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const assetVersion = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      assetId: asset.id,
      versionNumber: 1,
      status: "draft" as const,
      createdAt: timestamp.toISOString(),
    };
    const assetReference = {
      id: "abababab-abab-4aba-8aba-abababababab",
      assetVersionId: assetVersion.id,
      referenceType: "front" as const,
      filePath: "storage/projects/import/assets/reference.png",
      mimeType: "image/png",
      thumbnailPath: "storage/projects/import/assets/reference.png",
      createdAt: timestamp.toISOString(),
    };
    const frame = {
      id: "13131313-1313-4131-8131-131313131313",
      shotId: shot.id,
      keyframeIndex: 0,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const frameVersion = {
      id: "14141414-1414-4141-8141-141414141414",
      frameId: frame.id,
      versionNumber: 1,
      prompt: "Imported frame.",
      filePath: "storage/projects/import/storyboards/frame.png",
      status: "approved" as const,
      isStale: false,
      createdAt: timestamp.toISOString(),
    };
    const clip = {
      id: "16161616-1616-4161-8161-161616161616",
      shotId: shot.id,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    const clipVersion = {
      id: "17171717-1717-4171-8171-171717171717",
      clipId: clip.id,
      versionNumber: 1,
      prompt: "Imported clip.",
      filePath: "storage/projects/import/videos/clip.mp4",
      durationMs: 3000,
      status: "draft" as const,
      isStale: false,
      sourceFrameVersionIds: [frameVersion.id],
      createdAt: timestamp.toISOString(),
    };
    const note = {
      id: "15151515-1515-4151-8151-151515151515",
      projectId,
      authorId: "11111111-1111-4111-8111-111111111111",
      targetType: "frame_version" as const,
      targetId: frameVersion.id,
      body: "Imported note.",
      status: "open" as const,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    [
      prismaMock.script.createMany,
      prismaMock.scriptVersion.createMany,
      prismaMock.scene.createMany,
      prismaMock.shot.createMany,
      prismaMock.asset.createMany,
      prismaMock.assetVersion.createMany,
      prismaMock.assetReference.createMany,
      prismaMock.sceneAssetReq.createMany,
      prismaMock.shotAssetReq.createMany,
      prismaMock.storyboardFrame.createMany,
      prismaMock.frameVersion.createMany,
      prismaMock.videoClip.createMany,
      prismaMock.clipVersion.createMany,
      prismaMock.reviewNote.createMany,
    ].forEach((mock) => mock.mockResolvedValue({ count: 1 }));

    await repository.persistImportedProjectGraph({
      scripts: [script],
      activeVersion,
      scenes: [scene],
      shots: [shot],
      assets: [asset],
      assetDetails: [],
      assetVersions: [assetVersion],
      assetReferences: [assetReference],
      storyboardFrames: [frame],
      frameVersions: [frameVersion],
      reviewNotes: [note],
      videoClips: [clip],
      clipVersions: [clipVersion],
      invitations: [],
      assignments: [],
      activityEvents: [],
      sceneAssetRequirements: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sceneId: scene.id, assetId: asset.id, isOptional: false, detectedBy: "user", createdAt: timestamp.toISOString() }],
      shotAssetRequirements: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", shotId: shot.id, assetId: asset.id, isOptional: false, detectedBy: "user", createdAt: timestamp.toISOString() }],
      jobs: [],
      events: [],
    });

    expect(prismaMock.script.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: script.id, projectId })],
      skipDuplicates: true,
    });
    expect(prismaMock.scene.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ id: scene.id })] }));
    expect(prismaMock.asset.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ id: asset.id })] }));
    expect(prismaMock.frameVersion.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ id: frameVersion.id })] }));
    expect(prismaMock.clipVersion.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ sourceFrameVersionIds: [frameVersion.id] })] }));
    expect(prismaMock.reviewNote.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ authorId: note.authorId })] }));
  });

  it("replays project events from Prisma after the last event id", async () => {
    const repository = await import("@/server/repository");
    const firstEvent = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      jobId: "99999999-9999-4999-8999-999999999999",
      projectId: "33333333-3333-4333-8333-333333333333",
      eventType: "status_change",
      message: "Job queued.",
      progressPct: 0,
      createdAt: timestamp,
    };
    const secondEvent = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      jobId: firstEvent.jobId,
      projectId: firstEvent.projectId,
      eventType: "progress",
      message: "Analysis running.",
      progressPct: 50,
      createdAt: new Date(timestamp.getTime() + 1000),
    };

    prismaMock.jobEvent.findMany.mockResolvedValue([firstEvent, secondEvent]);

    await expect(repository.listProjectEvents(firstEvent.projectId, firstEvent.id)).resolves.toEqual([
      expect.objectContaining({
        id: secondEvent.id,
        message: "Analysis running.",
        progressPct: 50,
      }),
    ]);
    expect(prismaMock.jobEvent.findMany).toHaveBeenCalledWith({
      where: { projectId: firstEvent.projectId },
      orderBy: { createdAt: "asc" },
    });
  });
});
