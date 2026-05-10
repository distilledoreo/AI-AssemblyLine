import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import {
  createWorkspaceForUser,
  listWorkspacesForUser,
} from "@/server/repository";
import { requireCurrentUser } from "@/server/session";

const createWorkspaceSchema = z.object({
  name: z.string().min(2),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return Response.json({ workspaces: await listWorkspacesForUser(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = createWorkspaceSchema.parse(await request.json());
    const workspace = await createWorkspaceForUser(user.id, body);
    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
