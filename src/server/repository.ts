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
    videoClips: [],
    clipVersions: [],
    invitations: [],
    assignments: [],
    activityEvents: [],
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

  const existingVersions = store.scriptVersions.filter((version) => version.scriptId === script.id);
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

export async function updateScriptVersionAnalysisStatus(scriptVersionId: string, status: ScriptVersion["analysisStatus"]) {
  const version = getStore().scriptVersions.find((candidate) => candidate.id === scriptVersionId);
  if (version) {
    version.analysisStatus = status;
  }
  if (isPrismaRepositoryEnabled()) {
    await prisma.scriptVersion.update({ where: { id: scriptVersionId }, data: { analysisStatus: status } }).catch(() => undefined);
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
  if (!isPrismaRepositoryEnabled()) {
    return;
  }

  const previousScenes = await prisma.scene.findMany({
    where: { scriptVersionId: input.scriptVersionId },
    select: { id: true, sceneNumber: true, isUserEdited: true },
  });
  const previousSceneIds = previousScenes.map((scene) => scene.id);
  const previousShots = previousSceneIds.length
    ? await prisma.shot.findMany({
        where: { sceneId: { in: previousSceneIds } },
        select: { id: true, sceneId: true, shotNumber: true, isUserEdited: true },
      })
    : [];
  const previousShotIds = previousShots.map((shot) => shot.id);

  if (previousSceneIds.length) {
    await prisma.sceneAssetReq.deleteMany({ where: { sceneId: { in: previousSceneIds } } });
  }
  if (previousShotIds.length) {
    await prisma.shotAssetReq.deleteMany({ where: { shotId: { in: previousShotIds } } });
  }
  const generatedShotIds = previousShots.filter((shot) => !shot.isUserEdited).map((shot) => shot.id);
  if (generatedShotIds.length) {
    await prisma.shot.deleteMany({ where: { id: { in: generatedShotIds } } });
  }
  const generatedSceneIds = previousScenes.filter((scene) => !scene.isUserEdited).map((scene) => scene.id);
  if (generatedSceneIds.length) {
    await prisma.scene.deleteMany({ where: { id: { in: generatedSceneIds } } });
  }

  const sceneByNumber = new Map<number, { id: string; sceneNumber: number }>();
  for (const scene of input.scenes) {
    const existing = previousScenes.find((candidate) => candidate.sceneNumber === scene.sceneNumber && candidate.isUserEdited);
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
  const previousSceneNumberById = new Map(previousScenes.map((scene) => [scene.id, scene.sceneNumber]));
  for (const breakdown of input.shotBreakdowns) {
    const scene = sceneByNumber.get(breakdown.sceneNumber);
    if (!scene) {
      continue;
    }
    for (const shot of breakdown.shots) {
      const existing = previousShots.find(
        (candidate) =>
          candidate.isUserEdited &&
          previousSceneNumberById.get(candidate.sceneId) === breakdown.sceneNumber &&
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
  }).catch(() => undefined);
}

export async function persistAssetDetailState(asset: Asset, detail: AssetDetail) {
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
    }).catch(() => undefined);
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
    }).catch(() => undefined);
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
    }).catch(() => undefined);
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
    }).catch(() => undefined);
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
    }).catch(() => undefined);
  }
}

export async function persistProjectStyleState(style: ProjectStyle) {
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
  }).catch(() => undefined);
}

export async function persistStoryboardFrameState(frame: StoryboardFrame) {
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
  }).catch(() => undefined);
}

export async function persistGeneratedFrameVersion(input: {
  frame: StoryboardFrame;
  version: FrameVersion;
  shot: Shot;
}) {
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
  }).catch(() => undefined);
  await prisma.shot.update({ where: { id: input.shot.id }, data: { status: input.shot.status } }).catch(() => undefined);
  if (input.version.generationJobId) {
    await prisma.generationJob.update({
      where: { id: input.version.generationJobId },
      data: {
        status: "complete",
        outputPayload: toPrismaJson({ frameId: input.frame.id, frameVersionId: input.version.id }),
        completedAt: new Date(),
      },
    }).catch(() => undefined);
  }
}

