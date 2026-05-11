import {
  decryptProviderKey,
  encryptProviderKey,
  maskProviderKey,
} from "@/server/crypto";
import { AppError, AuthRequiredError, NotFoundError } from "@/server/errors";
import { createId, nowIso, slugify } from "@/server/ids";
import type { Prisma } from "@prisma/client";
import { emitProjectEvent } from "@/server/queue";
import { submitGenerationJob } from "@/server/queue";
import { prisma } from "@/server/prisma";
import { isLiveProviderSlug } from "@/providers/liveProviderCatalog";
import { ensureProjectStorage, projectStoragePath } from "@/server/storage";
import type {
  GenerationJob,
  JobEvent,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectStyle,
  ProviderKey,
  ReviewNote,
  RightsPolicy,
  Asset,
  AssetDetail,
  AssetReference,
  AssetVersion,
  FrameVersion,
  Scene,
  SceneAssetRequirement,
  Session,
  Shot,
  ShotAssetRequirement,
  Script,
  ScriptAnalysisGraph,
  ScriptVersion,
  StoryboardFrame,
  VideoClip,
  ClipVersion,
  Invitation,
  Assignment,
  ActivityEvent,
  ExportBundle,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/server/types";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isPrismaRepositoryEnabled() {
  return process.env.REPOSITORY_MODE === "prisma" || process.env.NODE_ENV === "production";
}

type StoreState = {
  users: User[];
  sessions: Session[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  projects: Project[];
  projectMembers: ProjectMember[];
  projectStyles: ProjectStyle[];
  providerKeys: ProviderKey[];
  generationJobs: GenerationJob[];
  jobEvents: JobEvent[];
  scripts: Script[];
  scriptVersions: ScriptVersion[];
  scenes: Scene[];
  shots: Shot[];
  assets: Asset[];
  assetDetails: AssetDetail[];
  assetVersions: AssetVersion[];
  assetReferences: AssetReference[];
  storyboardFrames: StoryboardFrame[];
  frameVersions: FrameVersion[];
  reviewNotes: ReviewNote[];
  videoClips: VideoClip[];
  clipVersions: ClipVersion[];
  invitations: Invitation[];
  assignments: Assignment[];
  activityEvents: ActivityEvent[];
  exportBundles: ExportBundle[];
  sceneAssetRequirements: SceneAssetRequirement[];
  shotAssetRequirements: ShotAssetRequirement[];
};

declare global {
  var __assemblyLineStore: StoreState | undefined;
}

function createInitialState(): StoreState {
  return {
    users: [],
    sessions: [],
    workspaces: [],
    workspaceMembers: [],
    projects: [],
    projectMembers: [],
    projectStyles: [],
    providerKeys: [],
    generationJobs: [],
    jobEvents: [],
    scripts: [],
    scriptVersions: [],
    scenes: [],
    shots: [],
    assets: [],
    assetDetails: [],
    assetVersions: [],
    assetReferences: [],
    storyboardFrames: [],
    frameVersions: [],
    reviewNotes: [],
    videoClips: [],
    clipVersions: [],
    invitations: [],
    assignments: [],
    activityEvents: [],
    exportBundles: [],
    sceneAssetRequirements: [],
    shotAssetRequirements: [],
  };
}

export function getStore() {
  globalThis.__assemblyLineStore ??= createInitialState();
  const initial = createInitialState();
  for (const key of Object.keys(initial) as Array<keyof StoreState>) {
    globalThis.__assemblyLineStore[key] ??= initial[key] as never;
  }
  return globalThis.__assemblyLineStore;
}

export function resetStoreForTests() {
  globalThis.__assemblyLineStore = createInitialState();
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? undefined,
    createdAt: iso(user.createdAt),
    updatedAt: iso(user.updatedAt),
  };
}

function mapWorkspace(workspace: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Workspace {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: iso(workspace.createdAt),
    updatedAt: iso(workspace.updatedAt),
  };
}

