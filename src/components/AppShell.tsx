import Link from "next/link";
import { FolderKanban, KeyRound, LayoutDashboard, LogOut } from "lucide-react";

export function AppShell({
  children,
  userName,
}: Readonly<{ children: React.ReactNode; userName: string }>) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AI AssemblyLine</div>
        <nav className="nav" aria-label="Primary">
          <Link href="/dashboard">
            <LayoutDashboard size={18} aria-hidden="true" />
            Dashboard
          </Link>
          <Link href="/dashboard#projects">
            <FolderKanban size={18} aria-hidden="true" />
            Projects
          </Link>
          <Link href="/settings">
            <KeyRound size={18} aria-hidden="true" />
            Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit">
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </nav>
        <p className="meta" style={{ marginTop: 28 }}>
          Signed in as {userName}
        </p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
