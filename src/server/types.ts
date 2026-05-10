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
