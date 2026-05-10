import { afterEach, describe, expect, it, vi } from "vitest";

const scriptText = `INT. OBSERVATORY - NIGHT
MARA
The lens is already awake.
Mara points the silver telescope at the storm.`;

describe("project export and import queue handoff", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/queue");
  });

  it("queues project export in Redis mode and lets a project worker create the bundle", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-project", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: `event-${event.progressPct ?? 0}`,
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));

    const repository = await import("@/server/repository");
    const { exportProjectBundle, importProjectBundle, processExportProjectBundleJob, processImportProjectBundleJob } =
      await import("@/server/exportImport");
    const { uploadScriptForProject } = await import("@/server/scriptAnalysis");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "project-queue@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Project Queue" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued Bundle",
    });
    await uploadScriptForProject({ projectId: project.id, filename: "queued.txt", text: scriptText });

    const queuedExport = await exportProjectBundle({ projectId: project.id, userId: user.id });

    expect(queuedExport).toMatchObject({
      job: {
        type: "export",
        status: "queued",
        inputPayload: { projectId: project.id, userId: user.id, bundleVersion: 1 },
      },
    });
    expect(queuedExport).not.toHaveProperty("manifestPath");

    const completedExport = await processExportProjectBundleJob({
      projectId: project.id,
      userId: user.id,
      jobId: queuedExport.job.id,
    });

    expect(completedExport.manifestPath.endsWith(".assemblyline-bundle.json")).toBe(true);
    expect(completedExport.job.status).toBe("complete");

    const queuedImport = await importProjectBundle({
      projectId: project.id,
      userId: user.id,
      manifestPath: completedExport.manifestPath,
    });

    expect(queuedImport).toMatchObject({
      job: {
        type: "import",
        status: "queued",
        inputPayload: { projectId: project.id, userId: user.id, manifestPath: completedExport.manifestPath },
      },
    });

    const completedImport = await processImportProjectBundleJob({
      projectId: project.id,
      userId: user.id,
      manifestPath: completedExport.manifestPath,
      jobId: queuedImport.job.id,
    });

    expect(completedImport.project.title).toBe("Imported Queued Bundle");
    expect(completedImport.job.status).toBe("complete");
    expect(completedImport.job.outputPayload).toMatchObject({ importedProjectId: completedImport.project.id });
  });
});
