import { z } from "zod";
import { AppError, toErrorResponse } from "@/server/errors";
import { getProjectRole } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { runScriptAnalysis, uploadScriptForProject } from "@/server/scriptAnalysis";

const uploadScriptSchema = z.object({
  filename: z.string().min(1).default("script.txt"),
  text: z.string().min(10),
});

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "upload_script");
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new AppError("Script upload requires a file.", 400, "missing_upload_file");
      }
      const graph = await uploadScriptForProject({
        projectId,
        filename: file.name,
        text: await file.text(),
      });
      return Response.json(graph, { status: 201 });
    }

    const body = uploadScriptSchema.parse(await request.json());
    const graph = await uploadScriptForProject({ projectId, ...body });
    return Response.json(graph, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "run_script_analysis");
    return Response.json(await runScriptAnalysis(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