function mapProject(project: {
  id: string;
  workspaceId: string;
  title: string;
  targetFormat: string;
  aspectRatio: string;
  estimatedRuntime?: number | null;
  storagePath: string;
  rightsPolicy: RightsPolicy;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Project {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    title: project.title,
    targetFormat: project.targetFormat,
    aspectRatio: project.aspectRatio,
    estimatedRuntime: project.estimatedRuntime ?? undefined,
    storagePath: project.storagePath,
    rightsPolicy: project.rightsPolicy,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

function mapProjectMember(member: {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: Date | string;
}): ProjectMember {
  return {
    id: member.id,
    projectId: member.projectId,
    userId: member.userId,
    role: member.role,
    joinedAt: iso(member.joinedAt),
  };
}

function mapProjectStyle(style: {
  id: string;
  projectId: string;
  styleName: string;
  description: string;
  colorPalette: unknown;
  lightingRules: string;
  renderingMedium: string;
  lensLanguage: string;
  negativeConstraints: string;
  modelPromptFragments: unknown;
  approvalStatus: "draft" | "approved" | "locked";
  createdAt: Date | string;
  updatedAt: Date | string;
}): ProjectStyle {
  return {
    id: style.id,
    projectId: style.projectId,
    styleName: style.styleName,
    description: style.description,
    colorPalette: Array.isArray(style.colorPalette) ? style.colorPalette.map(String) : [],
    lightingRules: style.lightingRules,
    renderingMedium: style.renderingMedium,
    lensLanguage: style.lensLanguage,
    negativeConstraints: style.negativeConstraints,
    modelPromptFragments:
      style.modelPromptFragments && typeof style.modelPromptFragments === "object" && !Array.isArray(style.modelPromptFragments)
        ? (style.modelPromptFragments as Record<string, string>)
        : {},
    approvalStatus: style.approvalStatus,
    createdAt: iso(style.createdAt),
    updatedAt: iso(style.updatedAt),
  };
}

function mapJob(job: {
  id: string;
  projectId: string;
  type: GenerationJob["type"];
  providerSlug?: string | null;
  modelId?: string | null;
  status: GenerationJob["status"];
  inputPayload: unknown;
  outputPayload?: unknown;
  errorMessage?: string | null;
  errorClass?: GenerationJob["errorClass"] | null;
  retryCount: number;
  providerJobId?: string | null;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
}): GenerationJob {
  return {
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    providerSlug: job.providerSlug ?? undefined,
    modelId: job.modelId ?? undefined,
    status: job.status,
    inputPayload: job.inputPayload,
    outputPayload: job.outputPayload,
    errorMessage: job.errorMessage ?? undefined,
    errorClass: job.errorClass ?? undefined,
    retryCount: job.retryCount,
    providerJobId: job.providerJobId ?? undefined,
    createdAt: iso(job.createdAt),
    startedAt: job.startedAt ? iso(job.startedAt) : undefined,
    completedAt: job.completedAt ? iso(job.completedAt) : undefined,
  };
}

function mapJobEvent(event: {
  id: string;
  jobId: string;
  projectId: string;
  eventType: string;
  message?: string | null;
  progressPct?: number | null;
  createdAt: Date | string;
}): JobEvent {
  return {
    id: event.id,
    jobId: event.jobId,
    projectId: event.projectId,
    eventType: event.eventType,
    message: event.message ?? undefined,
    progressPct: event.progressPct ?? undefined,
    createdAt: iso(event.createdAt),
  };
}

function mapScript(script: {
  id: string;
  projectId: string;
  filename: string;
  createdAt: Date | string;
}): Script {
  return {
    id: script.id,
    projectId: script.projectId,
    filename: script.filename,
    createdAt: iso(script.createdAt),
  };
}

function mapScriptVersion(version: {
  id: string;
  scriptId: string;
  versionNumber: number;
  filePath: string;
  rawText: string;
  analysisStatus: ScriptVersion["analysisStatus"];
  isActive: boolean;
  createdAt: Date | string;
}): ScriptVersion {
  return {
    id: version.id,
    scriptId: version.scriptId,
    versionNumber: version.versionNumber,
    filePath: version.filePath,
    rawText: version.rawText,
    analysisStatus: version.analysisStatus,
    isActive: version.isActive,
    createdAt: iso(version.createdAt),
  };
}

function mapScene(scene: {
  id: string;
  scriptVersionId: string;
  sceneNumber: number;
  heading: string;
  summary: string;
  scriptStartLine: number;
  scriptEndLine: number;
  locationHint?: string | null;
  status: Scene["status"];
  isUserEdited: boolean;
  warnings?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Scene {
  return {
    id: scene.id,
    scriptVersionId: scene.scriptVersionId,
    sceneNumber: scene.sceneNumber,
    heading: scene.heading,
    summary: scene.summary,
    scriptStartLine: scene.scriptStartLine,
    scriptEndLine: scene.scriptEndLine,
    locationHint: scene.locationHint ?? undefined,
    status: scene.status,
    isUserEdited: scene.isUserEdited,
    warnings: Array.isArray(scene.warnings) ? scene.warnings.map(String) : undefined,
    createdAt: iso(scene.createdAt),
    updatedAt: iso(scene.updatedAt),
  };
}

function mapShot(shot: {
  id: string;
  sceneId: string;
  shotNumber: number;
  action: string;
  cameraAngle?: string | null;
  cameraMovement?: string | null;
  lensNotes?: string | null;
  lightingNotes?: string | null;
  userDirection?: string | null;
  status: Shot["status"];
  isUserEdited: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Shot {
  return {
    id: shot.id,
    sceneId: shot.sceneId,
    shotNumber: shot.shotNumber,
    action: shot.action,
    cameraAngle: shot.cameraAngle ?? undefined,
    cameraMovement: shot.cameraMovement ?? undefined,
    lensNotes: shot.lensNotes ?? undefined,
    lightingNotes: shot.lightingNotes ?? undefined,
    userDirection: shot.userDirection ?? undefined,
    status: shot.status,
    isUserEdited: shot.isUserEdited,
    createdAt: iso(shot.createdAt),
    updatedAt: iso(shot.updatedAt),
  };
}

function mapAsset(asset: {
  id: string;
  projectId: string;
  type: Asset["type"];
  canonicalName: string;
  aliases: unknown;
  status: Asset["status"];
  continuityNotes?: string | null;
  negativePrompts?: string | null;
  description?: string | null;
  firstAppearance?: unknown;
  isUserEdited: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Asset {
  return {
    id: asset.id,
    projectId: asset.projectId,
    type: asset.type,
    canonicalName: asset.canonicalName,
    aliases: Array.isArray(asset.aliases) ? asset.aliases.map(String) : [],
    status: asset.status,
    continuityNotes: asset.continuityNotes ?? undefined,
    negativePrompts: asset.negativePrompts ?? undefined,
    description: asset.description ?? undefined,
    firstAppearance:
      asset.firstAppearance && typeof asset.firstAppearance === "object"
        ? (asset.firstAppearance as Asset["firstAppearance"])
        : undefined,
    isUserEdited: asset.isUserEdited,
    createdAt: iso(asset.createdAt),
    updatedAt: iso(asset.updatedAt),
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapCharacterDetail(
  detail: {
    assetId: string;
    role?: string | null;
    narrativeDescription?: string | null;
    physicalDescription?: string | null;
    personalityNotes?: string | null;
    performanceNotes?: string | null;
    scaleReference?: string | null;
  },
  updatedAt: Date | string,
): AssetDetail {
  return {
    assetId: detail.assetId,
    role: detail.role ?? undefined,
    narrativeDescription: detail.narrativeDescription ?? undefined,
    physicalDescription: detail.physicalDescription ?? undefined,
    personalityNotes: detail.personalityNotes ?? undefined,
    performanceNotes: detail.performanceNotes ?? undefined,
    scaleReference: detail.scaleReference ?? undefined,
    updatedAt: iso(updatedAt),
  };
}

function mapWardrobeDetail(
  detail: {
    assetId: string;
    outfitName?: string | null;
    storyContext?: string | null;
    materialNotes?: string | null;
    accessories?: unknown;
    colorPalette?: unknown;
  },
  updatedAt: Date | string,
): AssetDetail {
  return {
    assetId: detail.assetId,
    outfitName: detail.outfitName ?? undefined,
    storyContext: detail.storyContext ?? undefined,
    materialNotes: detail.materialNotes ?? undefined,
    accessories: stringArray(detail.accessories),
    colorPalette: stringArray(detail.colorPalette),
    updatedAt: iso(updatedAt),
  };
}

function mapLocationDetail(
  detail: {
    assetId: string;
    floorPlanNotes?: string | null;
    entranceExitNotes?: string | null;
    setDressing?: string | null;
    lightingStates?: unknown;
    cameraSafeZones?: string | null;
  },
  updatedAt: Date | string,
): AssetDetail {
  return {
    assetId: detail.assetId,
    floorPlanNotes: detail.floorPlanNotes ?? undefined,
    entranceExitNotes: detail.entranceExitNotes ?? undefined,
    setDressing: detail.setDressing ?? undefined,
    lightingStates: stringArray(detail.lightingStates),
    cameraSafeZones: detail.cameraSafeZones ?? undefined,
    updatedAt: iso(updatedAt),
  };
}

function mapCreatureDetail(
  detail: {
    assetId: string;
    speciesType?: string | null;
    anatomyNotes?: string | null;
    scaleReference?: string | null;
    movementNotes?: string | null;
    textureDetails?: string | null;
  },
  updatedAt: Date | string,
): AssetDetail {
  return {
    assetId: detail.assetId,
    speciesType: detail.speciesType ?? undefined,
    anatomyNotes: detail.anatomyNotes ?? undefined,
    scaleReference: detail.scaleReference ?? undefined,
    movementNotes: detail.movementNotes ?? undefined,
    textureDetails: detail.textureDetails ?? undefined,
    updatedAt: iso(updatedAt),
  };
}

function mapPropDetail(
  detail: {
    assetId: string;
    ownerOrScene?: string | null;
    materialAndWear?: string | null;
    scaleReference?: string | null;
    interactionNotes?: string | null;
  },
  updatedAt: Date | string,
): AssetDetail {
  return {
    assetId: detail.assetId,
    ownerOrScene: detail.ownerOrScene ?? undefined,
    materialAndWear: detail.materialAndWear ?? undefined,
    scaleReference: detail.scaleReference ?? undefined,
    interactionNotes: detail.interactionNotes ?? undefined,
    updatedAt: iso(updatedAt),
  };
}

function mapAssetVersion(version: {
  id: string;
  assetId: string;
  versionNumber: number;
  description?: string | null;
  promptFragments?: unknown;
  status: AssetVersion["status"];
  createdAt: Date | string;
}): AssetVersion {
  return {
    id: version.id,
    assetId: version.assetId,
    versionNumber: version.versionNumber,
    description: version.description ?? undefined,
    promptFragments:
      version.promptFragments && typeof version.promptFragments === "object" && !Array.isArray(version.promptFragments)
        ? (version.promptFragments as Record<string, string>)
        : undefined,
    status: version.status,
    createdAt: iso(version.createdAt),
  };
}

function mapAssetReference(reference: {
  id: string;
  assetVersionId: string;
  referenceType: AssetReference["referenceType"];
  filePath: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  thumbnailPath?: string | null;
  generationJobId?: string | null;
  createdAt: Date | string;
}): AssetReference {
  return {
    id: reference.id,
    assetVersionId: reference.assetVersionId,
    referenceType: reference.referenceType,
    filePath: reference.filePath,
    mimeType: reference.mimeType,
    width: reference.width ?? undefined,
    height: reference.height ?? undefined,
    thumbnailPath: reference.thumbnailPath ?? undefined,
    generationJobId: reference.generationJobId ?? undefined,
    createdAt: iso(reference.createdAt),
  };
}

function mapStoryboardFrame(frame: {
  id: string;
  shotId: string;
  keyframeIndex: number;
  sketchFilePath?: string | null;
  sketchWarning?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): StoryboardFrame {
  return {
    id: frame.id,
    shotId: frame.shotId,
    keyframeIndex: frame.keyframeIndex,
    sketchFilePath: frame.sketchFilePath ?? undefined,
    sketchWarning: frame.sketchWarning ?? undefined,
    createdAt: iso(frame.createdAt),
    updatedAt: iso(frame.updatedAt),
  };
}

function mapFrameVersion(version: {
  id: string;
  frameId: string;
  versionNumber: number;
  prompt: string;
  filePath: string;
  thumbnailPath?: string | null;
  status: FrameVersion["status"];
  isStale: boolean;
  generationJobId?: string | null;
  annotations?: unknown;
  createdAt: Date | string;
}): FrameVersion {
  return {
    id: version.id,
    frameId: version.frameId,
    versionNumber: version.versionNumber,
    prompt: version.prompt,
    filePath: version.filePath,
    thumbnailPath: version.thumbnailPath ?? undefined,
    status: version.status,
    isStale: version.isStale,
    generationJobId: version.generationJobId ?? undefined,
    annotations:
      version.annotations && typeof version.annotations === "object" && !Array.isArray(version.annotations)
        ? (version.annotations as Record<string, unknown>)
        : undefined,
    createdAt: iso(version.createdAt),
  };
}

function mapReviewNote(note: {
  id: string;
  projectId: string;
  authorId: string;
  targetType: ReviewNote["targetType"];
  targetId: string;
  parentNoteId?: string | null;
  body: string;
  markupFilePath?: string | null;
  status: ReviewNote["status"];
  createdAt: Date | string;
  updatedAt: Date | string;
}): ReviewNote {
  return {
    id: note.id,
    projectId: note.projectId,
    authorId: note.authorId,
    targetType: note.targetType,
    targetId: note.targetId,
    parentNoteId: note.parentNoteId ?? undefined,
    body: note.body,
    markupFilePath: note.markupFilePath ?? undefined,
    status: note.status,
    createdAt: iso(note.createdAt),
    updatedAt: iso(note.updatedAt),
  };
}

function mapVideoClip(clip: {
  id: string;
  shotId?: string | null;
  sceneId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): VideoClip {
  return {
    id: clip.id,
    shotId: clip.shotId ?? undefined,
    sceneId: clip.sceneId ?? undefined,
    createdAt: iso(clip.createdAt),
    updatedAt: iso(clip.updatedAt),
  };
}

function mapClipVersion(version: {
  id: string;
  clipId: string;
  versionNumber: number;
  prompt: string;
  filePath: string;
  thumbnailPath?: string | null;
  durationMs: number;
  status: ClipVersion["status"];
  isStale: boolean;
  sourceFrameVersionIds: unknown;
  generationJobId?: string | null;
  createdAt: Date | string;
}): ClipVersion {
  return {
    id: version.id,
    clipId: version.clipId,
    versionNumber: version.versionNumber,
    prompt: version.prompt,
    filePath: version.filePath,
    thumbnailPath: version.thumbnailPath ?? undefined,
    durationMs: version.durationMs,
    status: version.status,
    isStale: version.isStale,
    sourceFrameVersionIds: Array.isArray(version.sourceFrameVersionIds)
      ? version.sourceFrameVersionIds.filter((id): id is string => typeof id === "string")
      : [],
    generationJobId: version.generationJobId ?? undefined,
    createdAt: iso(version.createdAt),
  };
}

function mapInvitation(invitation: {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  email: string;
  tokenHash: string;
  scope: Invitation["scope"];
  role: string;
  status: Invitation["status"];
  expiresAt: Date | string;
  invitedById: string;
  acceptedAt?: Date | string | null;
  createdAt: Date | string;
}): Invitation {
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    projectId: invitation.projectId ?? undefined,
    email: invitation.email,
    tokenHash: invitation.tokenHash,
    scope: invitation.scope,
    role: invitation.role,
    status: invitation.status,
    expiresAt: iso(invitation.expiresAt),
    invitedById: invitation.invitedById,
    acceptedAt: invitation.acceptedAt ? iso(invitation.acceptedAt) : undefined,
    createdAt: iso(invitation.createdAt),
  };
}

function mapAssignment(assignment: {
  id: string;
  projectId: string;
  userId: string;
  targetType: string;
  sceneId?: string | null;
  shotId?: string | null;
  assetId?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Assignment {
  return {
    id: assignment.id,
    projectId: assignment.projectId,
    userId: assignment.userId,
    targetType: ["scene", "shot", "asset"].includes(assignment.targetType)
      ? (assignment.targetType as Assignment["targetType"])
      : "scene",
    sceneId: assignment.sceneId ?? undefined,
    shotId: assignment.shotId ?? undefined,
    assetId: assignment.assetId ?? undefined,
    status: assignment.status === "complete" ? "complete" : "open",
    createdAt: iso(assignment.createdAt),
    updatedAt: iso(assignment.updatedAt),
  };
}

function mapActivityEvent(event: {
  id: string;
  projectId: string;
  actorId?: string | null;
  eventType: string;
  message: string;
  metadata?: unknown;
  createdAt: Date | string;
}): ActivityEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    actorId: event.actorId ?? undefined,
    eventType: event.eventType,
    message: event.message,
    metadata:
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : undefined,
    createdAt: iso(event.createdAt),
  };
}

function mapExportBundle(bundle: {
  id: string;
  projectId: string;
  bundleVersion: number;
  manifestPath: string;
  archivePath?: string | null;
  mediaFileCount: number;
  metadataRecordCount: number;
  createdById?: string | null;
  generationJobId?: string | null;
  createdAt: Date | string;
}): ExportBundle {
  return {
    id: bundle.id,
    projectId: bundle.projectId,
    bundleVersion: bundle.bundleVersion,
    manifestPath: bundle.manifestPath,
    mediaFileCount: bundle.mediaFileCount,
    metadataRecordCount: bundle.metadataRecordCount,
    createdById: bundle.createdById ?? "",
    createdAt: iso(bundle.createdAt),
  };
}

function mapSceneAssetRequirement(requirement: {
  id: string;
  sceneId: string;
  assetId: string;
  isOptional: boolean;
  detectedBy: SceneAssetRequirement["detectedBy"];
  createdAt: Date | string;
}): SceneAssetRequirement {
  return {
    id: requirement.id,
    sceneId: requirement.sceneId,
    assetId: requirement.assetId,
    isOptional: requirement.isOptional,
    detectedBy: requirement.detectedBy,
    createdAt: iso(requirement.createdAt),
  };
}

function mapShotAssetRequirement(requirement: {
  id: string;
  shotId: string;
  assetId: string;
  isOptional: boolean;
  detectedBy: ShotAssetRequirement["detectedBy"];
  createdAt: Date | string;
}): ShotAssetRequirement {
  return {
    id: requirement.id,
    shotId: requirement.shotId,
    assetId: requirement.assetId,
    isOptional: requirement.isOptional,
    detectedBy: requirement.detectedBy,
    createdAt: iso(requirement.createdAt),
  };
}

function mapProviderKey(key: {
  id: string;
  workspaceId: string;
  providerSlug: string;
  encryptedKey: Buffer | Uint8Array | string;
  keyNonce: Buffer | Uint8Array | string;
  label?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ProviderKey {
  return {
    id: key.id,
    workspaceId: key.workspaceId,
    providerSlug: key.providerSlug,
    encryptedKey: typeof key.encryptedKey === "string" ? key.encryptedKey : Buffer.from(key.encryptedKey).toString("base64"),
    keyNonce: typeof key.keyNonce === "string" ? key.keyNonce : Buffer.from(key.keyNonce).toString("base64"),
    label: key.label ?? undefined,
    createdAt: iso(key.createdAt),
    updatedAt: iso(key.updatedAt),
  };
}

function toPrismaJson(value: unknown) {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export async function signInWithCredentials(input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || input.password.length < 4) {
    throw new AppError("Enter a valid email and a password with at least four characters.", 401, "bad_credentials");
  }

  if (isPrismaRepositoryEnabled()) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: input.name?.trim() || email.split("@")[0] },
      create: {
        email,
        name: input.name?.trim() || email.split("@")[0],
      },
    });
    const session = await prisma.session.create({
      data: {
        sessionToken: createId(),
        userId: user.id,
        expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
      },
    });
    return {
      user: mapUser(user),
      session: {
        token: session.sessionToken,
        userId: session.userId,
        expiresAt: session.expires.toISOString(),
      },
    };
  }

  const store = getStore();
  const existing = store.users.find((user) => user.email === email);
  const timestamp = nowIso();
  const user =
    existing ??
    ({
      id: createId(),
      email,
      name: input.name?.trim() || email.split("@")[0],
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies User);

  if (!existing) {
    store.users.push(user);
  }

  const session: Session = {
    token: createId(),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
  };
  store.sessions.push(session);

  return { user, session };
}

export async function signOutSession(token: string | undefined) {
  if (!token) {
    return;
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
    return;
  }
  const store = getStore();
  store.sessions = store.sessions.filter((session) => session.token !== token);
}

export async function getUserBySessionToken(token: string | undefined) {
  if (!token) {
    return undefined;
  }

  if (isPrismaRepositoryEnabled()) {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });
    if (!session || session.expires.getTime() < Date.now()) {
      return undefined;
    }
    return mapUser(session.user);
  }

  const store = getStore();
  const session = store.sessions.find((candidate) => candidate.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return undefined;
  }

  return store.users.find((user) => user.id === session.userId);
}

export async function getOptionalSessionUser(token: string | undefined) {
  return getUserBySessionToken(token);
}

export async function requireSessionUser(token: string | undefined) {
  const user = await getUserBySessionToken(token);
  if (!user) {
    throw new AuthRequiredError();
  }
  return user;
}

export async function createWorkspaceForUser(
  userId: string,
  input: { name: string; role?: WorkspaceRole },
) {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new AppError("Workspace name must be at least two characters.");
  }
  if (isPrismaRepositoryEnabled()) {
    const baseSlug = slugify(name) || "workspace";
    let slug = baseSlug;
    let suffix = 2;
    while (await prisma.workspace.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        members: {
          create: {
            userId,
            role: input.role ?? "owner",
          },
        },
      },
    });
    return mapWorkspace(workspace);
  }
  const store = getStore();
  const timestamp = nowIso();
  const baseSlug = slugify(name) || "workspace";
  let slug = baseSlug;
  let suffix = 2;
  while (store.workspaces.some((workspace) => workspace.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const workspace: Workspace = {
    id: createId(),
    name,
    slug,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const member: WorkspaceMember = {
    id: createId(),
    workspaceId: workspace.id,
    userId,
    role: input.role ?? "owner",
    joinedAt: timestamp,
  };

  store.workspaces.push(workspace);
  store.workspaceMembers.push(member);
  return workspace;
}

export async function listWorkspacesForUser(userId: string) {
  if (isPrismaRepositoryEnabled()) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((membership) => mapWorkspace(membership.workspace));
  }
  const store = getStore();
  const workspaceIds = new Set(
    store.workspaceMembers.filter((member) => member.userId === userId).map((member) => member.workspaceId),
  );
  return store.workspaces.filter((workspace) => workspaceIds.has(workspace.id));
}

export async function getWorkspaceRole(userId: string, workspaceId: string) {
  if (isPrismaRepositoryEnabled()) {
    return (await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }))?.role;
  }
  return getStore().workspaceMembers.find(
    (member) => member.userId === userId && member.workspaceId === workspaceId,
  )?.role;
}

export async function createProjectForWorkspace(
  userId: string,
  input: {
    workspaceId: string;
    title: string;
    targetFormat?: string;
    aspectRatio?: string;
    estimatedRuntime?: number;
    rightsPolicy?: RightsPolicy;
  },
) {
  const title = input.title.trim();
  if (title.length < 2) {
    throw new AppError("Project title must be at least two characters.");
  }

  if (isPrismaRepositoryEnabled()) {
    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId } });
    if (!workspace) {
      throw new NotFoundError("Workspace not found.");
    }
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        title,
        targetFormat: input.targetFormat ?? "short_film",
        aspectRatio: input.aspectRatio ?? "16:9",
        estimatedRuntime: input.estimatedRuntime,
        storagePath: "",
        rightsPolicy: input.rightsPolicy ?? "unrestricted",
        members: { create: { userId, role: "owner" } },
        style: {
          create: {
            styleName: "Project Style",
            description: "Draft visual style. Lock this before final storyboard generation.",
            colorPalette: ["#0f172a", "#f8fafc", "#38bdf8"],
            lightingRules: "Neutral production lighting until a style is approved.",
            renderingMedium: "digital painting",
            lensLanguage: "Use clear, production-friendly camera language.",
            negativeConstraints: "Avoid off-model assets, inconsistent wardrobe, and unreadable staging.",
            modelPromptFragments: {},
            approvalStatus: "draft",
          },
        },
      },
    });
    const storagePath = projectStoragePath(project.id);
    const updated = await prisma.project.update({ where: { id: project.id }, data: { storagePath } });
    await ensureProjectStorage(updated.id);
    return mapProject(updated);
  }

  const store = getStore();
  const workspace = store.workspaces.find((candidate) => candidate.id === input.workspaceId);
  if (!workspace) {
    throw new NotFoundError("Workspace not found.");
  }

  const timestamp = nowIso();
  const project: Project = {
    id: createId(),
    workspaceId: workspace.id,
    title,
    targetFormat: input.targetFormat ?? "short_film",
    aspectRatio: input.aspectRatio ?? "16:9",
    estimatedRuntime: input.estimatedRuntime,
    storagePath: projectStoragePath(createId()),
    rightsPolicy: input.rightsPolicy ?? "unrestricted",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  project.storagePath = projectStoragePath(project.id);

  const member: ProjectMember = {
    id: createId(),
    projectId: project.id,
    userId,
    role: "owner",
    joinedAt: timestamp,
  };
  const style: ProjectStyle = {
    id: createId(),
    projectId: project.id,
    styleName: "Project Style",
    description: "Draft visual style. Lock this before final storyboard generation.",
    colorPalette: ["#0f172a", "#f8fafc", "#38bdf8"],
    lightingRules: "Neutral production lighting until a style is approved.",
    renderingMedium: "digital painting",
    lensLanguage: "Use clear, production-friendly camera language.",
    negativeConstraints: "Avoid off-model assets, inconsistent wardrobe, and unreadable staging.",
    modelPromptFragments: {},
    approvalStatus: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.projects.push(project);
  store.projectMembers.push(member);
  store.projectStyles.push(style);
  await ensureProjectStorage(project.id);
  return project;
}

export async function listProjectsForUser(userId: string) {
  if (isPrismaRepositoryEnabled()) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((membership) => mapProject(membership.project));
  }
  const store = getStore();
  const projectIds = new Set(
    store.projectMembers.filter((member) => member.userId === userId).map((member) => member.projectId),
  );
  return store.projects.filter((project) => projectIds.has(project.id));
}

export async function getProject(projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    return project ? mapProject(project) : undefined;
  }
  return getStore().projects.find((project) => project.id === projectId);
}

