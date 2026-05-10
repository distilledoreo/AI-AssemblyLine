import { z } from "zod";
import { getRemainingAdapterCapabilities } from "@/providers/extendedAdapters";
import { toErrorResponse } from "@/server/errors";
import { exportProjectBundle, importProjectBundle } from "@/server/exportImport";
import { getProjectJobMetrics } from "@/server/observability";
import { getProjectRole, getScriptAnalysisGraph, listExportBundles } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { cleanupOrphanFiles, clearThumbnailCache, getProjectStorageUsage } from "@/server/storageManagement";

const operationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("export") }),
  z.object({ action: z.literal("import"), manifestPath: z.string().min(3) }),
  z.object({ action: z.literal("cleanup_orphans") }),
  z.object({ action: z.literal("clear_thumbnails") }),
]);

async function operationsPayload(projectId: string) {
  const [storage, metrics] = await Promise.all([getProjectStorageUsage(projectId), getProjectJobMetrics(projectId)]);
  return {
    graph: getScriptAnalysisGraph(projectId),
    bundles: listExportBundles(projectId),
    storage,
    metrics,
    adapters: getRemainingAdapterCapabilities(),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "view_project_dashboard");
    return Response.json(await operationsPayload(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    const body = operationSchema.parse(await request.json());
    if (body.action === "export") {
      assertProjectPermission(await getProjectRole(user.id, projectId), "export_project");
      const exported = await exportProjectBundle({ projectId, userId: user.id });
      return Response.json({ ...(await operationsPayload(projectId)), export: exported }, { status: 201 });
    }
    if (body.action === "import") {
      assertProjectPermission(await getProjectRole(user.id, projectId), "export_project");
      const imported = await importProjectBundle({ userId: user.id, manifestPath: body.manifestPath });
      return Response.json({ ...(await operationsPayload(projectId)), import: imported }, { status: 201 });
    }
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_project_settings");
    if (body.action === "cleanup_orphans") {
      return Response.json({ ...(await operationsPayload(projectId)), cleanup: await cleanupOrphanFiles(projectId) });
    }
    return Response.json({ ...(await operationsPayload(projectId)), thumbnails: await clearThumbnailCache(projectId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
