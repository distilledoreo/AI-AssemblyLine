import { createHash, randomBytes } from "node:crypto";
import { AppError, NotFoundError } from "@/server/errors";
import { createId, nowIso } from "@/server/ids";
import { getStore } from "@/server/repository";
import type { Assignment, ProjectRole } from "@/server/types";

export function createInvitation(input: {
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
  getStore().invitations.push(invitation);
  if (input.projectId) {
    recordActivity(input.projectId, input.invitedById, "invitation_created", `Invited ${invitation.email} as ${input.role}.`);
  }
  return { invitation, token };
}

export function acceptInvitation(token: string, userId: string) {
  const store = getStore();
  const invitation = store.invitations.find((candidate) => candidate.tokenHash === hashToken(token));
  if (!invitation) throw new NotFoundError("Invitation not found.");
  if (invitation.status !== "pending" || new Date(invitation.expiresAt).getTime() < Date.now()) {
    throw new AppError("Invitation is no longer valid.", 400, "invitation_invalid");
  }
  invitation.status = "accepted";
  invitation.acceptedAt = nowIso();
  if (invitation.projectId && !store.projectMembers.some((member) => member.projectId === invitation.projectId && member.userId === userId)) {
    store.projectMembers.push({
      id: createId(),
      projectId: invitation.projectId,
      userId,
      role: invitation.role as ProjectRole,
      joinedAt: nowIso(),
    });
    recordActivity(invitation.projectId, userId, "invitation_accepted", `${invitation.email} joined the project.`);
  }
  return invitation;
}

export function assignProjectTarget(input: {
  projectId: string;
  userId: string;
  targetType: Assignment["targetType"];
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  actorId?: string;
}) {
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
  getStore().assignments.push(assignment);
  recordActivity(input.projectId, input.actorId, "assignment_created", `Assigned ${input.targetType}.`, assignment);
  return assignment;
}

export function addProjectMember(input: { projectId: string; userId: string; role: ProjectRole; actorId?: string }) {
  const store = getStore();
  const existing = store.projectMembers.find((member) => member.projectId === input.projectId && member.userId === input.userId);
  if (existing) {
    existing.role = input.role;
  } else {
    store.projectMembers.push({ id: createId(), projectId: input.projectId, userId: input.userId, role: input.role, joinedAt: nowIso() });
  }
  recordActivity(input.projectId, input.actorId, "member_updated", `Project member role set to ${input.role}.`);
}

export function recordActivity(projectId: string, actorId: string | undefined, eventType: string, message: string, metadata?: Record<string, unknown>) {
  const event = { id: createId(), projectId, actorId, eventType, message, metadata, createdAt: nowIso() };
  getStore().activityEvents.push(event);
  return event;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