export async function getProjectRole(userId: string, projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    return (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }))?.role;
  }
  return getStore().projectMembers.find(
    (member) => member.userId === userId && member.projectId === projectId,
  )?.role;
}

export async function getProjectMemberForUser(projectId: string, userId: string) {
  const local = getStore().projectMembers.find((member) => member.projectId === projectId && member.userId === userId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }).catch(() => undefined);
  return member ? mapProjectMember(member) : undefined;
}

export async function getProjectDashboard(projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        style: true,
        generationJobs: { orderBy: { createdAt: "desc" } },
        jobEvents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!project) {
      throw new NotFoundError("Project not found.");
    }
    return {
      project: mapProject(project),
      style: project.style ? mapProjectStyle(project.style) : undefined,
      jobs: project.generationJobs.map(mapJob),
      events: project.jobEvents.map(mapJobEvent),
    };
  }
  const store = getStore();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  const style = store.projectStyles.find((candidate) => candidate.projectId === project.id);
  const jobs = store.generationJobs.filter((job) => job.projectId === project.id);
  const events = store.jobEvents.filter((event) => event.projectId === project.id);
  return { project, style, jobs, events };
}

export function getScriptAnalysisGraph(projectId: string): ScriptAnalysisGraph {
  const store = getStore();
  const scripts = store.scripts.filter((script) => script.projectId === projectId);
  const scriptIds = new Set(scripts.map((script) => script.id));
  const versions = store.scriptVersions.filter((version) => scriptIds.has(version.scriptId));
  const activeVersion = versions.find((version) => version.isActive);
  const versionIds = new Set(versions.map((version) => version.id));
  const scenes = store.scenes.filter((scene) => versionIds.has(scene.scriptVersionId));
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const shots = store.shots.filter((shot) => sceneIds.has(shot.sceneId));
  const shotIds = new Set(shots.map((shot) => shot.id));

  return {
    scripts,
    activeVersion,
    scenes,
    shots,
    assets: store.assets.filter((asset) => asset.projectId === projectId),
    assetDetails: store.assetDetails.filter((detail) =>
      store.assets.some((asset) => asset.projectId === projectId && asset.id === detail.assetId),
    ),
    assetVersions: store.assetVersions.filter((version) =>
      store.assets.some((asset) => asset.projectId === projectId && asset.id === version.assetId),
    ),
    assetReferences: store.assetReferences.filter((reference) =>
      store.assetVersions.some((version) => version.id === reference.assetVersionId),
    ),
    storyboardFrames: store.storyboardFrames.filter((frame) => shotIds.has(frame.shotId)),
    frameVersions: store.frameVersions.filter((version) =>
      store.storyboardFrames.some((frame) => shotIds.has(frame.shotId) && frame.id === version.frameId),
    ),
    reviewNotes: store.reviewNotes.filter((note) => note.projectId === projectId),
    videoClips: store.videoClips.filter((clip) => clip.shotId ? shotIds.has(clip.shotId) : clip.sceneId ? sceneIds.has(clip.sceneId) : false),
    clipVersions: store.clipVersions.filter((version) =>
      store.videoClips.some((clip) => (clip.shotId ? shotIds.has(clip.shotId) : clip.sceneId ? sceneIds.has(clip.sceneId) : false) && clip.id === version.clipId),
    ),
    invitations: store.invitations.filter((invitation) => invitation.projectId === projectId),
    assignments: store.assignments.filter((assignment) => assignment.projectId === projectId),
    activityEvents: store.activityEvents.filter((activity) => activity.projectId === projectId),
    sceneAssetRequirements: store.sceneAssetRequirements.filter((requirement) =>
      sceneIds.has(requirement.sceneId),
    ),
    shotAssetRequirements: store.shotAssetRequirements.filter((requirement) =>
      shotIds.has(requirement.shotId),
    ),
    jobs: store.generationJobs.filter((job) => job.projectId === projectId),
    events: store.jobEvents.filter((event) => event.projectId === projectId),
  };
}

