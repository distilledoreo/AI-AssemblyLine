import { beforeEach, describe, expect, it } from "vitest";
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
  resetStoreForTests,
  saveProviderKey,
  signInWithCredentials,
  updateProject,
} from "@/server/repository";

describe("foundation repository flows", () => {
  beforeEach(() => resetStoreForTests());

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

  it("normalizes a hot-reloaded store created before later phase fields existed", () => {
    globalThis.__assemblyLineStore = { ...getStore(), scripts: undefined } as unknown as ReturnType<typeof getStore>;

    expect(getStore().scripts).toEqual([]);
  });
});
