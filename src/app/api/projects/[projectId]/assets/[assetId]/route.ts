import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { updateAsset } from "@/server/scriptAnalysis";

const assetUpdateSchema = z.object({
  canonicalName: z.string().min(1).optional(),
  type: z.enum(["character", "wardrobe", "location", "creature", "prop"]).optional(),
  status: z.enum(["missing", "draft", "needs_review", "approved", "locked", "superseded", "rejected"]).optional(),
  description: z.string().optional(),
  continuityNotes: z.string().optional(),
  negativePrompts: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { projectId, assetId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "edit_asset_requirements");
    return Response.json({ asset: await updateAsset(assetId, assetUpdateSchema.parse(await request.json())) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
