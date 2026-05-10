import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import {
  deleteProject,
  getProjectDashboard,
  getProjectRole,
  updateProject,
} from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";

const updateProjectSchema = z.object({
  title: z.string().min(2).optional(),
  targetFormat: z.string().optional(),
  aspectRatio: z.string().optional(),
  estimatedRuntime: z.number().int().positive().optional(),
  rightsPolicy: z.enum(["unrestricted", "no_real_people", "client_owned", "custom"]).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "view_project_dashboard");
    return Response.json(await getProjectDashboard(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_project_settings");
    const body = updateProjectSchema.parse(await request.json());
    return Response.json({ project: await updateProject(projectId, body) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "delete_project");
    await deleteProject(projectId);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
