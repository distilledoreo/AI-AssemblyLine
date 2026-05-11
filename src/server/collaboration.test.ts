import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import { projectRoleCan } from "@/server/rbac";
import {
  acceptInvitation,
  addProjectMember,
  assignProjectTarget,
  createInvitation,
} from "@/server/collaboration";
import { transitionAssetStatus, upsertAssetDetail } from "@/server/assetBible";
import { uploadScriptForProject } from "@/server/scriptAnalysis";

describe("collaboration workflow", () => {
  beforeEach(() => resetStoreForTests());

  it("creates signed invitations, accepts them, assigns work, and records activity", async () => {
    const { user: owner } = await signInWithCredentials({ email: "owner@example.com", password: "assemblyline" });
    const { user: artist } = await signInWithCredentials({ email: "artist@example.com", password: "assemblyline" });
    const workspace = await createWorkspaceForUser(owner.id, { name: "Team" });
    const project = await createProjectForWorkspace(owner.id, { workspaceId: workspace.id, title: "Team Project" });
    const graph = await uploadScriptForProject({
      projectId: project.id,
      filename: "team.txt",
      text: "INT. ROOM - DAY\nANNA\nAnna waits.",
    });

    const invite = await createInvitation({
      workspaceId: workspace.id,
      projectId: project.id,
      email: artist.email,
      role: "artist",
      invitedById: owner.id,
    });
    await acceptInvitation(invite.token, artist.id);
    await assignProjectTarget({
      projectId: project.id,
      userId: artist.id,
      targetType: "scene",
      sceneId: graph.scenes[0].id,
      actorId: owner.id,
    });

    const updated = getScriptAnalysisGraph(project.id);
    expect(updated.invitations[0].status).toBe("accepted");
    expect(updated.assignments[0].userId).toBe(artist.id);
    expect(updated.activityEvents.map((event) => event.eventType)).toContain("assignment_created");
    expect(projectRoleCan("artist", "generate_storyboard_frames")).toBe(true);
    expect(projectRoleCan("viewer", "generate_storyboard_frames")).toBe(false);
  });

  it("enforces locked asset edit warnings and member role updates", async () => {
    const { user: owner } = await signInWithCredentials({ email: "owner2@example.com", password: "assemblyline" });
    const { user: reviewer } = await signInWithCredentials({ email: "reviewer@example.com", password: "assemblyline" });
    const workspace = await createWorkspaceForUser(owner.id, { name: "Locked" });
    const project = await createProjectForWorkspace(owner.id, { workspaceId: workspace.id, title: "Locked" });
    const graph = await uploadScriptForProject({
      projectId: project.id,
      filename: "locked.txt",
      text: "INT. ROOM - DAY\nANNA\nAnna waits.",
    });

    await addProjectMember({ projectId: project.id, userId: reviewer.id, role: "reviewer", actorId: owner.id });
    await transitionAssetStatus(project.id, graph.assets[0].id, "locked");

    await expect(upsertAssetDetail(project.id, graph.assets[0].id, { narrativeDescription: "Change" })).rejects.toThrow(/locked/);
    expect(getScriptAnalysisGraph(project.id).activityEvents.at(-1)?.eventType).toBe("member_updated");
  });

  it("rejects assignments to non-members, mismatched targets, and cross-project targets", async () => {
    const { user: owner } = await signInWithCredentials({ email: "assignment-owner@example.com", password: "assemblyline" });
    const { user: artist } = await signInWithCredentials({ email: "assignment-artist@example.com", password: "assemblyline" });
    const { user: outsider } = await signInWithCredentials({ email: "assignment-outsider@example.com", password: "assemblyline" });
    const workspace = await createWorkspaceForUser(owner.id, { name: "Assignments" });
    const firstProject = await createProjectForWorkspace(owner.id, { workspaceId: workspace.id, title: "First Assignment Project" });
    const firstGraph = await uploadScriptForProject({
      projectId: firstProject.id,
      filename: "first.txt",
      text: "INT. ROOM - DAY\nANNA\nAnna waits.",
    });
    const secondProject = await createProjectForWorkspace(owner.id, { workspaceId: workspace.id, title: "Second Assignment Project" });
    const secondGraph = await uploadScriptForProject({
      projectId: secondProject.id,
      filename: "second.txt",
      text: "INT. HALL - NIGHT\nDAVID\nDavid listens.",
    });
    await addProjectMember({ projectId: secondProject.id, userId: artist.id, role: "artist", actorId: owner.id });

    await expect(
      assignProjectTarget({
        projectId: secondProject.id,
        userId: outsider.id,
        targetType: "scene",
        sceneId: secondGraph.scenes[0].id,
        actorId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      assignProjectTarget({
        projectId: secondProject.id,
        userId: artist.id,
        targetType: "scene",
        shotId: secondGraph.shots[0].id,
        actorId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_assignment_target" });
    await expect(
      assignProjectTarget({
        projectId: secondProject.id,
        userId: artist.id,
        targetType: "scene",
        sceneId: firstGraph.scenes[0].id,
        actorId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(getScriptAnalysisGraph(secondProject.id).assignments).toHaveLength(0);
  });
});
