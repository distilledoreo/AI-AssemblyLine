import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  listProviderKeys,
  listWorkspacesForUser,
} from "@/server/repository";
import { getCurrentUser } from "@/server/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }
  const workspaces = await listWorkspacesForUser(user.id);
  const providerKeysByWorkspace = new Map(
    await Promise.all(
      workspaces.map(async (workspace) => [workspace.id, await listProviderKeys(workspace.id)] as const),
    ),
  );

  return (
    <AppShell userName={user.name}>
      <div className="topline">
        <div>
          <p className="eyebrow">Workspace settings</p>
          <h1>Provider keys</h1>
        </div>
      </div>
      <div className="grid">
        {workspaces.length === 0 ? (
          <section className="panel span-12">
            <p className="notice">Create a workspace on the dashboard before adding provider keys.</p>
          </section>
        ) : (
          workspaces.map((workspace) => (
            <section className="panel span-6" key={workspace.id}>
              <h2>{workspace.name}</h2>
              <ul className="list">
                {(providerKeysByWorkspace.get(workspace.id) ?? []).length === 0 ? (
                  <li className="notice">No provider keys configured.</li>
                ) : (
                  (providerKeysByWorkspace.get(workspace.id) ?? []).map((key) => (
                    <li className="list-item" key={key.id}>
                      <span>{key.label ?? key.providerSlug}</span>
                      <span className="meta">{key.maskedKey}</span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
