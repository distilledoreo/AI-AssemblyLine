import { redirect } from "next/navigation";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  listProjectsForUser,
  listWorkspacesForUser,
} from "@/server/repository";
import { getCurrentUser } from "@/server/session";

const LOCAL_WORKSPACE_NAME = "Studio Workspace";
const LOCAL_PROJECT_TITLE = "Untitled Short Film";

export default async function SetupLocalPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin?next=/setup-local");
  }

  const workspaces = await listWorkspacesForUser(user.id);
  const workspace =
    workspaces.find((candidate) => candidate.name === LOCAL_WORKSPACE_NAME) ??
    workspaces[0] ??
    (await createWorkspaceForUser(user.id, { name: LOCAL_WORKSPACE_NAME }));

  const projects = await listProjectsForUser(user.id);
  const project =
    projects.find(
      (candidate) =>
        candidate.workspaceId === workspace.id &&
        candidate.generationMode === "local" &&
        candidate.title === LOCAL_PROJECT_TITLE,
    ) ??
    projects.find((candidate) => candidate.workspaceId === workspace.id && candidate.generationMode === "local") ??
    (await createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: LOCAL_PROJECT_TITLE,
      targetFormat: "short_film",
      aspectRatio: "16:9",
      generationMode: "local",
      rightsPolicy: "unrestricted",
    }));

  redirect(`/projects/${project.id}`);
}
