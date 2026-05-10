-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('owner', 'producer', 'artist', 'reviewer', 'viewer');

-- CreateEnum
CREATE TYPE "RightsPolicy" AS ENUM ('unrestricted', 'no_real_people', 'client_owned', 'custom');

-- CreateEnum
CREATE TYPE "StyleApprovalStatus" AS ENUM ('draft', 'approved', 'locked');

-- CreateEnum
CREATE TYPE "ScriptAnalysisStatus" AS ENUM ('pending', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('blocked', 'ready', 'in_progress', 'complete', 'superseded');

-- CreateEnum
CREATE TYPE "ShotStatus" AS ENUM ('blocked', 'ready', 'storyboarded', 'video_ready', 'complete', 'superseded');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('character', 'wardrobe', 'location', 'creature', 'prop');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('missing', 'draft', 'needs_review', 'approved', 'locked', 'superseded', 'rejected');

-- CreateEnum
CREATE TYPE "AssetVersionStatus" AS ENUM ('draft', 'needs_review', 'approved', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "AssetReferenceType" AS ENUM ('front', 'side', 'back', 'expression_sheet', 'pose_sheet', 'scale', 'turnaround', 'detail', 'other');

-- CreateEnum
CREATE TYPE "RequirementDetector" AS ENUM ('ai', 'user');

-- CreateEnum
CREATE TYPE "FrameVersionStatus" AS ENUM ('draft', 'needs_review', 'approved', 'rejected', 'superseded', 'stale');

-- CreateEnum
CREATE TYPE "ClipVersionStatus" AS ENUM ('draft', 'needs_review', 'approved', 'rejected', 'superseded', 'stale');

-- CreateEnum
CREATE TYPE "GenerationJobType" AS ENUM ('script_analysis', 'asset_reference', 'storyboard_frame', 'video_clip', 'export', 'import', 'thumbnail', 'media_convert');

-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('queued', 'running', 'provider_submitted', 'polling', 'processing_output', 'complete', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ErrorClass" AS ENUM ('retriable', 'fatal', 'content_policy', 'rate_limit', 'timeout');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('asset_version', 'frame_version', 'clip_version');

-- CreateEnum
CREATE TYPE "ReviewNoteStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "InvitationScope" AS ENUM ('workspace', 'project');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "targetFormat" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "estimatedRuntime" INTEGER,
    "storagePath" TEXT NOT NULL,
    "rightsPolicy" "RightsPolicy" NOT NULL DEFAULT 'unrestricted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStyle" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "styleName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "colorPalette" JSONB NOT NULL,
    "lightingRules" TEXT NOT NULL,
    "renderingMedium" TEXT NOT NULL,
    "lensLanguage" TEXT NOT NULL,
    "negativeConstraints" TEXT NOT NULL,
    "modelPromptFragments" JSONB NOT NULL,
    "approvalStatus" "StyleApprovalStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "providerSlug" TEXT NOT NULL,
    "encryptedKey" BYTEA NOT NULL,
    "keyNonce" BYTEA NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" UUID NOT NULL,
    "scriptId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "analysisStatus" "ScriptAnalysisStatus" NOT NULL DEFAULT 'pending',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" UUID NOT NULL,
    "scriptVersionId" UUID NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "scriptStartLine" INTEGER NOT NULL,
    "scriptEndLine" INTEGER NOT NULL,
    "locationHint" TEXT,
    "status" "SceneStatus" NOT NULL DEFAULT 'blocked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" UUID NOT NULL,
    "sceneId" UUID NOT NULL,
    "shotNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "cameraAngle" TEXT,
    "cameraMovement" TEXT,
    "lensNotes" TEXT,
    "lightingNotes" TEXT,
    "userDirection" TEXT,
    "status" "ShotStatus" NOT NULL DEFAULT 'blocked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'missing',
    "continuityNotes" TEXT,
    "negativePrompts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDetail" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "narrativeDescription" TEXT NOT NULL,
    "physicalDescription" TEXT NOT NULL,
    "personalityNotes" TEXT,
    "performanceNotes" TEXT,
    "scaleReference" TEXT,

    CONSTRAINT "CharacterDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WardrobeDetail" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "outfitName" TEXT NOT NULL,
    "storyContext" TEXT NOT NULL,
    "materialNotes" TEXT,
    "accessories" JSONB NOT NULL,
    "colorPalette" JSONB NOT NULL,

    CONSTRAINT "WardrobeDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterWardrobe" (
    "characterDetailId" UUID NOT NULL,
    "wardrobeDetailId" UUID NOT NULL,

    CONSTRAINT "CharacterWardrobe_pkey" PRIMARY KEY ("characterDetailId","wardrobeDetailId")
);

-- CreateTable
CREATE TABLE "LocationDetail" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "floorPlanNotes" TEXT,
    "entranceExitNotes" TEXT,
    "setDressing" TEXT,
    "lightingStates" JSONB,
    "cameraSafeZones" TEXT,

    CONSTRAINT "LocationDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatureDetail" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "speciesType" TEXT NOT NULL,
    "anatomyNotes" TEXT,
    "scaleReference" TEXT,
    "movementNotes" TEXT,
    "textureDetails" TEXT,

    CONSTRAINT "CreatureDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropDetail" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "ownerOrScene" TEXT,
    "materialAndWear" TEXT,
    "scaleReference" TEXT,
    "interactionNotes" TEXT,

    CONSTRAINT "PropDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "description" TEXT,
    "promptFragments" JSONB,
    "status" "AssetVersionStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetReference" (
    "id" UUID NOT NULL,
    "assetVersionId" UUID NOT NULL,
    "referenceType" "AssetReferenceType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailPath" TEXT,
    "generationJobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneAssetReq" (
    "id" UUID NOT NULL,
    "sceneId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "detectedBy" "RequirementDetector" NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneAssetReq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotAssetReq" (
    "id" UUID NOT NULL,
    "shotId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "detectedBy" "RequirementDetector" NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShotAssetReq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryboardFrame" (
    "id" UUID NOT NULL,
    "shotId" UUID NOT NULL,
    "keyframeIndex" INTEGER NOT NULL,
    "sketchFilePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryboardFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameVersion" (
    "id" UUID NOT NULL,
    "frameId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "status" "FrameVersionStatus" NOT NULL DEFAULT 'draft',
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "generationJobId" UUID,
    "annotations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoClip" (
    "id" UUID NOT NULL,
    "shotId" UUID,
    "sceneId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipVersion" (
    "id" UUID NOT NULL,
    "clipId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "durationMs" INTEGER NOT NULL,
    "status" "ClipVersionStatus" NOT NULL DEFAULT 'draft',
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "sourceFrameVersionIds" JSONB NOT NULL,
    "generationJobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "GenerationJobType" NOT NULL,
    "providerSlug" TEXT,
    "modelId" TEXT,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'queued',
    "inputPayload" JSONB NOT NULL,
    "outputPayload" JSONB,
    "errorMessage" TEXT,
    "errorClass" "ErrorClass",
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUnits" DOUBLE PRECISION,
    "actualCostUnits" DOUBLE PRECISION,
    "costCurrency" TEXT,
    "providerJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "progressPct" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "parentNoteId" UUID,
    "body" TEXT NOT NULL,
    "markupFilePath" TEXT,
    "status" "ReviewNoteStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportBundle" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "bundleVersion" INTEGER NOT NULL,
    "manifestPath" TEXT NOT NULL,
    "archivePath" TEXT NOT NULL,
    "generationJobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "InvitationScope" NOT NULL,
    "role" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "sceneId" UUID,
    "shotId" UUID,
    "assetId" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "actorId" UUID,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStyle_projectId_key" ON "ProjectStyle"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterDetail_assetId_key" ON "CharacterDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "WardrobeDetail_assetId_key" ON "WardrobeDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationDetail_assetId_key" ON "LocationDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatureDetail_assetId_key" ON "CreatureDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "PropDetail_assetId_key" ON "PropDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "SceneAssetReq_sceneId_assetId_key" ON "SceneAssetReq"("sceneId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ShotAssetReq_shotId_assetId_key" ON "ShotAssetReq"("shotId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryboardFrame_shotId_keyframeIndex_key" ON "StoryboardFrame"("shotId", "keyframeIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStyle" ADD CONSTRAINT "ProjectStyle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderKey" ADD CONSTRAINT "ProviderKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "ScriptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDetail" ADD CONSTRAINT "CharacterDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardrobeDetail" ADD CONSTRAINT "WardrobeDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterWardrobe" ADD CONSTRAINT "CharacterWardrobe_characterDetailId_fkey" FOREIGN KEY ("characterDetailId") REFERENCES "CharacterDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterWardrobe" ADD CONSTRAINT "CharacterWardrobe_wardrobeDetailId_fkey" FOREIGN KEY ("wardrobeDetailId") REFERENCES "WardrobeDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationDetail" ADD CONSTRAINT "LocationDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureDetail" ADD CONSTRAINT "CreatureDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropDetail" ADD CONSTRAINT "PropDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_assetVersionId_fkey" FOREIGN KEY ("assetVersionId") REFERENCES "AssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneAssetReq" ADD CONSTRAINT "SceneAssetReq_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneAssetReq" ADD CONSTRAINT "SceneAssetReq_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotAssetReq" ADD CONSTRAINT "ShotAssetReq_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotAssetReq" ADD CONSTRAINT "ShotAssetReq_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryboardFrame" ADD CONSTRAINT "StoryboardFrame_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameVersion" ADD CONSTRAINT "FrameVersion_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "StoryboardFrame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameVersion" ADD CONSTRAINT "FrameVersion_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipVersion" ADD CONSTRAINT "ClipVersion_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "VideoClip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipVersion" ADD CONSTRAINT "ClipVersion_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_parentNoteId_fkey" FOREIGN KEY ("parentNoteId") REFERENCES "ReviewNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportBundle" ADD CONSTRAINT "ExportBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportBundle" ADD CONSTRAINT "ExportBundle_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

