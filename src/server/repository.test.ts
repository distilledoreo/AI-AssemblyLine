import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  decryptWorkspaceProviderKey,
  deleteProject,
  getProjectDashboard,
  getProjectRole,
  getOptionalSessionUser,
  getStore,
  listProjectsForUser,
  listProviderKeys,
  listWorkspacesForUser,
  persistImportedProjectGraph,
  resetStoreForTests,
  saveProviderKey,
  signInWithCredentials,
  updateProject,
} from "@/server/repository";

describe("foundation repository flows", () => {
  beforeEach(() => resetStoreForTests());

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs in a user and creates workspace/project ownership", async () => {
    const { user, session } = await signInWithCredentials({
      email: "creator@example.com",
      password: "assemblyline",
    });
    const workspace = await createWorkspaceForUser(user.id, { name: "Studio Workspace" });
    const project = await createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Pilot Short",
    });

    expect(session.token).toBeTruthy();
    expect(await listWorkspacesForUser(user.id)).toHaveLength(1);
    expect(await listProjectsForUser(user.id)).toHaveLength(1);
    expect(await getProjectRole(user.id, project.id)).toBe("owner");
    expect((await getProjectDashboard(project.id)).style?.approvalStatus).toBe("draft");
    expect((await getOptionalSessionUser(session.token))?.id).toBe(user.id);
    expect(await getOptionalSessionUser("stale-session-token")).toBeUndefined();
  });

  it("updates and deletes projects through the CRUD service", async () => {
    const { user } = await signInWithCredentials({
      email: "producer@example.com",
      password: "assemblyline",
    });
    const workspace = await createWorkspaceForUser(user.id, { name: "Production" });
    const project = await createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Original Title",
    });

    await updateProject(project.id, { title: "Locked Cut", aspectRatio: "2.39:1" });
    expect((await getProjectDashboard(project.id)).project.title).toBe("Locked Cut");
    expect((await getProjectDashboard(project.id)).project.aspectRatio).toBe("2.39:1");

    await deleteProject(project.id);
    expect(await listProjectsForUser(user.id)).toHaveLength(0);
  });

  it("stores provider keys encrypted and returns only masked client data", async () => {
    const { user } = await signInWithCredentials({
      email: "owner@example.com",
      password: "assemblyline",
    });
    const workspace = await createWorkspaceForUser(user.id, { name: "Keys Workspace" });

    const clientKey = await saveProviderKey(workspace.id, {
      providerSlug: "openai",
      apiKey: "sk-openai-phase1-secret",
      label: "OpenAI",
    });

    expect(clientKey.maskedKey).toBe("sk-o...cret");
    expect(JSON.stringify(clientKey)).not.toContain("phase1-secret");
    expect(await decryptWorkspaceProviderKey(workspace.id, "openai")).toBe("sk-openai-phase1-secret");
    expect(await listProviderKeys(workspace.id)).toHaveLength(1);
  });

  it("rejects mock provider keys in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      saveProviderKey("00000000-0000-4000-8000-000000000000", {
        providerSlug: "openai",
        apiKey: "mock",
      }),
    ).rejects.toMatchObject({ code: "provider_key_missing" });
    await expect(
      saveProviderKey("00000000-0000-4000-8000-000000000000", {
        providerSlug: "stability",
        apiKey: " MOCK ",
      }),
    ).rejects.toMatchObject({ code: "provider_key_missing" });
  });

  it("rejects provider keys for adapters that are not live-wired", async () => {
    const { user } = await signInWithCredentials({
      email: "unsupported-provider@example.com",
      password: "assemblyline",
    });
    const workspace = await createWorkspaceForUser(user.id, { name: "Provider Guard" });

    await expect(
      saveProviderKey(workspace.id, {
        providerSlug: "replicate",
        apiKey: "r8-live-test",
      }),
    ).rejects.toMatchObject({ code: "unsupported_provider" });
  });

  it("normalizes a hot-reloaded store created before later phase fields existed", () => {
    globalThis.__assemblyLineStore = { ...getStore(), scripts: undefined } as unknown as ReturnType<typeof getStore>;

    expect(getStore().scripts).toEqual([]);
  });

  it("mirrors imported project graph records through the repository in local mode", async () => {
    const createdAt = "2026-01-01T00:00:00.000Z";
    const script = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      filename: "import.txt",
      createdAt,
    };
    const activeVersion = {
      id: "33333333-3333-4333-8333-333333333333",
      scriptId: script.id,
      versionNumber: 1,
      filePath: "storage/projects/import/scripts/import.txt",
      rawText: "INT. LAB - NIGHT",
      analysisStatus: "complete" as const,
      isActive: true,
      createdAt,
    };
    const scene = {
      id: "44444444-4444-4444-8444-444444444444",
      scriptVersionId: activeVersion.id,
      sceneNumber: 1,
      heading: "INT. LAB - NIGHT",
      summary: "A test import scene.",
      scriptStartLine: 1,
      scriptEndLine: 1,
      status: "ready" as const,
      createdAt,
      updatedAt: createdAt,
    };
    const asset = {
      id: "55555555-5555-4555-8555-555555555555",
      projectId: script.projectId,
      type: "prop" as const,
      canonicalName: "Silver Key",
      aliases: [],
      status: "approved" as const,
      continuityNotes: "",
      negativePrompts: "",
      createdAt,
      updatedAt: createdAt,
    };
    const detail = {
      assetId: asset.id,
      role: "hero prop",
    };

    await persistImportedProjectGraph({
      scripts: [script],
      activeVersion,
      scenes: [scene],
      shots: [],
      assets: [asset],
      assetDetails: [detail],
      assetVersions: [],
      assetReferences: [],
      storyboardFrames: [],
      frameVersions: [],
      reviewNotes: [],
      videoClips: [],
      clipVersions: [],
      invitations: [],
      assignments: [],
      activityEvents: [],
      sceneAssetRequirements: [],
      shotAssetRequirements: [],
      jobs: [],
      events: [],
    });
    await persistImportedProjectGraph({
      scripts: [script],
      activeVersion,
      scenes: [scene],
      shots: [],
      assets: [asset],
      assetDetails: [detail],
      assetVersions: [],
      assetReferences: [],
      storyboardFrames: [],
      frameVersions: [],
      reviewNotes: [],
      videoClips: [],
      clipVersions: [],
      invitations: [],
      assignments: [],
      activityEvents: [],
      sceneAssetRequirements: [],
      shotAssetRequirements: [],
      jobs: [],
      events: [],
    });

    expect(getStore().scripts).toHaveLength(1);
    expect(getStore().scriptVersions).toHaveLength(1);
    expect(getStore().scenes).toHaveLength(1);
    expect(getStore().assets).toHaveLength(1);
    expect(getStore().assetDetails).toEqual([detail]);
  });
});
