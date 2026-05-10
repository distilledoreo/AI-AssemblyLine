import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  listProjectsForUser,
  listWorkspacesForUser,
} from "@/server/repository";
import { getCurrentUser } from "@/server/session";
import { DashboardClient } from "@/app/dashboard/DashboardClient";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }

  return (
    <AppShell userName={user.name}>
      <DashboardClient
        initialWorkspaces={listWorkspacesForUser(user.id)}
        initialProjects={listProjectsForUser(user.id)}
      />
    </AppShell>
  );
}
