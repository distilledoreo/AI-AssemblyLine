import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProjectDashboardClient, type ProjectDashboardView } from "@/app/projects/[projectId]/ProjectDashboardClient";
import { assertProjectPermission } from "@/server/rbac";
import { getProjectDashboard, getProjectRole, getScriptAnalysisGraph } from "@/server/repository";
import { getCurrentUser } from "@/server/session";

export async function ProjectWorkflowPage({
  params,
  view,
}: Readonly<{ params: Promise<{ projectId: string }>; view: ProjectDashboardView }>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  const { projectId } = await params;
  assertProjectPermission(await getProjectRole(user.id, projectId), "view_project_dashboard");
  const dashboard = await getProjectDashboard(projectId);
  const analysisGraph = getScriptAnalysisGraph(projectId);

  return (
    <AppShell userName={user.name}>
      <ProjectDashboardClient
        project={dashboard.project}
        style={dashboard.style}
        initialJobs={dashboard.jobs}
        initialEvents={dashboard.events}
        initialAnalysisGraph={analysisGraph}
        currentUserId={user.id}
        view={view}
      />
    </AppShell>
  );
}
