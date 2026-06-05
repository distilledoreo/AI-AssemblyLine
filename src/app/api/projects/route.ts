import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import {
  createProjectForWorkspace,
  getWorkspaceRole,
  listProjectsForUser,
} from "@/server/repository";
import { assertWorkspaceRole } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";

const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(2),
  targetFormat: z.string().default("short_film"),
  aspectRatio: z.string().default("16:9"),
  estimatedRuntime: z.number().int().positive().optional(),
  generationMode: z.enum(["cloud", "local"]).optional(),
  rightsPolicy: z
    .enum(["unrestricted", "no_real_people", "client_owned", "custom"])
    .default("unrestricted"),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return Response.json({ projects: await listProjectsForUser(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = createProjectSchema.parse(await request.json());
    assertWorkspaceRole(await getWorkspaceRole(user.id, body.workspaceId), "owner");
    const project = await createProjectForWorkspace(user.id, body);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
