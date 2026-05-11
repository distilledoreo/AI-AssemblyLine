import { createHash, randomBytes } from "node:crypto";
import { AppError, NotFoundError } from "@/server/errors";
import { createId, nowIso } from "@/server/ids";
import {
  findInvitationByTokenHash,
  getProjectMemberForUser,
  getScriptAnalysisGraphForProject,
  persistActivityEventState,
  persistAssignmentState,
  persistInvitationState,
  persistProjectMemberState,
} from "@/server/repository";
import type { Assignment, ProjectMember, ProjectRole } from "@/server/types";

export async function createInvitation(input: {
  workspaceId: string;
  projectId?: string;
  email: string;
  role: ProjectRole;
  invitedById: string;
}) {
  const token = randomBytes(24).toString("base64url");
  const invitation = {
    id: createId(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    email: input.email.trim().toLowerCase(),
    tokenHash: hashToken(token),
    scope: input.projectId ? "project" as const : "workspace" as const,
    role: input.role,
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedById: input.invitedById,
    createdAt: nowIso(),
  };
  await persistInvitationState(invitation);
  if (input.projectId) {
    await recordActivity(input.projectId, input.invitedById, "invitation_created", `Invited ${invitation.email} as ${input.role}.`);
  }
  return { invitation, token };
}

export async function acceptInvitation(token: string, userId: string) {
  const invitation = await findInvitationByTokenHash(hashToken(token));
  if (!invitation) throw new NotFoundError("Invitation not found.");
  if (invitation.status !== "pending" || new Date(invitation.expiresAt).getTime() < Date.now()) {
    throw new AppError("Invitation is no longer valid.", 400, "invitation_invalid");
  }
  invitation.status = "accepted";
  invitation.acceptedAt = nowIso();
  await persistInvitationState(invitation);
  if (invitation.projectId && !(await getProjectMemberForUser(invitation.projectId, userId))) {
    const member: ProjectMember = {
      id: createId(),
      projectId: invitation.projectId,
      userId,
      role: invitation.role as ProjectRole,
      joinedAt: nowIso(),
    };
    await persistProjectMemberState(member);
    await recordActivity(invitation.projectId, userId, "invitation_accepted", `${invitation.email} joined the project.`);
  }
  return invitation;
}

export async function assignProjectTarget(input: {
  projectId: string;
  userId: string;
  targetType: Assignment["targetType"];
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  actorId?: string;
}) {
  if (!(await getProjectMemberForUser(input.projectId, input.userId))) {
    throw new NotFoundError("Project member not found.");
  }
  await assertAssignableTarget(input);
  const assignment: Assignment = {
    id: createId(),
    projectId: input.projectId,
    userId: input.userId,
    targetType: input.targetType,
    sceneId: input.sceneId,
    shotId: input.shotId,
    assetId: input.assetId,
    status: "open",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await persistAssignmentState(assignment);
  await recordActivity(input.projectId, input.actorId, "assignment_created", `Assigned ${input.targetType}.`, assignment);
  return assignment;
}

async function assertAssignableTarget(input: {
  projectId: string;
  targetType: Assignment["targetType"];
  sceneId?: string;
  shotId?: string;
  assetId?: string;
}) {
  const providedIds = [input.sceneId, input.shotId, input.assetId].filter(Boolean);
  if (providedIds.length !== 1) {
    throw new AppError("Assignments must reference exactly one scene, shot, or asset.", 400, "invalid_assignment_target");
  }
  if (input.targetType === "scene" && !input.sceneId) {
    throw new AppError("Scene assignments require a sceneId.", 400, "invalid_assignment_target");
  }
  if (input.targetType === "shot" && !input.shotId) {
    throw new AppError("Shot assignments require a shotId.", 400, "invalid_assignment_target");
  }
  if (input.targetType === "asset" && !input.assetId) {
    throw new AppError("Asset assignments require an assetId.", 400, "invalid_assignment_target");
  }

  const graph = await getScriptAnalysisGraphForProject(input.projectId);
  const exists =
    (input.sceneId ? graph.scenes.some((scene) => scene.id === input.sceneId) : false) ||
    (input.shotId ? graph.shots.some((shot) => shot.id === input.shotId) : false) ||
    (input.assetId ? graph.assets.some((asset) => asset.id === input.assetId) : false);
  if (!exists) {
    throw new NotFoundError("Assignment target not found.");
  }
}

export async function addProjectMember(input: { projectId: string; userId: string; role: ProjectRole; actorId?: string }) {
  const existing = await getProjectMemberForUser(input.projectId, input.userId);
  let member: ProjectMember;
  if (existing) {
    existing.role = input.role;
    member = existing;
  } else {
    member = { id: createId(), projectId: input.projectId, userId: input.userId, role: input.role, joinedAt: nowIso() };
  }
  await persistProjectMemberState(member);
  await recordActivity(input.projectId, input.actorId, "member_updated", `Project member role set to ${input.role}.`);
}

export async function recordActivity(projectId: string, actorId: string | undefined, eventType: string, message: string, metadata?: Record<string, unknown>) {
  const event = { id: createId(), projectId, actorId, eventType, message, metadata, createdAt: nowIso() };
  await persistActivityEventState(event);
  return event;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