export async function getScriptAnalysisGraphForProject(projectId: string): Promise<ScriptAnalysisGraph> {
  if (!isPrismaRepositoryEnabled()) {
    return getScriptAnalysisGraph(projectId);
  }

  const scripts = (await prisma.script.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } })).map(mapScript);
  const scriptIds = scripts.map((script) => script.id);
  const versions = scriptIds.length
    ? (await prisma.scriptVersion.findMany({
        where: { scriptId: { in: scriptIds } },
        orderBy: [{ scriptId: "asc" }, { versionNumber: "asc" }],
      })).map(mapScriptVersion)
    : [];
  const activeVersion = versions.find((version) => version.isActive);
  const versionIds = versions.map((version) => version.id);
  const scenes = versionIds.length
    ? (await prisma.scene.findMany({
        where: { scriptVersionId: { in: versionIds } },
        orderBy: [{ scriptVersionId: "asc" }, { sceneNumber: "asc" }],
      })).map(mapScene)
    : [];
  const sceneIds = scenes.map((scene) => scene.id);
  const shots = sceneIds.length
    ? (await prisma.shot.findMany({
        where: { sceneId: { in: sceneIds } },
        orderBy: [{ sceneId: "asc" }, { shotNumber: "asc" }],
      })).map(mapShot)
    : [];
  const shotIds = shots.map((shot) => shot.id);
  const assets = (await prisma.asset.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } })).map(mapAsset);
  const assetIds = assets.map((asset) => asset.id);
  const assetUpdatedAt = new Map(assets.map((asset) => [asset.id, asset.updatedAt]));
  const [characterDetails, wardrobeDetails, locationDetails, creatureDetails, propDetails] = assetIds.length
    ? await Promise.all([
        prisma.characterDetail.findMany({ where: { assetId: { in: assetIds } }, orderBy: { assetId: "asc" } }),
        prisma.wardrobeDetail.findMany({ where: { assetId: { in: assetIds } }, orderBy: { assetId: "asc" } }),
        prisma.locationDetail.findMany({ where: { assetId: { in: assetIds } }, orderBy: { assetId: "asc" } }),
        prisma.creatureDetail.findMany({ where: { assetId: { in: assetIds } }, orderBy: { assetId: "asc" } }),
        prisma.propDetail.findMany({ where: { assetId: { in: assetIds } }, orderBy: { assetId: "asc" } }),
      ])
    : [[], [], [], [], []];
  const assetDetails = [
    ...characterDetails.map((detail) => mapCharacterDetail(detail, assetUpdatedAt.get(detail.assetId) ?? new Date())),
    ...wardrobeDetails.map((detail) => mapWardrobeDetail(detail, assetUpdatedAt.get(detail.assetId) ?? new Date())),
    ...locationDetails.map((detail) => mapLocationDetail(detail, assetUpdatedAt.get(detail.assetId) ?? new Date())),
    ...creatureDetails.map((detail) => mapCreatureDetail(detail, assetUpdatedAt.get(detail.assetId) ?? new Date())),
    ...propDetails.map((detail) => mapPropDetail(detail, assetUpdatedAt.get(detail.assetId) ?? new Date())),
  ];
  const assetVersions = assetIds.length
    ? (await prisma.assetVersion.findMany({ where: { assetId: { in: assetIds } }, orderBy: { createdAt: "asc" } })).map(mapAssetVersion)
    : [];
  const assetVersionIds = assetVersions.map((version) => version.id);
  const assetReferences = assetVersionIds.length
    ? (await prisma.assetReference.findMany({
        where: { assetVersionId: { in: assetVersionIds } },
        orderBy: { createdAt: "asc" },
      })).map(mapAssetReference)
    : [];
  const sceneAssetRequirements = sceneIds.length
    ? (await prisma.sceneAssetReq.findMany({ where: { sceneId: { in: sceneIds } }, orderBy: { createdAt: "asc" } })).map(
        mapSceneAssetRequirement,
      )
    : [];
  const shotAssetRequirements = shotIds.length
    ? (await prisma.shotAssetReq.findMany({ where: { shotId: { in: shotIds } }, orderBy: { createdAt: "asc" } })).map(
        mapShotAssetRequirement,
      )
    : [];
  const storyboardFrames = shotIds.length
    ? (await prisma.storyboardFrame.findMany({
        where: { shotId: { in: shotIds } },
        orderBy: [{ shotId: "asc" }, { keyframeIndex: "asc" }],
      })).map(mapStoryboardFrame)
    : [];
  const frameIds = storyboardFrames.map((frame) => frame.id);
  const frameVersions = frameIds.length
    ? (await prisma.frameVersion.findMany({
        where: { frameId: { in: frameIds } },
        orderBy: [{ frameId: "asc" }, { versionNumber: "asc" }],
      })).map(mapFrameVersion)
    : [];
  const reviewNotes = (await prisma.reviewNote.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } })).map(
    mapReviewNote,
  );
  const videoClips = (shotIds.length || sceneIds.length)
    ? (await prisma.videoClip.findMany({
        where: {
          OR: [
            ...(shotIds.length ? [{ shotId: { in: shotIds } }] : []),
            ...(sceneIds.length ? [{ sceneId: { in: sceneIds } }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
      })).map(mapVideoClip)
    : [];
  const videoClipIds = videoClips.map((clip) => clip.id);
  const clipVersions = videoClipIds.length
    ? (await prisma.clipVersion.findMany({
        where: { clipId: { in: videoClipIds } },
        orderBy: [{ clipId: "asc" }, { versionNumber: "asc" }],
      })).map(mapClipVersion)
    : [];
  const [invitations, assignments, activityEvents] = await Promise.all([
    prisma.invitation.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.assignment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.activityEvent.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
  ]);
  const [jobs, events] = await Promise.all([
    prisma.generationJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.jobEvent.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    scripts,
    activeVersion,
    scenes,
    shots,
    assets,
    assetDetails,
    assetVersions,
    assetReferences,
    storyboardFrames,
    frameVersions,
    reviewNotes,
    videoClips,
    clipVersions,
    invitations: invitations.map(mapInvitation),
    assignments: assignments.map(mapAssignment),
    activityEvents: activityEvents.map(mapActivityEvent),
    sceneAssetRequirements,
    shotAssetRequirements,
    jobs: jobs.map(mapJob),
    events: events.map(mapJobEvent),
  };
}

export async function createScriptVersionForProject(input: {
  projectId: string;
  filename: string;
  filePath: string;
  rawText: string;
}) {
  const store = getStore();
  const timestamp = nowIso();
  let script = store.scripts.find((candidate) => candidate.projectId === input.projectId);
  let existingVersions: ScriptVersion[] = [];

  if (isPrismaRepositoryEnabled()) {
    const prismaScript =
      (await prisma.script.findFirst({ where: { projectId: input.projectId }, orderBy: { createdAt: "asc" } })) ??
      (await prisma.script.create({
        data: {
          id: script?.id ?? createId(),
          projectId: input.projectId,
          filename: input.filename,
        },
      }));
    script = mapScript(prismaScript);
    existingVersions = (
      (await prisma.scriptVersion.findMany({
        where: { scriptId: script.id },
        orderBy: { versionNumber: "asc" },
      })) ?? []
    ).map(mapScriptVersion);
  }

  script ??= {
    id: createId(),
    projectId: input.projectId,
    filename: input.filename,
    createdAt: timestamp,
  };
  if (!store.scripts.some((candidate) => candidate.id === script.id)) {
    store.scripts.push(script);
  }

  if (!existingVersions.length) {
    existingVersions = store.scriptVersions.filter((version) => version.scriptId === script.id);
  }
  for (const version of existingVersions) {
    if (!store.scriptVersions.some((candidate) => candidate.id === version.id)) {
      store.scriptVersions.push(version);
    }
  }
  existingVersions.forEach((version) => {
    version.isActive = false;
  });
  if (isPrismaRepositoryEnabled()) {
    await prisma.scriptVersion.updateMany({
      where: { scriptId: script.id },
      data: { isActive: false },
    });
  }

  const versionNumber = existingVersions.length + 1;
  let version: ScriptVersion = {
    id: createId(),
    scriptId: script.id,
    versionNumber,
    filePath: input.filePath,
    rawText: input.rawText,
    analysisStatus: "pending",
    isActive: true,
    createdAt: timestamp,
  };
  if (isPrismaRepositoryEnabled()) {
    version = mapScriptVersion(
      await prisma.scriptVersion.create({
        data: {
          id: version.id,
          scriptId: script.id,
          versionNumber,
          filePath: input.filePath,
          rawText: input.rawText,
          analysisStatus: "pending",
          isActive: true,
        },
      }),
    );
  }
  store.scriptVersions.push(version);

  return { script, version, previousVersionIds: new Set(existingVersions.map((existing) => existing.id)) };
}

export async function getNextScriptVersionNumberForProject(projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    const script = await prisma.script.findFirst({ where: { projectId }, orderBy: { createdAt: "asc" } });
    if (!script) {
      return 1;
    }
    const versions =
      (await prisma.scriptVersion.findMany({
      where: { scriptId: script.id },
      orderBy: { versionNumber: "asc" },
    })) ?? [];
    return (versions.at(-1)?.versionNumber ?? 0) + 1;
  }

  const store = getStore();
  return (
    store.scriptVersions.filter((version) =>
      store.scripts.some((script) => script.projectId === projectId && script.id === version.scriptId),
    ).length + 1
  );
}

export async function supersedeScriptVersionScenes(scriptVersionIds: Iterable<string>) {
  const versionIds = Array.from(scriptVersionIds);
  if (!versionIds.length) {
    return;
  }

  const store = getStore();
  const timestamp = nowIso();
  const previousSceneIds = new Set(
    store.scenes
      .filter((scene) => versionIds.includes(scene.scriptVersionId))
      .map((scene) => {
        scene.status = "superseded";
        scene.updatedAt = timestamp;
        return scene.id;
      }),
  );
  store.shots
    .filter((shot) => previousSceneIds.has(shot.sceneId))
    .forEach((shot) => {
      shot.status = "superseded";
      shot.updatedAt = timestamp;
    });

  if (isPrismaRepositoryEnabled()) {
    const previousScenes = await prisma.scene.findMany({
      where: { scriptVersionId: { in: versionIds } },
      select: { id: true },
    });
    const previousPrismaSceneIds = previousScenes.map((scene) => scene.id);
    if (previousPrismaSceneIds.length) {
      await prisma.scene.updateMany({
        where: { id: { in: previousPrismaSceneIds } },
        data: { status: "superseded", updatedAt: new Date() },
      });
      await prisma.shot.updateMany({
        where: { sceneId: { in: previousPrismaSceneIds } },
        data: { status: "superseded", updatedAt: new Date() },
      });
    }
  }
}

export async function updateScriptVersionAnalysisStatus(scriptVersionId: string, status: ScriptVersion["analysisStatus"]) {
  const version = getStore().scriptVersions.find((candidate) => candidate.id === scriptVersionId);
  if (version) {
    version.analysisStatus = status;
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.scriptVersion.update({ where: { id: scriptVersionId }, data: { analysisStatus: status } });
  }
  return version;
}

export async function persistGeneratedScriptAnalysis(input: {
  projectId: string;
  scriptVersionId: string;
  scenes: Array<{
    sceneNumber: number;
    heading: string;
    summary: string;
    scriptStartLine: number;
    scriptEndLine: number;
    locationHint?: string;
  }>;
  shotBreakdowns: Array<{
    sceneNumber: number;
    shots: Array<{
      shotNumber: number;
      action: string;
      cameraAngle?: string;
      cameraMovement?: string;
      lensNotes?: string;
      lightingNotes?: string;
    }>;
  }>;
  assets: Array<{
    canonicalName: string;
    type: Asset["type"];
    aliases?: string[];
    description?: string;
    firstAppearance?: Asset["firstAppearance"];
  }>;
  sceneAssetLinks: Array<{ sceneNumber: number; assetName: string }>;
  shotAssetLinks: Array<{ sceneNumber: number; shotNumber: number; assetName: string }>;
  warnings: string[];
}) {
  const store = getStore();
  const timestamp = nowIso();
  const previousScenes = store.scenes.filter((scene) => scene.scriptVersionId === input.scriptVersionId);
  const previousSceneIds = new Set(previousScenes.map((scene) => scene.id));
  const previousShots = store.shots.filter((shot) => previousSceneIds.has(shot.sceneId));
  const previousShotIds = new Set(previousShots.map((shot) => shot.id));
  const previousSceneNumberById = new Map(previousScenes.map((scene) => [scene.id, scene.sceneNumber]));
  store.sceneAssetRequirements = store.sceneAssetRequirements.filter((req) => !previousSceneIds.has(req.sceneId));
  store.shotAssetRequirements = store.shotAssetRequirements.filter((req) => !previousShotIds.has(req.shotId));
  store.shots = store.shots.filter((shot) => !previousShotIds.has(shot.id) || shot.isUserEdited);
  store.scenes = store.scenes.filter((scene) => !previousSceneIds.has(scene.id) || scene.isUserEdited);

  const localSceneByNumber = new Map<number, Scene>();
  for (const output of input.scenes) {
    const existing = previousScenes.find((scene) => scene.sceneNumber === output.sceneNumber && scene.isUserEdited);
    const scene: Scene =
      existing ??
      ({
        id: createId(),
        scriptVersionId: input.scriptVersionId,
        sceneNumber: output.sceneNumber,
        heading: output.heading,
        summary: output.summary,
        scriptStartLine: output.scriptStartLine,
        scriptEndLine: output.scriptEndLine,
        locationHint: output.locationHint,
        status: "blocked",
        warnings: input.warnings,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Scene);
    localSceneByNumber.set(output.sceneNumber, scene);
    if (!store.scenes.some((candidate) => candidate.id === scene.id)) {
      store.scenes.push(scene);
    }
  }

  const localShotBySceneAndNumber = new Map<string, Shot>();
  for (const sceneShots of input.shotBreakdowns) {
    const scene = localSceneByNumber.get(sceneShots.sceneNumber);
    if (!scene) {
      continue;
    }
    for (const output of sceneShots.shots) {
      const existing = previousShots.find(
        (shot) =>
          shot.isUserEdited &&
          previousSceneNumberById.get(shot.sceneId) === sceneShots.sceneNumber &&
          shot.shotNumber === output.shotNumber,
      );
      const shot: Shot =
        existing ??
        ({
          id: createId(),
          sceneId: scene.id,
          shotNumber: output.shotNumber,
          action: output.action,
          cameraAngle: output.cameraAngle,
          cameraMovement: output.cameraMovement,
          lensNotes: output.lensNotes,
          lightingNotes: output.lightingNotes,
          status: "blocked",
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies Shot);
      shot.sceneId = scene.id;
      if (!store.shots.some((candidate) => candidate.id === shot.id)) {
        store.shots.push(shot);
      }
      localShotBySceneAndNumber.set(`${sceneShots.sceneNumber}:${output.shotNumber}`, shot);
    }
  }

  const localAssetByName = new Map<string, Asset>();
  for (const output of input.assets) {
    const existing = store.assets.find(
      (asset) => asset.projectId === input.projectId && asset.canonicalName.toLowerCase() === output.canonicalName.toLowerCase(),
    );
    const asset: Asset =
      existing ??
      ({
        id: createId(),
        projectId: input.projectId,
        type: output.type,
        canonicalName: output.canonicalName,
        aliases: output.aliases ?? [],
        status: "missing",
        description: output.description,
        firstAppearance: output.firstAppearance,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Asset);
    asset.aliases = Array.from(new Set([...(asset.aliases ?? []), ...(output.aliases ?? [])]));
    localAssetByName.set(output.canonicalName.toLowerCase(), asset);
    if (!store.assets.some((candidate) => candidate.id === asset.id)) {
      store.assets.push(asset);
    }
  }

  for (const link of input.sceneAssetLinks) {
    const scene = localSceneByNumber.get(link.sceneNumber);
    const asset = localAssetByName.get(link.assetName.toLowerCase());
    if (scene && asset && !store.sceneAssetRequirements.some((req) => req.sceneId === scene.id && req.assetId === asset.id)) {
      store.sceneAssetRequirements.push({
        id: createId(),
        sceneId: scene.id,
        assetId: asset.id,
        isOptional: false,
        detectedBy: "ai",
        createdAt: timestamp,
      });
    }
  }

  for (const link of input.shotAssetLinks) {
    const shot = localShotBySceneAndNumber.get(`${link.sceneNumber}:${link.shotNumber}`);
    const asset = localAssetByName.get(link.assetName.toLowerCase());
    if (shot && asset && !store.shotAssetRequirements.some((req) => req.shotId === shot.id && req.assetId === asset.id)) {
      store.shotAssetRequirements.push({
        id: createId(),
        shotId: shot.id,
        assetId: asset.id,
        isOptional: false,
        detectedBy: "ai",
        createdAt: timestamp,
      });
    }
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }

  const previousPrismaScenes = await prisma.scene.findMany({
    where: { scriptVersionId: input.scriptVersionId },
    select: { id: true, sceneNumber: true, isUserEdited: true },
  });
  const previousPrismaSceneIds = previousPrismaScenes.map((scene) => scene.id);
  const previousPrismaShots = previousPrismaSceneIds.length
    ? await prisma.shot.findMany({
        where: { sceneId: { in: previousPrismaSceneIds } },
        select: { id: true, sceneId: true, shotNumber: true, isUserEdited: true },
      })
    : [];
  const previousPrismaShotIds = previousPrismaShots.map((shot) => shot.id);

  if (previousPrismaSceneIds.length) {
    await prisma.sceneAssetReq.deleteMany({ where: { sceneId: { in: previousPrismaSceneIds } } });
  }
  if (previousPrismaShotIds.length) {
    await prisma.shotAssetReq.deleteMany({ where: { shotId: { in: previousPrismaShotIds } } });
  }
  const generatedShotIds = previousPrismaShots.filter((shot) => !shot.isUserEdited).map((shot) => shot.id);
  if (generatedShotIds.length) {
    await prisma.shot.deleteMany({ where: { id: { in: generatedShotIds } } });
  }
  const generatedSceneIds = previousPrismaScenes.filter((scene) => !scene.isUserEdited).map((scene) => scene.id);
  if (generatedSceneIds.length) {
    await prisma.scene.deleteMany({ where: { id: { in: generatedSceneIds } } });
  }

  const sceneByNumber = new Map<number, { id: string; sceneNumber: number }>();
  for (const scene of input.scenes) {
    const existing = previousPrismaScenes.find((candidate) => candidate.sceneNumber === scene.sceneNumber && candidate.isUserEdited);
    const persisted = existing
      ? await prisma.scene.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
        })
      : await prisma.scene.create({
          data: {
            id: createId(),
            scriptVersionId: input.scriptVersionId,
            sceneNumber: scene.sceneNumber,
            heading: scene.heading,
            summary: scene.summary,
            scriptStartLine: scene.scriptStartLine,
            scriptEndLine: scene.scriptEndLine,
            locationHint: scene.locationHint,
            status: "blocked",
            warnings: toPrismaJson(input.warnings),
          },
        });
    sceneByNumber.set(scene.sceneNumber, persisted);
  }

  const shotBySceneAndNumber = new Map<string, { id: string; sceneId: string; shotNumber: number }>();
  const previousPrismaSceneNumberById = new Map(previousPrismaScenes.map((scene) => [scene.id, scene.sceneNumber]));
  for (const breakdown of input.shotBreakdowns) {
    const scene = sceneByNumber.get(breakdown.sceneNumber);
    if (!scene) {
      continue;
    }
    for (const shot of breakdown.shots) {
      const existing = previousPrismaShots.find(
        (candidate) =>
          candidate.isUserEdited &&
          previousPrismaSceneNumberById.get(candidate.sceneId) === breakdown.sceneNumber &&
          candidate.shotNumber === shot.shotNumber,
      );
      const persisted = existing
        ? await prisma.shot.update({
            where: { id: existing.id },
            data: { sceneId: scene.id, updatedAt: new Date() },
          })
        : await prisma.shot.create({
            data: {
              id: createId(),
              sceneId: scene.id,
              shotNumber: shot.shotNumber,
              action: shot.action,
              cameraAngle: shot.cameraAngle,
              cameraMovement: shot.cameraMovement,
              lensNotes: shot.lensNotes,
              lightingNotes: shot.lightingNotes,
              status: "blocked",
            },
          });
      shotBySceneAndNumber.set(`${breakdown.sceneNumber}:${shot.shotNumber}`, persisted);
    }
  }

  const assetByName = new Map<string, { id: string; canonicalName: string }>();
  for (const asset of input.assets) {
    const existing = await prisma.asset.findFirst({
      where: {
        projectId: input.projectId,
        canonicalName: { equals: asset.canonicalName, mode: "insensitive" },
      },
    });
    const aliases = Array.from(new Set([...(Array.isArray(existing?.aliases) ? existing.aliases.map(String) : []), ...(asset.aliases ?? [])]));
    const persisted = existing
      ? await prisma.asset.update({
          where: { id: existing.id },
          data: {
            aliases,
            description: existing.description ?? asset.description,
            firstAppearance: existing.firstAppearance ?? toPrismaJson(asset.firstAppearance),
          },
        })
      : await prisma.asset.create({
          data: {
            id: createId(),
            projectId: input.projectId,
            type: asset.type,
            canonicalName: asset.canonicalName,
            aliases,
            status: "missing",
            description: asset.description,
            firstAppearance: toPrismaJson(asset.firstAppearance),
          },
        });
    assetByName.set(asset.canonicalName.toLowerCase(), persisted);
  }

  const sceneReqs = input.sceneAssetLinks
    .map((link) => {
      const scene = sceneByNumber.get(link.sceneNumber);
      const asset = assetByName.get(link.assetName.toLowerCase());
      return scene && asset
        ? { id: createId(), sceneId: scene.id, assetId: asset.id, isOptional: false, detectedBy: "ai" as const }
        : undefined;
    })
    .filter(isPresent);
  if (sceneReqs.length) {
    await prisma.sceneAssetReq.createMany({ data: sceneReqs, skipDuplicates: true });
  }

  const shotReqs = input.shotAssetLinks
    .map((link) => {
      const shot = shotBySceneAndNumber.get(`${link.sceneNumber}:${link.shotNumber}`);
      const asset = assetByName.get(link.assetName.toLowerCase());
      return shot && asset
        ? { id: createId(), shotId: shot.id, assetId: asset.id, isOptional: false, detectedBy: "ai" as const }
        : undefined;
    })
    .filter(isPresent);
  if (shotReqs.length) {
    await prisma.shotAssetReq.createMany({ data: shotReqs, skipDuplicates: true });
  }
}

export async function persistAssetState(asset: Asset) {
  const store = getStore();
  const existing = store.assets.find((candidate) => candidate.id === asset.id);
  if (existing) {
    Object.assign(existing, asset);
  } else {
    store.assets.push(asset);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      canonicalName: asset.canonicalName,
      type: asset.type,
      aliases: asset.aliases,
      status: asset.status,
      continuityNotes: asset.continuityNotes,
      negativePrompts: asset.negativePrompts,
      description: asset.description,
      firstAppearance: toPrismaJson(asset.firstAppearance),
      isUserEdited: asset.isUserEdited ?? false,
    },
  });
}

export async function getSceneById(sceneId: string) {
  const local = getStore().scenes.find((candidate) => candidate.id === sceneId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } }).catch(() => undefined);
  return scene ? mapScene(scene) : undefined;
}

