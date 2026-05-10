import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  getProjectDashboard,
  getProjectRole,
  getScriptAnalysisGraph,
} from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { getCurrentUser } from "@/server/session";
import { ProjectDashboardClient } from "@/app/projects/[projectId]/ProjectDashboardClient";

export default async function ProjectDashboardPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  const { projectId } = await params;
  assertProjectPermission(getProjectRole(user.id, projectId), "view_project_dashboard");
  const dashboard = getProjectDashboard(projectId);
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
      />
    </AppShell>
  );
}
