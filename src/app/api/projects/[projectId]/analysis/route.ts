import { toErrorResponse } from "@/server/errors";
import { getProjectRole, getScriptAnalysisGraph } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(getProjectRole(user.id, projectId), "view_project_dashboard");
    return Response.json(getScriptAnalysisGraph(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