export async function getScriptVersionById(scriptVersionId: string) {
  const local = getStore().scriptVersions.find((candidate) => candidate.id === scriptVersionId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const version = await prisma.scriptVersion.findUnique({ where: { id: scriptVersionId } }).catch(() => undefined);
  return version ? mapScriptVersion(version) : undefined;
}

export async function getShotById(shotId: string) {
  const local = getStore().shots.find((candidate) => candidate.id === shotId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const shot = await prisma.shot.findUnique({ where: { id: shotId } }).catch(() => undefined);
  return shot ? mapShot(shot) : undefined;
}

export async function getAssetById(assetId: string) {
  const local = getStore().assets.find((candidate) => candidate.id === assetId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const asset = await prisma.asset.findUnique({ where: { id: assetId } }).catch(() => undefined);
  return asset ? mapAsset(asset) : undefined;
}

export async function getFrameVersionById(frameVersionId: string) {
  const local = getStore().frameVersions.find((candidate) => candidate.id === frameVersionId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const version = await prisma.frameVersion.findUnique({ where: { id: frameVersionId } }).catch(() => undefined);
  return version ? mapFrameVersion(version) : undefined;
}

export async function getClipVersionById(clipVersionId: string) {
  const local = getStore().clipVersions.find((candidate) => candidate.id === clipVersionId);
  if (!isPrismaRepositoryEnabled()) {
    return local;
  }
  const version = await prisma.clipVersion.findUnique({ where: { id: clipVersionId } }).catch(() => undefined);
  return version ? mapClipVersion(version) : local;
}

export async function getVideoClipForShot(shotId: string) {
  const local = getStore().videoClips.find((candidate) => candidate.shotId === shotId);
  if (!isPrismaRepositoryEnabled()) {
    return local;
  }
  const clip = await prisma.videoClip.findFirst({ where: { shotId } }).catch(() => undefined);
  return clip ? mapVideoClip(clip) : local;
}

export async function getVideoClipForScene(sceneId: string) {
  const local = getStore().videoClips.find((candidate) => candidate.sceneId === sceneId);
  if (!isPrismaRepositoryEnabled()) {
    return local;
  }
  const clip = await prisma.videoClip.findFirst({ where: { sceneId } }).catch(() => undefined);
  return clip ? mapVideoClip(clip) : local;
}

export async function getSceneAssetRequirementBySceneAndAsset(sceneId: string, assetId: string) {
  const local = getStore().sceneAssetRequirements.find((candidate) => candidate.sceneId === sceneId && candidate.assetId === assetId);
  if (!isPrismaRepositoryEnabled()) {
    return local;
  }
  const requirement = await prisma.sceneAssetReq.findFirst({ where: { sceneId, assetId } }).catch(() => undefined);
  return requirement ? mapSceneAssetRequirement(requirement) : local;
}

export async function getSceneAssetRequirementById(requirementId: string) {
  const local = getStore().sceneAssetRequirements.find((candidate) => candidate.id === requirementId);
  if (!isPrismaRepositoryEnabled()) {
    return local;
  }
  const requirement = await prisma.sceneAssetReq.findUnique({ where: { id: requirementId } }).catch(() => undefined);
  return requirement ? mapSceneAssetRequirement(requirement) : local;
}

export async function persistSceneState(scene: Scene) {
  const store = getStore();
  const existing = store.scenes.find((candidate) => candidate.id === scene.id);
  if (existing) {
    Object.assign(existing, scene);
  } else {
    store.scenes.push(scene);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      heading: scene.heading,
      summary: scene.summary,
      scriptStartLine: scene.scriptStartLine,
      scriptEndLine: scene.scriptEndLine,
      locationHint: scene.locationHint,
      status: scene.status,
      isUserEdited: scene.isUserEdited ?? false,
      warnings: toPrismaJson(scene.warnings ?? []) ?? [],
      updatedAt: new Date(scene.updatedAt),
    },
  });
}

export async function persistShotState(shot: Shot) {
  const store = getStore();
  const existing = store.shots.find((candidate) => candidate.id === shot.id);
  if (existing) {
    Object.assign(existing, shot);
  } else {
    store.shots.push(shot);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.shot.update({
    where: { id: shot.id },
    data: {
      action: shot.action,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensNotes: shot.lensNotes,
      lightingNotes: shot.lightingNotes,
      userDirection: shot.userDirection,
      status: shot.status,
      isUserEdited: shot.isUserEdited ?? false,
      updatedAt: new Date(shot.updatedAt),
    },
  });
}

export async function persistCreatedAssetState(asset: Asset) {
  const store = getStore();
  const existing = store.assets.find((candidate) => candidate.id === asset.id);
  if (existing) {
    Object.assign(existing, asset);
  } else {
    store.assets.push(asset);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.asset.create({
    data: {
      id: asset.id,
      projectId: asset.projectId,
      type: asset.type,
      canonicalName: asset.canonicalName,
      aliases: asset.aliases,
      status: asset.status,
      continuityNotes: asset.continuityNotes,
      negativePrompts: asset.negativePrompts,
      description: asset.description,
      firstAppearance: toPrismaJson(asset.firstAppearance),
      isUserEdited: asset.isUserEdited ?? false,
      createdAt: new Date(asset.createdAt),
      updatedAt: new Date(asset.updatedAt),
    },
  });
}

export async function persistAssetMergeState(input: { source: Asset; target: Asset }) {
  const store = getStore();
  store.sceneAssetRequirements.forEach((req) => {
    if (req.assetId === input.source.id) req.assetId = input.target.id;
  });
  store.shotAssetRequirements.forEach((req) => {
    if (req.assetId === input.source.id) req.assetId = input.target.id;
  });
  await persistAssetState(input.source);
  await persistAssetState(input.target);

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await Promise.all([
    prisma.sceneAssetReq.updateMany({
      where: { assetId: input.source.id },
      data: { assetId: input.target.id },
    }).catch(() => undefined),
    prisma.shotAssetReq.updateMany({
      where: { assetId: input.source.id },
      data: { assetId: input.target.id },
    }).catch(() => undefined),
    persistAssetState(input.source),
    persistAssetState(input.target),
  ]);
}

export async function persistImportedProjectGraph(graph: ScriptAnalysisGraph) {
  const store = getStore();
  const appendMissing = <T extends { id: string }>(items: T[], target: T[]) => {
    const existing = new Set(target.map((item) => item.id));
    for (const item of items) {
      if (!existing.has(item.id)) {
        target.push(item);
        existing.add(item.id);
      }
    }
  };
  const appendMissingByKey = <T>(items: T[], target: T[], keyFor: (item: T) => string) => {
    const existing = new Set(target.map(keyFor));
    for (const item of items) {
      const key = keyFor(item);
      if (!existing.has(key)) {
        target.push(item);
        existing.add(key);
      }
    }
  };

  appendMissing(graph.scripts, store.scripts);
  if (graph.activeVersion) {
    appendMissing([graph.activeVersion], store.scriptVersions);
  }
  appendMissing(graph.scenes, store.scenes);
  appendMissing(graph.shots, store.shots);
  appendMissing(graph.assets, store.assets);
  appendMissingByKey(graph.assetDetails, store.assetDetails, (detail) => detail.assetId);
  appendMissing(graph.assetVersions, store.assetVersions);
  appendMissing(graph.assetReferences, store.assetReferences);
  appendMissing(graph.sceneAssetRequirements, store.sceneAssetRequirements);
  appendMissing(graph.shotAssetRequirements, store.shotAssetRequirements);
  appendMissing(graph.storyboardFrames, store.storyboardFrames);
  appendMissing(graph.frameVersions, store.frameVersions);
  appendMissing(graph.videoClips, store.videoClips);
  appendMissing(graph.clipVersions, store.clipVersions);
  appendMissing(graph.reviewNotes, store.reviewNotes);

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.script.createMany({
    data: graph.scripts.map((script) => ({
      id: script.id,
      projectId: script.projectId,
      filename: script.filename,
      createdAt: new Date(script.createdAt),
    })),
    skipDuplicates: true,
  });
  if (graph.activeVersion) {
    await prisma.scriptVersion.createMany({
      data: [
        {
          id: graph.activeVersion.id,
          scriptId: graph.activeVersion.scriptId,
          versionNumber: graph.activeVersion.versionNumber,
          filePath: graph.activeVersion.filePath,
          rawText: graph.activeVersion.rawText,
          analysisStatus: graph.activeVersion.analysisStatus,
          isActive: graph.activeVersion.isActive,
          createdAt: new Date(graph.activeVersion.createdAt),
        },
      ],
      skipDuplicates: true,
    });
  }
  await prisma.scene.createMany({
    data: graph.scenes.map((scene) => ({
      id: scene.id,
      scriptVersionId: scene.scriptVersionId,
      sceneNumber: scene.sceneNumber,
      heading: scene.heading,
      summary: scene.summary,
      scriptStartLine: scene.scriptStartLine,
      scriptEndLine: scene.scriptEndLine,
      locationHint: scene.locationHint,
      status: scene.status,
      isUserEdited: scene.isUserEdited ?? false,
      warnings: toPrismaJson(scene.warnings ?? []) ?? [],
      createdAt: new Date(scene.createdAt),
      updatedAt: new Date(scene.updatedAt),
    })),
    skipDuplicates: true,
  });
  await prisma.shot.createMany({
    data: graph.shots.map((shot) => ({
      id: shot.id,
      sceneId: shot.sceneId,
      shotNumber: shot.shotNumber,
      action: shot.action,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensNotes: shot.lensNotes,
      lightingNotes: shot.lightingNotes,
      userDirection: shot.userDirection,
      status: shot.status,
      isUserEdited: shot.isUserEdited ?? false,
      createdAt: new Date(shot.createdAt),
      updatedAt: new Date(shot.updatedAt),
    })),
    skipDuplicates: true,
  });
  await prisma.asset.createMany({
    data: graph.assets.map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      type: asset.type,
      canonicalName: asset.canonicalName,
      aliases: asset.aliases,
      status: asset.status,
      continuityNotes: asset.continuityNotes,
      negativePrompts: asset.negativePrompts,
      description: asset.description,
      firstAppearance: toPrismaJson(asset.firstAppearance),
      isUserEdited: asset.isUserEdited ?? false,
      createdAt: new Date(asset.createdAt),
      updatedAt: new Date(asset.updatedAt),
    })),
    skipDuplicates: true,
  });
  await Promise.all(
    graph.assetDetails.map((detail) => {
      const asset = graph.assets.find((candidate) => candidate.id === detail.assetId);
      return asset ? persistAssetDetailState(asset, detail) : undefined;
    }),
  );
  await prisma.assetVersion.createMany({
    data: graph.assetVersions.map((version) => ({
      id: version.id,
      assetId: version.assetId,
      versionNumber: version.versionNumber,
      description: version.description,
      promptFragments: toPrismaJson(version.promptFragments),
      status: version.status,
      createdAt: new Date(version.createdAt),
    })),
    skipDuplicates: true,
  });
  await prisma.assetReference.createMany({
    data: graph.assetReferences.map((reference) => ({
      id: reference.id,
      assetVersionId: reference.assetVersionId,
      referenceType: reference.referenceType,
      filePath: reference.filePath,
      mimeType: reference.mimeType,
      width: reference.width,
      height: reference.height,
      thumbnailPath: reference.thumbnailPath,
      generationJobId: reference.generationJobId,
      createdAt: new Date(reference.createdAt),
    })),
    skipDuplicates: true,
  });
  await prisma.sceneAssetReq.createMany({
    data: graph.sceneAssetRequirements,
    skipDuplicates: true,
  });
  await prisma.shotAssetReq.createMany({
    data: graph.shotAssetRequirements,
    skipDuplicates: true,
  });
  await prisma.storyboardFrame.createMany({
    data: graph.storyboardFrames.map((frame) => ({
      id: frame.id,
      shotId: frame.shotId,
      keyframeIndex: frame.keyframeIndex,
      sketchFilePath: frame.sketchFilePath,
      sketchWarning: frame.sketchWarning,
      createdAt: new Date(frame.createdAt),
      updatedAt: new Date(frame.updatedAt),
    })),
    skipDuplicates: true,
  });
  await prisma.frameVersion.createMany({
    data: graph.frameVersions.map((version) => ({
      id: version.id,
      frameId: version.frameId,
      versionNumber: version.versionNumber,
      prompt: version.prompt,
      filePath: version.filePath,
      thumbnailPath: version.thumbnailPath,
      status: version.status,
      isStale: version.isStale,
      generationJobId: version.generationJobId,
      annotations: toPrismaJson(version.annotations),
      createdAt: new Date(version.createdAt),
    })),
    skipDuplicates: true,
  });
  await prisma.videoClip.createMany({
    data: graph.videoClips.map((clip) => ({
      id: clip.id,
      shotId: clip.shotId,
      sceneId: clip.sceneId,
      createdAt: new Date(clip.createdAt),
      updatedAt: new Date(clip.updatedAt),
    })),
    skipDuplicates: true,
  });
  await prisma.clipVersion.createMany({
    data: graph.clipVersions.map((version) => ({
      id: version.id,
      clipId: version.clipId,
      versionNumber: version.versionNumber,
      prompt: version.prompt,
      filePath: version.filePath,
      thumbnailPath: version.thumbnailPath,
      durationMs: version.durationMs,
      status: version.status,
      isStale: version.isStale,
      sourceFrameVersionIds: toPrismaJson(version.sourceFrameVersionIds) ?? [],
      generationJobId: version.generationJobId,
      createdAt: new Date(version.createdAt),
    })),
    skipDuplicates: true,
  });
  await prisma.reviewNote.createMany({
    data: graph.reviewNotes.map((note) => ({
      id: note.id,
      projectId: note.projectId,
      authorId: note.authorId,
      targetType: note.targetType,
      targetId: note.targetId,
      parentNoteId: note.parentNoteId,
      body: note.body,
      markupFilePath: note.markupFilePath,
      status: note.status,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    })),
    skipDuplicates: true,
  });
}

export async function persistAssetDetailState(asset: Asset, detail: AssetDetail) {
  const store = getStore();
  const existing = store.assetDetails.find((candidate) => candidate.assetId === detail.assetId);
  if (existing) {
    Object.assign(existing, detail);
  } else {
    store.assetDetails.push(detail);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await persistAssetState(asset);
  if (asset.type === "character") {
    await prisma.characterDetail.upsert({
      where: { assetId: asset.id },
      update: {
        role: detail.role ?? "supporting",
        narrativeDescription: detail.narrativeDescription ?? "",
        physicalDescription: detail.physicalDescription ?? "",
        personalityNotes: detail.personalityNotes,
        performanceNotes: detail.performanceNotes,
        scaleReference: detail.scaleReference,
      },
      create: {
        assetId: asset.id,
        role: detail.role ?? "supporting",
        narrativeDescription: detail.narrativeDescription ?? "",
        physicalDescription: detail.physicalDescription ?? "",
        personalityNotes: detail.personalityNotes,
        performanceNotes: detail.performanceNotes,
        scaleReference: detail.scaleReference,
      },
    });
  }
  if (asset.type === "wardrobe") {
    await prisma.wardrobeDetail.upsert({
      where: { assetId: asset.id },
      update: {
        outfitName: detail.outfitName ?? asset.canonicalName,
        storyContext: detail.storyContext ?? "",
        materialNotes: detail.materialNotes,
        accessories: toPrismaJson(detail.accessories ?? []),
        colorPalette: toPrismaJson(detail.colorPalette ?? []),
      },
      create: {
        assetId: asset.id,
        outfitName: detail.outfitName ?? asset.canonicalName,
        storyContext: detail.storyContext ?? "",
        materialNotes: detail.materialNotes,
        accessories: toPrismaJson(detail.accessories ?? []) ?? [],
        colorPalette: toPrismaJson(detail.colorPalette ?? []) ?? [],
      },
    });
  }
  if (asset.type === "location") {
    await prisma.locationDetail.upsert({
      where: { assetId: asset.id },
      update: {
        floorPlanNotes: detail.floorPlanNotes,
        entranceExitNotes: detail.entranceExitNotes,
        setDressing: detail.setDressing,
        lightingStates: toPrismaJson(detail.lightingStates),
        cameraSafeZones: detail.cameraSafeZones,
      },
      create: {
        assetId: asset.id,
        floorPlanNotes: detail.floorPlanNotes,
        entranceExitNotes: detail.entranceExitNotes,
        setDressing: detail.setDressing,
        lightingStates: toPrismaJson(detail.lightingStates),
        cameraSafeZones: detail.cameraSafeZones,
      },
    });
  }
  if (asset.type === "creature") {
    await prisma.creatureDetail.upsert({
      where: { assetId: asset.id },
      update: {
        speciesType: detail.speciesType ?? asset.canonicalName,
        anatomyNotes: detail.anatomyNotes,
        scaleReference: detail.scaleReference,
        movementNotes: detail.movementNotes,
        textureDetails: detail.textureDetails,
      },
      create: {
        assetId: asset.id,
        speciesType: detail.speciesType ?? asset.canonicalName,
        anatomyNotes: detail.anatomyNotes,
        scaleReference: detail.scaleReference,
        movementNotes: detail.movementNotes,
        textureDetails: detail.textureDetails,
      },
    });
  }
  if (asset.type === "prop") {
    await prisma.propDetail.upsert({
      where: { assetId: asset.id },
      update: {
        ownerOrScene: detail.ownerOrScene,
        materialAndWear: detail.materialAndWear,
        scaleReference: detail.scaleReference,
        interactionNotes: detail.interactionNotes,
      },
      create: {
        assetId: asset.id,
        ownerOrScene: detail.ownerOrScene,
        materialAndWear: detail.materialAndWear,
        scaleReference: detail.scaleReference,
        interactionNotes: detail.interactionNotes,
      },
    });
  }
}

export async function persistProjectStyleState(style: ProjectStyle) {
  const store = getStore();
  const existing = store.projectStyles.find((candidate) => candidate.projectId === style.projectId);
  if (existing) {
    Object.assign(existing, style);
  } else {
    store.projectStyles.push(style);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.projectStyle.update({
    where: { projectId: style.projectId },
    data: {
      styleName: style.styleName,
      description: style.description,
      colorPalette: toPrismaJson(style.colorPalette) ?? [],
      lightingRules: style.lightingRules,
      renderingMedium: style.renderingMedium,
      lensLanguage: style.lensLanguage,
      negativeConstraints: style.negativeConstraints,
      modelPromptFragments: toPrismaJson(style.modelPromptFragments) ?? {},
      approvalStatus: style.approvalStatus,
    },
  });
}

export async function persistStoryboardFrameState(frame: StoryboardFrame) {
  const store = getStore();
  const existing = store.storyboardFrames.find((candidate) => candidate.id === frame.id);
  if (existing) {
    Object.assign(existing, frame);
  } else {
    store.storyboardFrames.push(frame);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.storyboardFrame.upsert({
    where: { id: frame.id },
    update: {
      shotId: frame.shotId,
      keyframeIndex: frame.keyframeIndex,
      sketchFilePath: frame.sketchFilePath,
      sketchWarning: frame.sketchWarning,
      updatedAt: new Date(frame.updatedAt),
    },
    create: {
      id: frame.id,
      shotId: frame.shotId,
      keyframeIndex: frame.keyframeIndex,
      sketchFilePath: frame.sketchFilePath,
      sketchWarning: frame.sketchWarning,
      createdAt: new Date(frame.createdAt),
      updatedAt: new Date(frame.updatedAt),
    },
  });
}

export async function persistGeneratedFrameVersion(input: {
  frame: StoryboardFrame;
  version: FrameVersion;
  shot: Shot;
}) {
  const store = getStore();
  const existingFrame = store.storyboardFrames.find((candidate) => candidate.id === input.frame.id);
  if (existingFrame) {
    Object.assign(existingFrame, input.frame);
  } else {
    store.storyboardFrames.push(input.frame);
  }
  const existingShot = store.shots.find((candidate) => candidate.id === input.shot.id);
  if (existingShot) {
    Object.assign(existingShot, input.shot);
  }
  if (!store.frameVersions.some((candidate) => candidate.id === input.version.id)) {
    store.frameVersions.push(input.version);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await persistStoryboardFrameState(input.frame);
  await prisma.frameVersion.create({
    data: {
      id: input.version.id,
      frameId: input.version.frameId,
      versionNumber: input.version.versionNumber,
      prompt: input.version.prompt,
      filePath: input.version.filePath,
      thumbnailPath: input.version.thumbnailPath,
      status: input.version.status,
      isStale: input.version.isStale,
      generationJobId: input.version.generationJobId,
      annotations: toPrismaJson(input.version.annotations),
      createdAt: new Date(input.version.createdAt),
    },
  });
  await prisma.shot.update({ where: { id: input.shot.id }, data: { status: input.shot.status } });
  if (input.version.generationJobId) {
    await prisma.generationJob.update({
      where: { id: input.version.generationJobId },
      data: {
        status: "complete",
        outputPayload: toPrismaJson({ frameId: input.frame.id, frameVersionId: input.version.id }),
        completedAt: new Date(),
      },
    });
  }
}

export async function persistFrameVersionState(version: FrameVersion) {
  const store = getStore();
  if (version.status === "approved") {
    store.frameVersions
      .filter((candidate) => candidate.frameId === version.frameId && candidate.status === "approved" && candidate.id !== version.id)
      .forEach((candidate) => {
        candidate.status = "superseded";
      });
  }
  const existing = store.frameVersions.find((candidate) => candidate.id === version.id);
  if (existing) {
    Object.assign(existing, version);
  } else {
    store.frameVersions.push(version);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  if (version.status === "approved") {
    await prisma.frameVersion.updateMany({
      where: { frameId: version.frameId, status: "approved", id: { not: version.id } },
      data: { status: "superseded" },
    });
  }
  await prisma.frameVersion.update({
    where: { id: version.id },
    data: {
      status: version.status,
      annotations: toPrismaJson(version.annotations),
      isStale: version.isStale,
    },
  });
}

export async function persistReviewNoteState(note: ReviewNote) {
  const store = getStore();
  if (!store.reviewNotes.some((candidate) => candidate.id === note.id)) {
    store.reviewNotes.push(note);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.reviewNote.create({
    data: {
      id: note.id,
      projectId: note.projectId,
      authorId: note.authorId,
      targetType: note.targetType,
      targetId: note.targetId,
      parentNoteId: note.parentNoteId,
      body: note.body,
      markupFilePath: note.markupFilePath,
      status: note.status,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    },
  });
}

export async function persistGeneratedClipVersion(input: {
  clip: VideoClip;
  version: ClipVersion;
}) {
  const store = getStore();
  const existingClip = store.videoClips.find((candidate) => candidate.id === input.clip.id);
  if (existingClip) {
    Object.assign(existingClip, input.clip);
  } else {
    store.videoClips.push(input.clip);
  }
  if (!store.clipVersions.some((candidate) => candidate.id === input.version.id)) {
    store.clipVersions.push(input.version);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.videoClip.upsert({
    where: { id: input.clip.id },
    update: {
      shotId: input.clip.shotId,
      sceneId: input.clip.sceneId,
      updatedAt: new Date(input.clip.updatedAt),
    },
    create: {
      id: input.clip.id,
      shotId: input.clip.shotId,
      sceneId: input.clip.sceneId,
      createdAt: new Date(input.clip.createdAt),
      updatedAt: new Date(input.clip.updatedAt),
    },
  });
  await prisma.clipVersion.create({
    data: {
      id: input.version.id,
      clipId: input.version.clipId,
      versionNumber: input.version.versionNumber,
      prompt: input.version.prompt,
      filePath: input.version.filePath,
      thumbnailPath: input.version.thumbnailPath,
      durationMs: input.version.durationMs,
      status: input.version.status,
      isStale: input.version.isStale,
      sourceFrameVersionIds: toPrismaJson(input.version.sourceFrameVersionIds) ?? [],
      generationJobId: input.version.generationJobId,
      createdAt: new Date(input.version.createdAt),
    },
  });
  if (input.version.generationJobId) {
    await prisma.generationJob.update({
      where: { id: input.version.generationJobId },
      data: {
        status: "complete",
        outputPayload: toPrismaJson({ clipId: input.clip.id, clipVersionId: input.version.id }),
        completedAt: new Date(),
      },
    });
  }
}

export async function persistClipVersionState(version: ClipVersion) {
  const store = getStore();
  if (version.status === "approved") {
    store.clipVersions
      .filter((candidate) => candidate.clipId === version.clipId && candidate.status === "approved" && candidate.id !== version.id)
      .forEach((candidate) => {
        candidate.status = "superseded";
      });
  }
  const existing = store.clipVersions.find((candidate) => candidate.id === version.id);
  if (existing) {
    Object.assign(existing, version);
  } else {
    store.clipVersions.push(version);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  if (version.status === "approved") {
    await prisma.clipVersion.updateMany({
      where: { clipId: version.clipId, status: "approved", id: { not: version.id } },
      data: { status: "superseded" },
    });
  }
  await prisma.clipVersion.update({
    where: { id: version.id },
    data: {
      status: version.status,
      isStale: version.isStale,
    },
  });
}

export async function findInvitationByTokenHash(tokenHash: string) {
  if (isPrismaRepositoryEnabled()) {
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash } }).catch(() => undefined);
    if (invitation) {
      return mapInvitation(invitation);
    }
  }
  return getStore().invitations.find((candidate) => candidate.tokenHash === tokenHash);
}

export async function persistInvitationState(invitation: Invitation) {
  const store = getStore();
  const existing = store.invitations.find((candidate) => candidate.id === invitation.id);
  if (existing) {
    Object.assign(existing, invitation);
  } else {
    store.invitations.push(invitation);
  }
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.invitation.upsert({
    where: { id: invitation.id },
    update: {
      workspaceId: invitation.workspaceId,
      projectId: invitation.projectId,
      email: invitation.email,
      tokenHash: invitation.tokenHash,
      scope: invitation.scope,
      role: invitation.role,
      status: invitation.status,
      expiresAt: new Date(invitation.expiresAt),
      invitedById: invitation.invitedById,
      acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : null,
    },
    create: {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      projectId: invitation.projectId,
      email: invitation.email,
      tokenHash: invitation.tokenHash,
      scope: invitation.scope,
      role: invitation.role,
      status: invitation.status,
      expiresAt: new Date(invitation.expiresAt),
      invitedById: invitation.invitedById,
      acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : null,
      createdAt: new Date(invitation.createdAt),
    },
  });
}

export async function persistProjectMemberState(member: ProjectMember) {
  const store = getStore();
  const existing = store.projectMembers.find((candidate) => candidate.id === member.id);
  if (existing) {
    Object.assign(existing, member);
  } else {
    store.projectMembers.push(member);
  }
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: member.projectId, userId: member.userId } },
    update: { role: member.role },
    create: {
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
      joinedAt: new Date(member.joinedAt),
    },
  });
}

export async function persistAssignmentState(assignment: Assignment) {
  const store = getStore();
  const existing = store.assignments.find((candidate) => candidate.id === assignment.id);
  if (existing) {
    Object.assign(existing, assignment);
  } else {
    store.assignments.push(assignment);
  }
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.assignment.upsert({
    where: { id: assignment.id },
    update: {
      projectId: assignment.projectId,
      userId: assignment.userId,
      targetType: assignment.targetType,
      sceneId: assignment.sceneId,
      shotId: assignment.shotId,
      assetId: assignment.assetId,
      status: assignment.status,
      updatedAt: new Date(assignment.updatedAt),
    },
    create: {
      id: assignment.id,
      projectId: assignment.projectId,
      userId: assignment.userId,
      targetType: assignment.targetType,
      sceneId: assignment.sceneId,
      shotId: assignment.shotId,
      assetId: assignment.assetId,
      status: assignment.status,
      createdAt: new Date(assignment.createdAt),
      updatedAt: new Date(assignment.updatedAt),
    },
  });
}

export async function persistActivityEventState(event: ActivityEvent) {
  const store = getStore();
  if (!store.activityEvents.some((candidate) => candidate.id === event.id)) {
    store.activityEvents.push(event);
  }
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.activityEvent.create({
    data: {
      id: event.id,
      projectId: event.projectId,
      actorId: event.actorId,
      eventType: event.eventType,
      message: event.message,
      metadata: toPrismaJson(event.metadata),
      createdAt: new Date(event.createdAt),
    },
  });
}

export async function persistAssetVersionState(version: AssetVersion) {
  const store = getStore();
  const existing = store.assetVersions.find((candidate) => candidate.id === version.id);
  if (existing) {
    Object.assign(existing, version);
  } else {
    store.assetVersions.push(version);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.assetVersion.create({
    data: {
      id: version.id,
      assetId: version.assetId,
      versionNumber: version.versionNumber,
      description: version.description,
      promptFragments: toPrismaJson(version.promptFragments),
      status: version.status,
      createdAt: new Date(version.createdAt),
    },
  });
}

export async function persistAssetVersionAndReference(input: {
  version: AssetVersion;
  reference: AssetReference;
}) {
  const store = getStore();
  await persistAssetVersionState(input.version);
  const existing = store.assetReferences.find((candidate) => candidate.id === input.reference.id);
  if (existing) {
    Object.assign(existing, input.reference);
  } else {
    store.assetReferences.push(input.reference);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.assetReference.create({
    data: {
      id: input.reference.id,
      assetVersionId: input.reference.assetVersionId,
      referenceType: input.reference.referenceType,
      filePath: input.reference.filePath,
      mimeType: input.reference.mimeType,
      width: input.reference.width,
      height: input.reference.height,
      thumbnailPath: input.reference.thumbnailPath,
      generationJobId: input.reference.generationJobId,
    },
  });
}

export async function persistSceneAssetRequirement(input: SceneAssetRequirement) {
  const store = getStore();
  const existing = store.sceneAssetRequirements.find((candidate) => candidate.id === input.id);
  if (existing) {
    Object.assign(existing, input);
  } else {
    store.sceneAssetRequirements.push(input);
  }

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.sceneAssetReq.createMany({
    data: [
      {
        id: input.id,
        sceneId: input.sceneId,
        assetId: input.assetId,
        isOptional: input.isOptional,
        detectedBy: input.detectedBy,
      },
    ],
    skipDuplicates: true,
  });
}

export async function deleteSceneAssetRequirement(requirementId: string) {
  const store = getStore();
  store.sceneAssetRequirements = store.sceneAssetRequirements.filter((req) => req.id !== requirementId);

  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.sceneAssetReq.deleteMany({ where: { id: requirementId } });
}

export async function refreshPrismaReadiness(projectId: string) {
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  const graph = await getScriptAnalysisGraphForProject(projectId);
  const approvedAssetIds = new Set(
    graph.assets.filter((asset) => ["approved", "locked"].includes(asset.status)).map((asset) => asset.id),
  );
  await Promise.all(
    graph.scenes.map((scene) => {
      const reqs = graph.sceneAssetRequirements.filter((req) => req.sceneId === scene.id && !req.isOptional);
      const status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
      return prisma.scene.update({ where: { id: scene.id }, data: { status } }).catch(() => undefined);
    }),
  );
  await Promise.all(
    graph.shots.map((shot) => {
      const reqs = graph.shotAssetRequirements.filter((req) => req.shotId === shot.id && !req.isOptional);
      const status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
      return prisma.shot.update({ where: { id: shot.id }, data: { status } }).catch(() => undefined);
    }),
  );
}

export function refreshLocalReadiness(projectId: string) {
  const store = getStore();
  const approvedAssetIds = new Set(
    store.assets.filter((asset) => asset.projectId === projectId && ["approved", "locked"].includes(asset.status)).map((asset) => asset.id),
  );
  for (const scene of store.scenes) {
    const reqs = store.sceneAssetRequirements.filter((req) => req.sceneId === scene.id && !req.isOptional);
    scene.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
  for (const shot of store.shots) {
    const reqs = store.shotAssetRequirements.filter((req) => req.shotId === shot.id && !req.isOptional);
    shot.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
}

export async function updateProject(
  projectId: string,
  input: Partial<Pick<Project, "title" | "targetFormat" | "aspectRatio" | "estimatedRuntime" | "rightsPolicy">>,
) {
  if (isPrismaRepositoryEnabled()) {
    const project = await prisma.project.update({ where: { id: projectId }, data: input }).catch(() => undefined);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }
    return mapProject(project);
  }
  const project = await getProject(projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  Object.assign(project, input, { updatedAt: nowIso() });
  return project;
}

export async function deleteProject(projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    await prisma.project.delete({ where: { id: projectId } }).catch(() => {
      throw new NotFoundError("Project not found.");
    });
    return;
  }
  const store = getStore();
  const before = store.projects.length;
  store.projects = store.projects.filter((project) => project.id !== projectId);
  store.projectMembers = store.projectMembers.filter((member) => member.projectId !== projectId);
  store.projectStyles = store.projectStyles.filter((style) => style.projectId !== projectId);
  store.generationJobs = store.generationJobs.filter((job) => job.projectId !== projectId);
  store.jobEvents = store.jobEvents.filter((event) => event.projectId !== projectId);
  const scriptIds = new Set(store.scripts.filter((script) => script.projectId === projectId).map((script) => script.id));
  const versionIds = new Set(
    store.scriptVersions.filter((version) => scriptIds.has(version.scriptId)).map((version) => version.id),
  );
  const sceneIds = new Set(store.scenes.filter((scene) => versionIds.has(scene.scriptVersionId)).map((scene) => scene.id));
  const shotIds = new Set(store.shots.filter((shot) => sceneIds.has(shot.sceneId)).map((shot) => shot.id));
  const assetIds = new Set(store.assets.filter((asset) => asset.projectId === projectId).map((asset) => asset.id));
  store.shotAssetRequirements = store.shotAssetRequirements.filter(
    (requirement) => !shotIds.has(requirement.shotId) && !assetIds.has(requirement.assetId),
  );
  store.sceneAssetRequirements = store.sceneAssetRequirements.filter(
    (requirement) => !sceneIds.has(requirement.sceneId) && !assetIds.has(requirement.assetId),
  );
  store.shots = store.shots.filter((shot) => !shotIds.has(shot.id));
  store.scenes = store.scenes.filter((scene) => !sceneIds.has(scene.id));
  store.scriptVersions = store.scriptVersions.filter((version) => !versionIds.has(version.id));
  store.scripts = store.scripts.filter((script) => script.projectId !== projectId);
  store.assets = store.assets.filter((asset) => asset.projectId !== projectId);
  store.assetDetails = store.assetDetails.filter((detail) => !assetIds.has(detail.assetId));
  const versionIdsToDelete = new Set(
    store.assetVersions.filter((version) => assetIds.has(version.assetId)).map((version) => version.id),
  );
  store.assetReferences = store.assetReferences.filter((reference) => !versionIdsToDelete.has(reference.assetVersionId));
  store.assetVersions = store.assetVersions.filter((version) => !assetIds.has(version.assetId));
  const frameIds = new Set(store.storyboardFrames.filter((frame) => shotIds.has(frame.shotId)).map((frame) => frame.id));
  store.frameVersions = store.frameVersions.filter((version) => !frameIds.has(version.frameId));
  store.storyboardFrames = store.storyboardFrames.filter((frame) => !shotIds.has(frame.shotId));
  store.reviewNotes = store.reviewNotes.filter((note) => note.projectId !== projectId);
  const clipIds = new Set(
    store.videoClips
      .filter((clip) => (clip.shotId ? shotIds.has(clip.shotId) : clip.sceneId ? sceneIds.has(clip.sceneId) : false))
      .map((clip) => clip.id),
  );
  store.clipVersions = store.clipVersions.filter((version) => !clipIds.has(version.clipId));
  store.videoClips = store.videoClips.filter((clip) => !clipIds.has(clip.id));
  store.invitations = store.invitations.filter((invitation) => invitation.projectId !== projectId);
  store.assignments = store.assignments.filter((assignment) => assignment.projectId !== projectId);
  store.activityEvents = store.activityEvents.filter((activity) => activity.projectId !== projectId);
  store.exportBundles = store.exportBundles.filter((bundle) => bundle.projectId !== projectId);
  if (store.projects.length === before) {
    throw new NotFoundError("Project not found.");
  }
}

export async function addExportBundle(bundle: ExportBundle) {
  const store = getStore();
  if (!store.exportBundles.some((candidate) => candidate.id === bundle.id)) {
    store.exportBundles.push(bundle);
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.exportBundle.create({
      data: {
        id: bundle.id,
        projectId: bundle.projectId,
        bundleVersion: bundle.bundleVersion,
        manifestPath: bundle.manifestPath,
        mediaFileCount: bundle.mediaFileCount,
        metadataRecordCount: bundle.metadataRecordCount,
        createdById: bundle.createdById,
        createdAt: new Date(bundle.createdAt),
      },
    });
  }
  return bundle;
}

export async function listExportBundles(projectId: string) {
  if (isPrismaRepositoryEnabled()) {
    const bundles = await prisma.exportBundle.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }).catch(() => undefined);
    if (bundles) {
      return bundles.map(mapExportBundle);
    }
  }
  return getStore().exportBundles.filter((bundle) => bundle.projectId === projectId);
}

export async function completeGenerationJob(
  jobId: string,
  input: {
    status: GenerationJob["status"];
    outputPayload?: unknown;
    errorMessage?: string;
    errorClass?: GenerationJob["errorClass"];
    retryCount?: number;
  },
) {
  const job = getStore().generationJobs.find((candidate) => candidate.id === jobId);
  if (!job) {
    if (!isPrismaRepositoryEnabled()) {
      throw new NotFoundError("Generation job not found.");
    }
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: input.status,
        outputPayload: toPrismaJson(input.outputPayload),
        errorMessage: input.errorMessage,
        errorClass: input.errorClass,
        retryCount: input.retryCount,
        completedAt: new Date(),
      },
    });
    return undefined;
  }
  Object.assign(job, {
    status: input.status,
    outputPayload: input.outputPayload,
    errorMessage: input.errorMessage,
    errorClass: input.errorClass,
    retryCount: input.retryCount ?? job.retryCount,
    completedAt: nowIso(),
  });
  if (isPrismaRepositoryEnabled()) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: input.status,
        outputPayload: toPrismaJson(input.outputPayload),
        errorMessage: input.errorMessage,
        errorClass: input.errorClass,
        retryCount: input.retryCount,
        completedAt: new Date(job.completedAt!),
      },
    });
  }
  return job;
}

