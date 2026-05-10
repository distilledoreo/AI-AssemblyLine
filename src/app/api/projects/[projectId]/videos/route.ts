import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole, getScriptAnalysisGraphForProject } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { generateVideoClip, updateClipVersion } from "@/server/video";

const videoActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    mode: z.enum(["shot", "scene"]),
    shotId: z.string().uuid().optional(),
    sceneId: z.string().uuid().optional(),
    providerSlug: z.enum(["runway", "kling"]).default("runway"),
  }),
  z.object({
    action: z.literal("clip"),
    clipVersionId: z.string().uuid(),
    status: z.enum(["draft", "needs_review", "approved", "rejected", "superseded", "stale"]),
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
    const body = videoActionSchema.parse(await request.json());
    if (body.action === "generate") {
      assertProjectPermission(await getProjectRole(user.id, projectId), "generate_video_clips");
      return Response.json(await generateVideoClip({ projectId, ...body }));
    }
    assertProjectPermission(await getProjectRole(user.id, projectId), "approve_reject_clips");
    return Response.json(await updateClipVersion({ projectId, clipVersionId: body.clipVersionId, status: body.status }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
