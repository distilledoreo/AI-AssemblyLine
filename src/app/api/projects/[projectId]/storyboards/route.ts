import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole, getScriptAnalysisGraphForProject } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { addFrameComment, attachSketch, generateStoryboardFrame, updateFrameVersion } from "@/server/storyboard";

const storyboardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    shotId: z.string().uuid(),
    keyframeIndex: z.number().int().min(0).max(8).default(0),
    userDirection: z.string().optional(),
  }),
  z.object({
    action: z.literal("frame"),
    frameVersionId: z.string().uuid(),
    status: z.enum(["draft", "needs_review", "approved", "rejected", "superseded", "stale"]).optional(),
    annotations: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({ action: z.literal("comment"), frameVersionId: z.string().uuid(), body: z.string().min(1) }),
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
    assertProjectPermission(await getProjectRole(user.id, projectId), "generate_storyboard_frames");

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Sketch upload requires a file.");
      return Response.json(
        await attachSketch({
          projectId,
          shotId: String(form.get("shotId")),
          fileName: file.name,
          mimeType: file.type,
          data: Buffer.from(await file.arrayBuffer()),
        }),
        { status: 201 },
      );
    }

    const body = storyboardActionSchema.parse(await request.json());
    if (body.action === "generate") return Response.json(await generateStoryboardFrame({ projectId, ...body }));
    if (body.action === "frame") return Response.json(await updateFrameVersion({ projectId, ...body }));
    if (body.action === "comment") {
      await addFrameComment({ projectId, authorId: user.id, frameVersionId: body.frameVersionId, body: body.body });
      return Response.json(await getScriptAnalysisGraphForProject(projectId), { status: 201 });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