export async function persistFrameVersionState(version: FrameVersion) {
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  if (version.status === "approved") {
    await prisma.frameVersion.updateMany({
      where: { frameId: version.frameId, status: "approved", id: { not: version.id } },
      data: { status: "superseded" },
    }).catch(() => undefined);
  }
  await prisma.frameVersion.update({
    where: { id: version.id },
    data: {
      status: version.status,
      annotations: toPrismaJson(version.annotations),
      isStale: version.isStale,
    },
  }).catch(() => undefined);
}

export async function persistReviewNoteState(note: ReviewNote) {
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
  }).catch(() => undefined);
}

export async function persistAssetVersionAndReference(input: {
  version: AssetVersion;
  reference: AssetReference;
}) {
  if (!isPrismaRepositoryEnabled()) {
    return;
  }
  await prisma.assetVersion.create({
    data: {
      id: input.version.id,
      assetId: input.version.assetId,
      versionNumber: input.version.versionNumber,
      description: input.version.description,
      promptFragments: toPrismaJson(input.version.promptFragments),
      status: input.version.status,
    },
  }).catch(() => undefined);
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
  }).catch(() => undefined);
}

export async function persistSceneAssetRequirement(input: SceneAssetRequirement) {
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

export function addExportBundle(bundle: ExportBundle) {
  getStore().exportBundles.push(bundle);
  return bundle;
}

export function listExportBundles(projectId: string) {
  return getStore().exportBundles.filter((bundle) => bundle.projectId === projectId);
}

export function completeGenerationJob(
  jobId: string,
  input: { status: GenerationJob["status"]; outputPayload?: unknown; errorMessage?: string },
) {
  const job = getStore().generationJobs.find((candidate) => candidate.id === jobId);
  if (!job) {
    throw new NotFoundError("Generation job not found.");
  }
  Object.assign(job, {
    status: input.status,
    outputPayload: input.outputPayload,
    errorMessage: input.errorMessage,
    completedAt: nowIso(),
  });
  if (isPrismaRepositoryEnabled()) {
    void prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: input.status,
        outputPayload: toPrismaJson(input.outputPayload),
        errorMessage: input.errorMessage,
        completedAt: new Date(job.completedAt!),
      },
    }).catch(() => undefined);
  }
  return job;
}

export async function saveProviderKey(
  workspaceId: string,
  input: { providerSlug: string; apiKey: string; label?: string },
) {
  const providerSlug = input.providerSlug.trim().toLowerCase();
  if (!providerSlug || input.apiKey.trim().length < 3) {
    throw new AppError("Provider slug and API key are required.");
  }

  if (isPrismaRepositoryEnabled()) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundError("Workspace not found.");
    }
    const encrypted = encryptProviderKey(input.apiKey.trim());
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
  const encrypted = encryptProviderKey(input.apiKey.trim());
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

export function createGenerationJob(input: {
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
  getStore().generationJobs.push(job);
  if (isPrismaRepositoryEnabled()) {
    void prisma.generationJob.create({
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
    }).catch(() => undefined);
  }
  void submitGenerationJob(job);
  addJobEvent({
    jobId: job.id,
    projectId: job.projectId,
    eventType: "status_change",
    message: "Job queued.",
    progressPct: 0,
  });
  return job;
}

export function addJobEvent(input: Omit<JobEvent, "id" | "createdAt">) {
  const event = emitProjectEvent(input);
  getStore().jobEvents.push(event);
  if (isPrismaRepositoryEnabled()) {
    void prisma.jobEvent.create({
      data: {
        id: event.id,
        jobId: event.jobId,
        projectId: event.projectId,
        eventType: event.eventType,
        message: event.message,
        progressPct: event.progressPct,
      },
    }).catch(() => undefined);
  }
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
