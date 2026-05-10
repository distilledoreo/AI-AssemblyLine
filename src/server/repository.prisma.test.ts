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
  providerKey: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
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
});
