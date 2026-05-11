import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { updateScene } from "@/server/scriptAnalysis";

const sceneUpdateSchema = z.object({
  heading: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  locationHint: z.string().optional(),
  status: z.enum(["blocked", "ready", "in_progress", "complete", "superseded"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; sceneId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { projectId, sceneId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_scene_shot_metadata");
    return Response.json({ scene: await updateScene(projectId, sceneId, sceneUpdateSchema.parse(await request.json())) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
