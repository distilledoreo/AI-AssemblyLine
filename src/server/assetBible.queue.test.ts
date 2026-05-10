import { afterEach, describe, expect, it, vi } from "vitest";

describe("asset reference queue handoff", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/queue");
  });

  it("queues asset reference generation in Redis mode and lets an image worker complete it", async () => {
    vi.doMock("@/server/queue", () => ({
      isRedisQueueEnabled: () => true,
      submitGenerationJob: vi.fn(async (job) => ({ submitted: true, queueName: "assemblyline-image", bullJobId: job.id })),
      emitProjectEvent: vi.fn((event) => ({
        ...event,
        id: `event-${event.progressPct ?? 0}`,
        createdAt: "2026-05-10T12:00:00.000Z",
      })),
    }));

    const repository = await import("@/server/repository");
    const { generateAssetReference, processAssetReferenceJob } = await import("@/server/assetBible");

    repository.resetStoreForTests();
    const { user } = await repository.signInWithCredentials({
      email: "asset-queue@example.com",
      password: "assemblyline",
    });
    const workspace = await repository.createWorkspaceForUser(user.id, { name: "Asset Queue" });
    const project = await repository.createProjectForWorkspace(user.id, {
      workspaceId: workspace.id,
      title: "Queued Asset Reference",
    });
    const timestamp = "2026-05-10T12:00:00.000Z";
    const asset = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: project.id,
      type: "prop" as const,
      canonicalName: "Brass Key",
      aliases: [],
      status: "draft" as const,
      description: "A small brass key.",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    repository.getStore().assets.push(asset);
    repository.getStore().assetVersions.push({
      id: "22222222-2222-4222-8222-222222222222",
      assetId: asset.id,
      versionNumber: 7,
      description: "Existing production reference.",
      status: "approved",
      createdAt: timestamp,
    });

    const queued = await generateAssetReference({
      projectId: project.id,
      assetId: asset.id,
      providerSlug: "stability",
    });
    const pendingGraph = repository.getScriptAnalysisGraph(project.id);

    expect(queued.job).toMatchObject({
      type: "asset_reference",
      status: "queued",
      inputPayload: { projectId: project.id, assetId: asset.id, providerSlug: "stability" },
    });
    expect(queued.graph.jobs[0]).toMatchObject({ id: queued.job.id, status: "queued" });
    expect(pendingGraph.assetReferences).toHaveLength(0);

    const completed = await processAssetReferenceJob({
      projectId: project.id,
      assetId: asset.id,
      providerSlug: "stability",
      jobId: queued.job.id,
    });
    const completedGraph = repository.getScriptAnalysisGraph(project.id);

    expect(completed.reference.mimeType).toBe("image/png");
    expect(completed.version.versionNumber).toBe(8);
    expect(completedGraph.assetReferences).toHaveLength(1);
    expect(completedGraph.jobs[0]).toMatchObject({ type: "asset_reference", status: "complete" });
    expect(completedGraph.events.map((event) => event.message)).toContain("Asset reference generation started.");
    expect(completedGraph.events.map((event) => event.message)).toContain("Asset reference generation complete.");
  });
});
