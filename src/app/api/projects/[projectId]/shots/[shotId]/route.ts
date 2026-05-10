import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { updateShot } from "@/server/scriptAnalysis";

const shotUpdateSchema = z.object({
  action: z.string().min(1).optional(),
  cameraAngle: z.string().optional(),
  cameraMovement: z.string().optional(),
  lensNotes: z.string().optional(),
  lightingNotes: z.string().optional(),
  userDirection: z.string().optional(),
  status: z.enum(["blocked", "ready", "storyboarded", "video_ready", "complete", "superseded"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; shotId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { projectId, shotId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_scene_shot_metadata");
    return Response.json({ shot: await updateShot(shotId, shotUpdateSchema.parse(await request.json())) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
