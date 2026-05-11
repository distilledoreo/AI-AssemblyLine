import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { getProjectRole, getScriptAnalysisGraphForProject } from "@/server/repository";
import { assertProjectPermission, type ProjectAction } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import {
  generateAssetReference,
  mergeAssets,
  splitAsset,
  transitionAssetStatus,
  updateProjectStyle,
  uploadAssetReference,
  upsertAssetDetail,
} from "@/server/assetBible";

const jsonActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("detail"), assetId: z.string().uuid(), detail: z.record(z.string(), z.unknown()) }),
  z.object({
    action: z.literal("generate"),
    assetId: z.string().uuid(),
    providerSlug: z.enum(["openai", "stability"]).default("stability"),
  }),
  z.object({
    action: z.literal("status"),
    assetId: z.string().uuid(),
    status: z.enum(["missing", "draft", "needs_review", "approved", "locked", "superseded", "rejected"]),
  }),
  z.object({ action: z.literal("merge"), sourceAssetId: z.string().uuid(), targetAssetId: z.string().uuid() }),
  z.object({
    action: z.literal("split"),
    assetId: z.string().uuid(),
    canonicalName: z.string().min(1),
    type: z.enum(["character", "wardrobe", "location", "creature", "prop"]).optional(),
  }),
  z.object({ action: z.literal("style"), style: z.record(z.string(), z.unknown()) }),
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
    const role = await getProjectRole(user.id, projectId);

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      assertProjectPermission(role, "upload_asset_references");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new Error("Reference upload requires a file.");
      }
      await uploadAssetReference({
        projectId,
        assetId: String(form.get("assetId")),
        filename: file.name,
        data: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        referenceType: "other",
      });
      return Response.json(await getScriptAnalysisGraphForProject(projectId), { status: 201 });
    }

    const body = jsonActionSchema.parse(await request.json());
    assertProjectPermission(role, permissionForAssetBibleAction(body));
    if (body.action === "detail") await upsertAssetDetail(body.assetId, body.detail);
    if (body.action === "generate") await generateAssetReference({ projectId, assetId: body.assetId, providerSlug: body.providerSlug });
    if (body.action === "status") await transitionAssetStatus(body.assetId, body.status);
    if (body.action === "merge") await mergeAssets(body.sourceAssetId, body.targetAssetId);
    if (body.action === "split") await splitAsset(body.assetId, body);
    if (body.action === "style") await updateProjectStyle(projectId, body.style);
    return Response.json(await getScriptAnalysisGraphForProject(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

function permissionForAssetBibleAction(body: z.infer<typeof jsonActionSchema>): ProjectAction {
  if (body.action === "generate") return "request_asset_generation";
  if (body.action === "status") return body.status === "locked" ? "lock_unlock_assets" : "approve_reject_assets";
  if (body.action === "style") return "edit_project_settings";
  return "edit_asset_requirements";
}
