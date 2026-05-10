export type WorkspaceRole = "owner" | "admin" | "member";
export type ProjectRole = "owner" | "producer" | "artist" | "reviewer" | "viewer";
export type RightsPolicy = "unrestricted" | "no_real_people" | "client_owned" | "custom";
export type AssetType = "character" | "wardrobe" | "location" | "creature" | "prop";
export type AssetStatus =
  | "missing"
  | "draft"
  | "needs_review"
  | "approved"
  | "locked"
  | "superseded"
  | "rejected";

export type GenerationJobType =
  | "script_analysis"
  | "asset_reference"
  | "storyboard_frame"
  | "video_clip"
  | "export"
  | "import"
  | "thumbnail"
  | "media_convert";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "provider_submitted"
  | "polling"
  | "processing_output"
  | "complete"
  | "failed"
  | "canceled";

export type ErrorClass = "retriable" | "fatal" | "content_policy" | "rate_limit" | "timeout";
export type ScriptAnalysisStatus = "pending" | "running" | "complete" | "failed";
export type SceneStatus = "blocked" | "ready" | "in_progress" | "complete" | "superseded";
export type ShotStatus = "blocked" | "ready" | "storyboarded" | "video_ready" | "complete" | "superseded";
export type RequirementDetector = "ai" | "user";
export type AssetVersionStatus = "draft" | "needs_review" | "approved" | "rejected" | "superseded";
export type AssetReferenceType =
  | "front"
  | "side"
  | "back"
  | "expression_sheet"
  | "pose_sheet"
  | "scale"
  | "turnaround"
  | "detail"
  | "other";
export type FrameVersionStatus = "draft" | "needs_review" | "approved" | "rejected" | "superseded" | "stale";
export type ClipVersionStatus = "draft" | "needs_review" | "approved" | "rejected" | "superseded" | "stale";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  token: string;
  userId: string;
  expiresAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  title: string;
  targetFormat: string;
  aspectRatio: string;
  estimatedRuntime?: number;
  storagePath: string;
  rightsPolicy: RightsPolicy;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
};

export type ProjectStyle = {
  id: string;
  projectId: string;
  styleName: string;
  description: string;
  colorPalette: string[];
  lightingRules: string;
  renderingMedium: string;
  lensLanguage: string;
  negativeConstraints: string;
  modelPromptFragments: Record<string, string>;
  approvalStatus: "draft" | "approved" | "locked";
  createdAt: string;
  updatedAt: string;
};

