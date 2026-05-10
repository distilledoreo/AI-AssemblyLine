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
    findMany: vi.fn(),
    update: vi.fn(),
  },
  jobEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  script: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  scriptVersion: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  scene: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  shot: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  asset: {
    create: vi.fn(),
    findFirst: vi.fn(),
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
    findMany: vi.fn(),
  },
  assetReference: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  sceneAssetReq: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  shotAssetReq: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
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
    expect(await repository.listProviderKeys(createdWorkspace.id)).toHaveLength(1);
  });

  it("mirrors generation jobs and job events into Prisma in production repository mode", async () => {
    prismaMock.generationJob.create.mockResolvedValue({});
    prismaMock.generationJob.update.mockResolvedValue({});
    prismaMock.jobEvent.create.mockResolvedValue({});

    const repository = await import("@/server/repository");
    const job = repository.createGenerationJob({
      projectId: "33333333-3333-4333-8333-333333333333",
      type: "script_analysis",
      providerSlug: "local-mock",
      modelId: "deterministic-script-pass-v1",
      inputPayload: {
        projectId: "33333333-3333-4333-8333-333333333333",
        scriptVersionId: "88888888-8888-4888-8888-888888888888",
      },
    });
    repository.completeGenerationJob(job.id, {
      status: "complete",
      outputPayload: { scenes: 1, shots: 1, assets: 2 },
    });

    await vi.waitFor(() => expect(prismaMock.generationJob.create).toHaveBeenCalled());
    await vi.waitFor(() => expect(prismaMock.jobEvent.create).toHaveBeenCalled());
    await vi.waitFor(() => expect(prismaMock.generationJob.update).toHaveBeenCalled());

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

  it("persists uploaded script versions through Prisma while mirroring the local graph", async () => {
    prismaMock.script.findFirst.mockResolvedValue(undefined);
    prismaMock.script.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: timestamp,
    }));
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
    prismaMock.sceneAssetReq.createMany.mockResolvedValue({ count: 1 });
    prismaMock.sceneAssetReq.deleteMany.mockResolvedValue({ count: 1 });

    await repository.persistAssetState(asset);
    await repository.persistSceneAssetRequirement(requirement);
    await repository.deleteSceneAssetRequirement(requirement.id);

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
});