export async function markGenerationJobProviderSubmitted(
  jobId: string,
  input: { providerJobId: string; outputPayload?: unknown },
) {
  const job = getStore().generationJobs.find((candidate) => candidate.id === jobId);
  const submittedAt = nowIso();
  if (job) {
    Object.assign(job, {
      status: "provider_submitted" as const,
      providerJobId: input.providerJobId,
      outputPayload: input.outputPayload,
      completedAt: undefined,
    });
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "provider_submitted",
        providerJobId: input.providerJobId,
        outputPayload: toPrismaJson(input.outputPayload),
        startedAt: new Date(submittedAt),
      },
    });
  }
  return job;
}

export async function getGenerationJob(jobId: string) {
  const local = getStore().generationJobs.find((candidate) => candidate.id === jobId);
  if (local) {
    return local;
  }
  if (!isPrismaRepositoryEnabled()) {
    return undefined;
  }
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } }).catch(() => undefined);
  return job ? mapJob(job) : undefined;
}

export async function listSubmittedProviderJobs(input: {
  type?: GenerationJob["type"];
  providerSlug?: string;
} = {}) {
  const statuses: GenerationJob["status"][] = ["provider_submitted", "polling"];
  if (isPrismaRepositoryEnabled()) {
    const jobs = await prisma.generationJob.findMany({
      where: {
        status: { in: statuses },
        ...(input.type ? { type: input.type } : {}),
        ...(input.providerSlug ? { providerSlug: input.providerSlug } : {}),
      },
      orderBy: { createdAt: "asc" },
    }).catch(() => undefined);
    if (jobs) {
      return jobs.map(mapJob);
    }
  }
  return getStore().generationJobs.filter(
    (job) =>
      statuses.includes(job.status) &&
      (!input.type || job.type === input.type) &&
      (!input.providerSlug || job.providerSlug === input.providerSlug),
  );
}

