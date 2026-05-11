import { rm } from "node:fs/promises";
import { createId, nowIso } from "../src/server/ids";
import type {
  ActivityEvent,
  Assignment,
  ClipVersion,
  ExportBundle,
  FrameVersion,
  Invitation,
  StoryboardFrame,
  VideoClip,
} from "../src/server/types";

type SmokeCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type PrismaClientModule = typeof import("../src/server/prisma");
type QueueModule = typeof import("../src/server/queue");
type RepositoryModule = typeof import("../src/server/repository");

process.env.REPOSITORY_MODE = "prisma";

async function main() {
  const checks = await runPrismaRepositorySmoke();

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    console.error(`Prisma repository smoke failed with ${failures.length} blocker(s).`);
    process.exitCode = 1;
  }
}

export async function runPrismaRepositorySmoke() {
  const [{ prisma }, { closeQueueConnections }, repository] = await Promise.all([
    import("../src/server/prisma") as Promise<PrismaClientModule>,
    import("../src/server/queue") as Promise<QueueModule>,
    import("../src/server/repository") as Promise<RepositoryModule>,
  ]);
  const checks: SmokeCheck[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `prisma-smoke-${suffix}@example.test`;
  const apiKey = `sk-prod-prisma-repository-smoke-${suffix}`;
  let userId: string | undefined;
  let workspaceId: string | undefined;
  let projectStoragePath: string | undefined;

  try {
    await assertDatabaseReachable(prisma);
    checks.push({
      name: "Postgres connection",
      ok: true,
      detail: "Prisma query returned successfully",
    });

    const auth = await repository.signInWithCredentials({
      email,
      password: "repository-smoke-pass",
      name: "Prisma Smoke User",
    });
    userId = auth.user.id;
    checks.push({
      name: "Credential sign-in",
      ok: Boolean(auth.session.token) && auth.session.userId === auth.user.id,
      detail: `created user ${auth.user.id} and session ${auth.session.token}`,
    });

    const sessionUser = await repository.getUserBySessionToken(auth.session.token);
    checks.push({
      name: "Session lookup",
      ok: sessionUser?.id === auth.user.id,
      detail: sessionUser ? `resolved ${sessionUser.email}` : "session did not resolve",
    });

    const workspace = await repository.createWorkspaceForUser(auth.user.id, {
      name: `Prisma Smoke Workspace ${suffix}`,
    });
    workspaceId = workspace.id;
    const workspaces = await repository.listWorkspacesForUser(auth.user.id);
    checks.push({
      name: "Workspace persistence",
      ok: workspaces.some((candidate) => candidate.id === workspace.id),
      detail: `listed ${workspaces.length} workspace(s) for ${auth.user.id}`,
    });

    const project = await repository.createProjectForWorkspace(auth.user.id, {
      workspaceId: workspace.id,
      title: `Prisma Smoke Project ${suffix}`,
      targetFormat: "short_film",
      aspectRatio: "16:9",
      estimatedRuntime: 90,
      rightsPolicy: "unrestricted",
    });
    projectStoragePath = project.storagePath;
    const projects = await repository.listProjectsForUser(auth.user.id);
    const dashboard = await repository.getProjectDashboard(project.id);
    checks.push({
      name: "Project dashboard persistence",
      ok:
        projects.some((candidate) => candidate.id === project.id) &&
        dashboard.project.id === project.id &&
        dashboard.style?.projectId === project.id,
      detail: `project ${project.id} loaded with ${dashboard.jobs.length} job(s) and ${dashboard.events.length} event(s)`,
    });

    const savedProviderKey = await repository.saveProviderKey(workspace.id, {
      providerSlug: "openai",
      apiKey,
      label: "Prisma smoke OpenAI key",
    });
    const providerKeys = await repository.listProviderKeys(workspace.id);
    const decryptedKey = await repository.decryptWorkspaceProviderKey(workspace.id, "openai");
    checks.push({
      name: "Encrypted provider key persistence",
      ok:
        savedProviderKey.providerSlug === "openai" &&
        providerKeys.some((candidate) => candidate.id === savedProviderKey.id && candidate.maskedKey.includes("...")) &&
        decryptedKey === apiKey,
      detail: `stored ${providerKeys.length} provider key(s) and decrypted the OpenAI key`,
    });

    const job = await repository.createGenerationJob({
      projectId: project.id,
      type: "script_analysis",
      providerSlug: "openai",
      modelId: "repository-smoke-model",
      inputPayload: { scriptVersionId: `script-version-${suffix}` },
    });
    const event = await repository.addJobEvent({
      jobId: job.id,
      projectId: project.id,
      eventType: "progress",
      message: "Prisma repository smoke progress.",
      progressPct: 50,
    });
    await repository.completeGenerationJob(job.id, {
      status: "complete",
      outputPayload: { smoke: true },
    });
    const completedJob = await repository.getGenerationJob(job.id);
    const events = await repository.listProjectEvents(project.id);
    const eventsAfterQueued = await repository.listProjectEvents(project.id, event.id);
    checks.push({
      name: "Job and event persistence",
      ok:
        completedJob?.status === "complete" &&
        events.some((candidate) => candidate.id === event.id) &&
        eventsAfterQueued.every((candidate) => candidate.id !== event.id),
      detail: `job ${job.id} ended as ${completedJob?.status ?? "missing"} with ${events.length} event(s)`,
    });

    const scriptUpload = await repository.createScriptVersionForProject({
      projectId: project.id,
      filename: "prisma-smoke.txt",
      filePath: `${project.storagePath}/scripts/prisma-smoke.txt`,
      rawText: "INT. ATRIUM - DAY\nA producer reviews a glowing storyboard wall.",
    });
    await repository.persistGeneratedScriptAnalysis({
      projectId: project.id,
      scriptVersionId: scriptUpload.version.id,
      scenes: [
        {
          sceneNumber: 1,
          heading: "INT. ATRIUM - DAY",
          summary: "A producer reviews a glowing storyboard wall.",
          scriptStartLine: 1,
          scriptEndLine: 2,
          locationHint: "Atrium",
        },
      ],
      shotBreakdowns: [
        {
          sceneNumber: 1,
          shots: [
            {
              shotNumber: 1,
              action: "The producer studies the boards.",
              cameraAngle: "Wide",
              cameraMovement: "Slow push",
              lensNotes: "35mm",
              lightingNotes: "Soft skylight",
            },
          ],
        },
      ],
      assets: [
        {
          canonicalName: "Atrium",
          type: "location",
          aliases: ["Storyboard Atrium"],
          description: "A bright production atrium lined with storyboard panels.",
          firstAppearance: { sceneNumber: 1, shotNumber: 1 },
        },
      ],
      sceneAssetLinks: [{ sceneNumber: 1, assetName: "Atrium" }],
      shotAssetLinks: [{ sceneNumber: 1, shotNumber: 1, assetName: "Atrium" }],
      warnings: [],
    });
    await repository.updateScriptVersionAnalysisStatus(scriptUpload.version.id, "complete");
    const graph = await repository.getScriptAnalysisGraphForProject(project.id);
    checks.push({
      name: "Script analysis graph persistence",
      ok:
        graph.activeVersion?.id === scriptUpload.version.id &&
        graph.scenes.some((candidate) => candidate.heading === "INT. ATRIUM - DAY") &&
        graph.shots.some((candidate) => candidate.action.includes("producer studies")) &&
        graph.assets.some((candidate) => candidate.canonicalName === "Atrium") &&
        graph.sceneAssetRequirements.length === 1 &&
        graph.shotAssetRequirements.length === 1,
      detail: `graph has ${graph.scenes.length} scene(s), ${graph.shots.length} shot(s), ${graph.assets.length} asset(s)`,
    });

    const scene = graph.scenes.find((candidate) => candidate.heading === "INT. ATRIUM - DAY");
    const shot = graph.shots.find((candidate) => candidate.action.includes("producer studies"));
    if (!scene || !shot) {
      throw new Error("Script analysis graph did not return the smoke scene and shot.");
    }

    const frame: StoryboardFrame = {
      id: createId(),
      shotId: shot.id,
      keyframeIndex: 0,
      sketchFilePath: `${project.storagePath}/storyboards/prisma-smoke-sketch.png`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const frameVersion: FrameVersion = {
      id: createId(),
      frameId: frame.id,
      versionNumber: 1,
      prompt: "Wide storyboard frame of a bright atrium.",
      filePath: `${project.storagePath}/storyboards/prisma-smoke-frame.png`,
      thumbnailPath: `${project.storagePath}/storyboards/prisma-smoke-frame-thumb.png`,
      status: "approved",
      isStale: false,
      annotations: { smoke: true },
      createdAt: nowIso(),
    };
    await repository.persistGeneratedFrameVersion({
      frame,
      version: frameVersion,
      shot: { ...shot, status: "storyboarded", updatedAt: nowIso() },
    });

    const clip: VideoClip = {
      id: createId(),
      shotId: shot.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const clipVersion: ClipVersion = {
      id: createId(),
      clipId: clip.id,
      versionNumber: 1,
      prompt: "Short video clip of the atrium storyboard wall.",
      filePath: `${project.storagePath}/videos/prisma-smoke-clip.mp4`,
      thumbnailPath: `${project.storagePath}/videos/prisma-smoke-clip-thumb.png`,
      durationMs: 3000,
      status: "approved",
      isStale: false,
      sourceFrameVersionIds: [frameVersion.id],
      createdAt: nowIso(),
    };
    await repository.persistGeneratedClipVersion({ clip, version: clipVersion });
    const mediaGraph = await repository.getScriptAnalysisGraphForProject(project.id);
    checks.push({
      name: "Storyboard and video persistence",
      ok:
        mediaGraph.storyboardFrames.some((candidate) => candidate.id === frame.id) &&
        mediaGraph.frameVersions.some((candidate) => candidate.id === frameVersion.id && candidate.status === "approved") &&
        mediaGraph.videoClips.some((candidate) => candidate.id === clip.id) &&
        mediaGraph.clipVersions.some((candidate) => candidate.id === clipVersion.id && candidate.status === "approved"),
      detail: `graph has ${mediaGraph.storyboardFrames.length} frame(s) and ${mediaGraph.videoClips.length} clip(s)`,
    });

    const invitation: Invitation = {
      id: createId(),
      workspaceId: workspace.id,
      projectId: project.id,
      email: `artist-${suffix}@example.test`,
      tokenHash: `token-hash-${suffix}`,
      scope: "project",
      role: "artist",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      invitedById: auth.user.id,
      createdAt: nowIso(),
    };
    const assignment: Assignment = {
      id: createId(),
      projectId: project.id,
      userId: auth.user.id,
      targetType: "scene",
      sceneId: scene.id,
      status: "open",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const activity: ActivityEvent = {
      id: createId(),
      projectId: project.id,
      actorId: auth.user.id,
      eventType: "assignment_created",
      message: "Prisma smoke assignment created.",
      metadata: { assignmentId: assignment.id },
      createdAt: nowIso(),
    };
    await repository.persistInvitationState(invitation);
    await repository.persistAssignmentState(assignment);
    await repository.persistActivityEventState(activity);
    const foundInvitation = await repository.findInvitationByTokenHash(invitation.tokenHash);
    const collaborationGraph = await repository.getScriptAnalysisGraphForProject(project.id);
    checks.push({
      name: "Collaboration persistence",
      ok:
        foundInvitation?.id === invitation.id &&
        collaborationGraph.invitations.some((candidate) => candidate.id === invitation.id) &&
        collaborationGraph.assignments.some((candidate) => candidate.id === assignment.id) &&
        collaborationGraph.activityEvents.some((candidate) => candidate.id === activity.id),
      detail: `graph has ${collaborationGraph.invitations.length} invitation(s), ${collaborationGraph.assignments.length} assignment(s), ${collaborationGraph.activityEvents.length} activity event(s)`,
    });

    const bundle: ExportBundle = {
      id: createId(),
      projectId: project.id,
      bundleVersion: 1,
      manifestPath: `${project.storagePath}/exports/prisma-smoke.assemblyline-bundle.json`,
      mediaFileCount: 2,
      metadataRecordCount: 12,
      createdById: auth.user.id,
      createdAt: nowIso(),
    };
    await repository.addExportBundle(bundle);
    const bundles = await repository.listExportBundles(project.id);
    checks.push({
      name: "Export bundle persistence",
      ok: bundles.some((candidate) => candidate.id === bundle.id && candidate.manifestPath === bundle.manifestPath),
      detail: `listed ${bundles.length} export bundle(s) for ${project.id}`,
    });
  } finally {
    await closeQueueConnections();
    await cleanupSmokeData({ prisma, userId, workspaceId, projectStoragePath });
    await prisma.$disconnect();
  }

  return checks;
}

async function assertDatabaseReachable(prisma: PrismaClientModule["prisma"]) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Prisma query failed.";
    throw new Error(`Postgres is not reachable through DATABASE_URL: ${detail}`);
  }
}

async function cleanupSmokeData(input: {
  prisma: PrismaClientModule["prisma"];
  userId?: string;
  workspaceId?: string;
  projectStoragePath?: string;
}) {
  if (input.workspaceId) {
    await input.prisma.workspace.deleteMany({ where: { id: input.workspaceId } });
  }
  if (input.userId) {
    await input.prisma.user.deleteMany({ where: { id: input.userId } });
  }
  if (input.projectStoragePath) {
    await rm(input.projectStoragePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