export type ProviderKey = {
  id: string;
  workspaceId: string;
  providerSlug: string;
  encryptedKey: string;
  keyNonce: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationJob = {
  id: string;
  projectId: string;
  type: GenerationJobType;
  providerSlug?: string;
  modelId?: string;
  status: GenerationJobStatus;
  inputPayload: unknown;
  outputPayload?: unknown;
  errorMessage?: string;
  errorClass?: ErrorClass;
  retryCount: number;
  providerJobId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type JobEvent = {
  id: string;
  jobId: string;
  projectId: string;
  eventType: string;
  message?: string;
  progressPct?: number;
  createdAt: string;
};

export type Script = {
  id: string;
  projectId: string;
  filename: string;
  createdAt: string;
};

export type ScriptVersion = {
  id: string;
  scriptId: string;
  versionNumber: number;
  filePath: string;
  rawText: string;
  analysisStatus: ScriptAnalysisStatus;
  isActive: boolean;
  createdAt: string;
};

export type Scene = {
  id: string;
  scriptVersionId: string;
  sceneNumber: number;
  heading: string;
  summary: string;
  scriptStartLine: number;
  scriptEndLine: number;
  locationHint?: string;
  status: SceneStatus;
  isUserEdited?: boolean;
  warnings?: string[];
  createdAt: string;
  updatedAt: string;
};

export type Shot = {
  id: string;
  sceneId: string;
  shotNumber: number;
  action: string;
  cameraAngle?: string;
  cameraMovement?: string;
  lensNotes?: string;
  lightingNotes?: string;
  userDirection?: string;
  status: ShotStatus;
  isUserEdited?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  projectId: string;
  type: AssetType;
  canonicalName: string;
  aliases: string[];
  status: AssetStatus;
  continuityNotes?: string;
  negativePrompts?: string;
  description?: string;
  firstAppearance?: { sceneNumber: number; shotNumber?: number };
  isUserEdited?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssetDetail = {
  assetId: string;
  role?: string;
  narrativeDescription?: string;
  physicalDescription?: string;
  personalityNotes?: string;
  performanceNotes?: string;
  scaleReference?: string;
  outfitName?: string;
  storyContext?: string;
  materialNotes?: string;
  accessories?: string[];
  colorPalette?: string[];
  floorPlanNotes?: string;
  entranceExitNotes?: string;
  setDressing?: string;
  lightingStates?: string[];
  cameraSafeZones?: string;
  speciesType?: string;
  anatomyNotes?: string;
  movementNotes?: string;
  textureDetails?: string;
  ownerOrScene?: string;
  materialAndWear?: string;
  interactionNotes?: string;
  updatedAt: string;
};

export type AssetVersion = {
  id: string;
  assetId: string;
  versionNumber: number;
  description?: string;
  promptFragments?: Record<string, string>;
  status: AssetVersionStatus;
  createdAt: string;
};

export type AssetReference = {
  id: string;
  assetVersionId: string;
  referenceType: AssetReferenceType;
  filePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailPath?: string;
  generationJobId?: string;
  createdAt: string;
};

export type SceneAssetRequirement = {
  id: string;
  sceneId: string;
  assetId: string;
  isOptional: boolean;
  detectedBy: RequirementDetector;
  createdAt: string;
};

export type ShotAssetRequirement = {
  id: string;
  shotId: string;
  assetId: string;
  isOptional: boolean;
  detectedBy: RequirementDetector;
  createdAt: string;
};

export type ScriptAnalysisGraph = {
  scripts: Script[];
  activeVersion?: ScriptVersion;
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
  sceneAssetRequirements: SceneAssetRequirement[];
  shotAssetRequirements: ShotAssetRequirement[];
  jobs: GenerationJob[];
  events: JobEvent[];
};

export type Invitation = {
  id: string;
  workspaceId: string;
  projectId?: string;
  email: string;
  tokenHash: string;
  scope: "workspace" | "project";
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  invitedById: string;
  acceptedAt?: string;
  createdAt: string;
};

export type Assignment = {
  id: string;
  projectId: string;
  userId: string;
  targetType: "scene" | "shot" | "asset";
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  status: "open" | "complete";
  createdAt: string;
  updatedAt: string;
};

export type ActivityEvent = {
  id: string;
  projectId: string;
  actorId?: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ExportBundle = {
  id: string;
  projectId: string;
  bundleVersion: number;
  manifestPath: string;
  mediaFileCount: number;
  metadataRecordCount: number;
  createdById: string;
  createdAt: string;
};

export type StorageWarningLevel = "ok" | "warning" | "critical";

export type StorageUsage = {
  projectId: string;
  totalBytes: number;
  fileCount: number;
  orphanFiles: string[];
  thumbnailFiles: string[];
  warningLevel: StorageWarningLevel;
  warningMessage?: string;
};

export type VideoClip = {
  id: string;
  shotId?: string;
  sceneId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClipVersion = {
  id: string;
  clipId: string;
  versionNumber: number;
  prompt: string;
  filePath: string;
  thumbnailPath?: string;
  durationMs: number;
  status: ClipVersionStatus;
  isStale: boolean;
  sourceFrameVersionIds: string[];
  generationJobId?: string;
  createdAt: string;
};

export type StoryboardFrame = {
  id: string;
  shotId: string;
  keyframeIndex: number;
  sketchFilePath?: string;
  sketchWarning?: string;
  createdAt: string;
  updatedAt: string;
};

export type FrameVersion = {
  id: string;
  frameId: string;
  versionNumber: number;
  prompt: string;
  filePath: string;
  thumbnailPath?: string;
  status: FrameVersionStatus;
  isStale: boolean;
  generationJobId?: string;
  annotations?: Record<string, unknown>;
  createdAt: string;
};

export type ReviewNote = {
  id: string;
  projectId: string;
  authorId: string;
  targetType: "asset_version" | "frame_version" | "clip_version";
  targetId: string;
  parentNoteId?: string;
  body: string;
  markupFilePath?: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
};