export async function markGenerationJobRunning(jobId: string, status: GenerationJob["status"] = "running") {
  const startedAt = nowIso();
  const local = getStore().generationJobs.find((candidate) => candidate.id === jobId);
  if (local) {
    Object.assign(local, { status, startedAt });
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status, startedAt: new Date(startedAt) },
    });
  }
  if (!local && !isPrismaRepositoryEnabled()) {
    throw new NotFoundError("Generation job not found.");
  }
  return local ?? getGenerationJob(jobId);
}

export async function saveProviderKey(
  workspaceId: string,
  input: { providerSlug: string; apiKey: string; label?: string },
) {
  const providerSlug = input.providerSlug.trim().toLowerCase();
  if (!isLiveProviderSlug(providerSlug)) {
    throw new AppError(
      "Provider keys are supported for OpenAI, Stability, and Runway.",
      400,
      "unsupported_provider",
    );
  }
  const apiKey = input.apiKey.trim();
  if (!providerSlug || apiKey.length < 3) {
    throw new AppError("Provider slug and API key are required.");
  }
  if (process.env.NODE_ENV === "production" && apiKey === "mock") {
    throw new AppError("A real provider API key is required in production.", 400, "provider_key_missing");
  }

  if (isPrismaRepositoryEnabled()) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundError("Workspace not found.");
    }
    const encrypted = encryptProviderKey(apiKey);
    await prisma.providerKey.deleteMany({ where: { workspaceId, providerSlug } });
    const providerKey = await prisma.providerKey.create({
      data: {
        workspaceId,
        providerSlug,
        encryptedKey: Buffer.from(encrypted.encryptedKey, "base64"),
        keyNonce: Buffer.from(encrypted.keyNonce, "base64"),
        label: input.label?.trim() || providerSlug,
      },
    });
    return toSafeProviderKey(mapProviderKey(providerKey));
  }

  const store = getStore();
  const workspace = store.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    throw new NotFoundError("Workspace not found.");
  }

  const timestamp = nowIso();
  const encrypted = encryptProviderKey(apiKey);
  const providerKey: ProviderKey = {
    id: createId(),
    workspaceId,
    providerSlug,
    encryptedKey: encrypted.encryptedKey,
    keyNonce: encrypted.keyNonce,
    label: input.label?.trim() || providerSlug,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.providerKeys = store.providerKeys.filter(
    (key) => !(key.workspaceId === workspaceId && key.providerSlug === providerSlug),
  );
  store.providerKeys.push(providerKey);
  return toSafeProviderKey(providerKey);
}

