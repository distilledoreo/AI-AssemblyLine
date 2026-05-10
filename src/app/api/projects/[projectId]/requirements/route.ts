import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { addSceneAssetRequirement, removeSceneAssetRequirement } from "@/server/scriptAnalysis";

const addRequirementSchema = z.object({
  sceneId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_asset_requirements");
    const body = addRequirementSchema.parse(await request.json());
    addSceneAssetRequirement(body.sceneId, body.assetId);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_asset_requirements");
    const { requirementId } = z.object({ requirementId: z.string().uuid() }).parse(await request.json());
    removeSceneAssetRequirement(requirementId);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
