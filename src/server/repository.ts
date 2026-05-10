import {
  decryptProviderKey,
  encryptProviderKey,
  maskProviderKey,
} from "@/server/crypto";
import { AppError, AuthRequiredError, NotFoundError } from "@/server/errors";
import { createId, nowIso, slugify } from "@/server/ids";
import { emitProjectEvent } from "@/server/queue";
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
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/server/types";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

export async function signInWithCredentials(input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || input.password.length < 4) {
    throw new AppError("Enter a valid email and a password with at least four characters.", 401, "bad_credentials");
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

export function signOutSession(token: string | undefined) {
  if (!token) {
    return;
  }
  const store = getStore();
  store.sessions = store.sessions.filter((session) => session.token !== token);
}

export function getUserBySessionToken(token: string | undefined) {
  if (!token) {
    return undefined;
  }

  const store = getStore();
  const session = store.sessions.find((candidate) => candidate.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return undefined;
  }

  return store.users.find((user) => user.id === session.userId);
}

export function getOptionalSessionUser(token: string | undefined) {
  return getUserBySessionToken(token);
}

export function requireSessionUser(token: string | undefined) {
  const user = getUserBySessionToken(token);
  if (!user) {
    throw new AuthRequiredError();
  }
  return user;
}

export function createWorkspaceForUser(
  userId: string,
  input: { name: string; role?: WorkspaceRole },
) {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new AppError("Workspace name must be at least two characters.");
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

export function listWorkspacesForUser(userId: string) {
  const store = getStore();
  const workspaceIds = new Set(
    store.workspaceMembers.filter((member) => member.userId === userId).map((member) => member.workspaceId),
  );
  return store.workspaces.filter((workspace) => workspaceIds.has(workspace.id));
}

export function getWorkspaceRole(userId: string, workspaceId: string) {
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

export function listProjectsForUser(userId: string) {
  const store = getStore();
  const projectIds = new Set(
    store.projectMembers.filter((member) => member.userId === userId).map((member) => member.projectId),
  );
  return store.projects.filter((project) => projectIds.has(project.id));
}

export function getProject(projectId: string) {
  return getStore().projects.find((project) => project.id === projectId);
}

export function getProjectRole(userId: string, projectId: string) {
  return getStore().projectMembers.find(
    (member) => member.userId === userId && member.projectId === projectId,
  )?.role;
}

export function getProjectDashboard(projectId: string) {
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

export function updateProject(
  projectId: string,
  input: Partial<Pick<Project, "title" | "targetFormat" | "aspectRatio" | "estimatedRuntime" | "rightsPolicy">>,
) {
  const project = getProject(projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  Object.assign(project, input, { updatedAt: nowIso() });
  return project;
}

export function deleteProject(projectId: string) {
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
  if (store.projects.length === before) {
    throw new NotFoundError("Project not found.");
  }
}

export function saveProviderKey(
  workspaceId: string,
  input: { providerSlug: string; apiKey: string; label?: string },
) {
  const providerSlug = input.providerSlug.trim().toLowerCase();
  if (!providerSlug || input.apiKey.trim().length < 3) {
    throw new AppError("Provider slug and API key are required.");
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

export function listProviderKeys(workspaceId: string) {
  return getStore()
    .providerKeys.filter((key) => key.workspaceId === workspaceId)
    .map(toSafeProviderKey);
}

export function decryptWorkspaceProviderKey(workspaceId: string, providerSlug: string) {
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
  return event;
}

export function listProjectEvents(projectId: string, afterEventId?: string) {
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