export async function listProviderKeys(workspaceId: string) {
  if (isPrismaRepositoryEnabled()) {
    const keys = await prisma.providerKey.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return keys.map((key) => toSafeProviderKey(mapProviderKey(key)));
  }
  return getStore()
    .providerKeys.filter((key) => key.workspaceId === workspaceId)
    .map(toSafeProviderKey);
}

export async function decryptWorkspaceProviderKey(workspaceId: string, providerSlug: string) {
  if (isPrismaRepositoryEnabled()) {
    const key = await prisma.providerKey.findFirst({ where: { workspaceId, providerSlug } });
    if (!key) {
      throw new NotFoundError("Provider key not found.");
    }
    return decryptProviderKey(mapProviderKey(key));
  }
  const key = getStore().providerKeys.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.providerSlug === providerSlug,
  );
  if (!key) {
    throw new NotFoundError("Provider key not found.");
  }
  return decryptProviderKey(key);
}

export async function decryptProjectProviderKey(projectId: string, providerSlug: string) {
  const project = await getProject(projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  return decryptWorkspaceProviderKey(project.workspaceId, providerSlug);
}

export async function createGenerationJob(input: {
  projectId: string;
  type: GenerationJob["type"];
  providerSlug?: string;
  modelId?: string;
  inputPayload: unknown;
}) {
  const timestamp = nowIso();
  const job: GenerationJob = {
    id: createId(),
    projectId: input.projectId,
    type: input.type,
    providerSlug: input.providerSlug,
    modelId: input.modelId,
    status: "queued",
    inputPayload: input.inputPayload,
    retryCount: 0,
    createdAt: timestamp,
  };
  if (isPrismaRepositoryEnabled()) {
    await prisma.generationJob.create({
      data: {
        id: job.id,
        projectId: job.projectId,
        type: job.type,
        providerSlug: job.providerSlug,
        modelId: job.modelId,
        status: job.status,
        inputPayload: toPrismaJson(job.inputPayload) ?? {},
        retryCount: job.retryCount,
      },
    });
  }
  getStore().generationJobs.push(job);
  await submitGenerationJob(job);
  await addJobEvent({
    jobId: job.id,
    projectId: job.projectId,
    eventType: "status_change",
    message: "Job queued.",
    progressPct: 0,
  });
  return job;
}

export async function addJobEvent(input: Omit<JobEvent, "id" | "createdAt">) {
  const event: JobEvent = {
    ...input,
    id: createId(),
    createdAt: nowIso(),
  };
  if (isPrismaRepositoryEnabled()) {
    await prisma.jobEvent.create({
      data: {
        id: event.id,
        jobId: event.jobId,
        projectId: event.projectId,
        eventType: event.eventType,
        message: event.message,
        progressPct: event.progressPct,
      },
    });
  }
  getStore().jobEvents.push(event);
  emitProjectEvent(event);
  return event;
}

export async function listProjectEvents(projectId: string, afterEventId?: string) {
  if (isPrismaRepositoryEnabled()) {
    const events = (await prisma.jobEvent.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } })).map(
      mapJobEvent,
    );
    if (!afterEventId) {
      return events;
    }
    const index = events.findIndex((event) => event.id === afterEventId);
    return index === -1 ? events : events.slice(index + 1);
  }
  const events = getStore().jobEvents.filter((event) => event.projectId === projectId);
  if (!afterEventId) {
    return events;
  }
  const index = events.findIndex((event) => event.id === afterEventId);
  return index === -1 ? events : events.slice(index + 1);
}

function toSafeProviderKey(key: ProviderKey) {
  return {
    id: key.id,
    workspaceId: key.workspaceId,
    providerSlug: key.providerSlug,
    label: key.label,
    maskedKey: maskProviderKey(decryptProviderKey(key)),
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}
