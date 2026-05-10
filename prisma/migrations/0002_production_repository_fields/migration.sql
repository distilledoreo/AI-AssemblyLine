-- Align persisted schema with the runtime repository model.

ALTER TABLE "ScriptVersion"
  ADD COLUMN "rawText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Scene"
  ADD COLUMN "isUserEdited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "warnings" JSONB;

ALTER TABLE "Shot"
  ADD COLUMN "isUserEdited" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Asset"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "firstAppearance" JSONB,
  ADD COLUMN "isUserEdited" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StoryboardFrame"
  ADD COLUMN "sketchWarning" TEXT;

ALTER TABLE "JobEvent"
  ADD COLUMN "projectId" UUID;

UPDATE "JobEvent"
SET "projectId" = "GenerationJob"."projectId"
FROM "GenerationJob"
WHERE "JobEvent"."jobId" = "GenerationJob"."id";

ALTER TABLE "JobEvent"
  ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "JobEvent"
  ADD CONSTRAINT "JobEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExportBundle"
  ALTER COLUMN "archivePath" DROP NOT NULL,
  ADD COLUMN "mediaFileCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "metadataRecordCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdById" UUID;
