import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import {
  getWorkspaceRole,
  listProviderKeys,
  saveProviderKey,
} from "@/server/repository";
import { assertWorkspaceRole } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";

const saveProviderKeySchema = z.object({
  workspaceId: z.string().uuid(),
  providerSlug: z.string().min(2),
  apiKey: z.string().min(3),
  label: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspaceId"));
    assertWorkspaceRole(getWorkspaceRole(user.id, workspaceId), "admin");
    return Response.json({ providerKeys: listProviderKeys(workspaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = saveProviderKeySchema.parse(await request.json());
    assertWorkspaceRole(getWorkspaceRole(user.id, body.workspaceId), "admin");
    const providerKey = saveProviderKey(body.workspaceId, body);
    return Response.json({ providerKey }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
