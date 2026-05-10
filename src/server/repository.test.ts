import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  decryptWorkspaceProviderKey,
  deleteProject,
  getProjectDashboard,
  getProjectRole,
  getOptionalSessionUser,
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
    const workspace = createWorkspaceForUser(user.id, { name: "Studio Workspace" });
    const project = await createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Pilot Short",
    });

    expect(session.token).toBeTruthy();
    expect(listWorkspacesForUser(user.id)).toHaveLength(1);
    expect(listProjectsForUser(user.id)).toHaveLength(1);
    expect(getProjectRole(user.id, project.id)).toBe("owner");
    expect(getProjectDashboard(project.id).style?.approvalStatus).toBe("draft");
    expect(getOptionalSessionUser(session.token)?.id).toBe(user.id);
    expect(getOptionalSessionUser("stale-session-token")).toBeUndefined();
  });

  it("updates and deletes projects through the CRUD service", async () => {
    const { user } = await signInWithCredentials({
      email: "producer@example.com",
      password: "assemblyline",
    });
    const workspace = createWorkspaceForUser(user.id, { name: "Production" });
    const project = await createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Original Title",
    });

    updateProject(project.id, { title: "Locked Cut", aspectRatio: "2.39:1" });
    expect(getProjectDashboard(project.id).project.title).toBe("Locked Cut");
    expect(getProjectDashboard(project.id).project.aspectRatio).toBe("2.39:1");

    deleteProject(project.id);
    expect(listProjectsForUser(user.id)).toHaveLength(0);
  });

  it("stores provider keys encrypted and returns only masked client data", async () => {
    const { user } = await signInWithCredentials({
      email: "owner@example.com",
      password: "assemblyline",
    });
    const workspace = createWorkspaceForUser(user.id, { name: "Keys Workspace" });

    const clientKey = saveProviderKey(workspace.id, {
      providerSlug: "openai",
      apiKey: "sk-openai-phase1-secret",
      label: "OpenAI",
    });

    expect(clientKey.maskedKey).toBe("sk-o...cret");
    expect(JSON.stringify(clientKey)).not.toContain("phase1-secret");
    expect(decryptWorkspaceProviderKey(workspace.id, "openai")).toBe("sk-openai-phase1-secret");
    expect(listProviderKeys(workspace.id)).toHaveLength(1);
  });
});
