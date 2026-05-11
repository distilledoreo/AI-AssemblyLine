import { rm } from "node:fs/promises";

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
