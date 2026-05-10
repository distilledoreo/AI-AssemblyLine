import type { ProjectRole, WorkspaceRole } from "@/server/types";
import { ForbiddenError } from "@/server/errors";

const workspaceRank: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export type ProjectAction =
  | "view_project_dashboard"
  | "edit_project_settings"
  | "delete_project"
  | "manage_project_members"
  | "upload_script"
  | "run_script_analysis"
  | "edit_scene_shot_metadata"
  | "edit_asset_requirements"
  | "upload_asset_references"
  | "request_asset_generation"
  | "approve_reject_assets"
  | "lock_unlock_assets"
  | "generate_storyboard_frames"
  | "edit_storyboard_frames"
  | "use_drawing_markup_tools"
  | "approve_reject_frames"
  | "generate_video_clips"
  | "approve_reject_clips"
  | "add_review_comments"
  | "export_project"
  | "cancel_generation_jobs"
  | "select_provider_model";

const permissionMatrix: Record<ProjectAction, ProjectRole[]> = {
  view_project_dashboard: ["owner", "producer", "artist", "reviewer", "viewer"],
  edit_project_settings: ["owner"],
  delete_project: ["owner"],
  manage_project_members: ["owner", "producer"],
  upload_script: ["owner", "producer"],
  run_script_analysis: ["owner", "producer"],
  edit_scene_shot_metadata: ["owner", "producer", "artist"],
  edit_asset_requirements: ["owner", "producer", "artist"],
  upload_asset_references: ["owner", "producer", "artist"],
  request_asset_generation: ["owner", "producer", "artist"],
  approve_reject_assets: ["owner", "producer", "reviewer"],
  lock_unlock_assets: ["owner", "producer"],
  generate_storyboard_frames: ["owner", "producer", "artist"],
  edit_storyboard_frames: ["owner", "producer", "artist"],
  use_drawing_markup_tools: ["owner", "producer", "artist", "reviewer"],
  approve_reject_frames: ["owner", "producer", "reviewer"],
  generate_video_clips: ["owner", "producer", "artist"],
  approve_reject_clips: ["owner", "producer", "reviewer"],
  add_review_comments: ["owner", "producer", "artist", "reviewer"],
  export_project: ["owner", "producer"],
  cancel_generation_jobs: ["owner", "producer", "artist"],
  select_provider_model: ["owner", "producer", "artist"],
};

export function workspaceRoleAtLeast(actual: WorkspaceRole | undefined, required: WorkspaceRole) {
  if (!actual) {
    return false;
  }
  return workspaceRank[actual] >= workspaceRank[required];
}

export function projectRoleCan(role: ProjectRole | undefined, action: ProjectAction) {
  if (!role) {
    return false;
  }
  return permissionMatrix[action].includes(role);
}

export function assertWorkspaceRole(actual: WorkspaceRole | undefined, required: WorkspaceRole) {
  if (!workspaceRoleAtLeast(actual, required)) {
    throw new ForbiddenError(`Workspace role ${required} or higher is required.`);
  }
}

export function assertProjectPermission(role: ProjectRole | undefined, action: ProjectAction) {
  if (!projectRoleCan(role, action)) {
    throw new ForbiddenError(`Project permission ${action} is required.`);
  }
}

export function getPermissionMatrix() {
  return permissionMatrix;
}
