import { describe, expect, it } from "vitest";
import { projectRoleCan, workspaceRoleAtLeast } from "@/server/rbac";

describe("RBAC permission matrix", () => {
  it("allows all project roles to view the dashboard", () => {
    expect(projectRoleCan("owner", "view_project_dashboard")).toBe(true);
    expect(projectRoleCan("producer", "view_project_dashboard")).toBe(true);
    expect(projectRoleCan("artist", "view_project_dashboard")).toBe(true);
    expect(projectRoleCan("reviewer", "view_project_dashboard")).toBe(true);
    expect(projectRoleCan("viewer", "view_project_dashboard")).toBe(true);
  });

  it("blocks viewers from mutating production settings and generation actions", () => {
    expect(projectRoleCan("viewer", "edit_project_settings")).toBe(false);
    expect(projectRoleCan("viewer", "generate_storyboard_frames")).toBe(false);
    expect(projectRoleCan("viewer", "export_project")).toBe(false);
  });

  it("matches the workspace owner/admin/member hierarchy", () => {
    expect(workspaceRoleAtLeast("owner", "admin")).toBe(true);
    expect(workspaceRoleAtLeast("admin", "admin")).toBe(true);
    expect(workspaceRoleAtLeast("member", "admin")).toBe(false);
  });
});
