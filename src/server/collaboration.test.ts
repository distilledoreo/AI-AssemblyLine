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

    const invite = createInvitation({
      workspaceId: workspace.id,
      projectId: project.id,
      email: artist.email,
      role: "artist",
      invitedById: owner.id,
    });
    acceptInvitation(invite.token, artist.id);
    assignProjectTarget({
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

    addProjectMember({ projectId: project.id, userId: reviewer.id, role: "reviewer", actorId: owner.id });
    await transitionAssetStatus(graph.assets[0].id, "locked");

    await expect(upsertAssetDetail(graph.assets[0].id, { narrativeDescription: "Change" })).rejects.toThrow(/locked/);
    expect(getScriptAnalysisGraph(project.id).activityEvents.at(-1)?.eventType).toBe("member_updated");
  });
});
