import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProject, getProjectRole, getScriptAnalysisGraphForProject } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { acceptInvitation, addProjectMember, assignProjectTarget, createInvitation } from "@/server/collaboration";

const collaborationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().email(), role: z.enum(["producer", "artist", "reviewer", "viewer"]) }),
  z.object({ action: z.literal("accept"), token: z.string().min(10) }),
  z.object({ action: z.literal("member"), userId: z.string().uuid(), role: z.enum(["owner", "producer", "artist", "reviewer", "viewer"]) }),
  z.object({
    action: z.literal("assign"),
    userId: z.string().uuid(),
    targetType: z.enum(["scene", "shot", "asset"]),
    sceneId: z.string().uuid().optional(),
    shotId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
  }),
]);

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "view_project_dashboard");
    return Response.json(await getScriptAnalysisGraphForProject(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    const body = collaborationActionSchema.parse(await request.json());
    if (body.action === "accept") {
      acceptInvitation(body.token, user.id);
      return Response.json(await getScriptAnalysisGraphForProject(projectId));
    }
    assertProjectPermission(await getProjectRole(user.id, projectId), "manage_project_members");
    if (body.action === "invite") {
      const project = await getProject(projectId);
      const result = createInvitation({ workspaceId: project!.workspaceId, projectId, email: body.email, role: body.role, invitedById: user.id });
      return Response.json({ ...(await getScriptAnalysisGraphForProject(projectId)), inviteToken: result.token }, { status: 201 });
    }
    if (body.action === "member") addProjectMember({ projectId, userId: body.userId, role: body.role, actorId: user.id });
    if (body.action === "assign") assignProjectTarget({ projectId, userId: body.userId, targetType: body.targetType, sceneId: body.sceneId, shotId: body.shotId, assetId: body.assetId, actorId: user.id });
    return Response.json(await getScriptAnalysisGraphForProject(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
