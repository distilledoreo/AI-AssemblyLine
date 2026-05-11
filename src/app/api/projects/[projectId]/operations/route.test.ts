import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  cleanupOrphanFiles: vi.fn(),
  clearThumbnailCache: vi.fn(),
  exportProjectBundle: vi.fn(),
  getProjectJobMetrics: vi.fn(),
  getProjectRole: vi.fn(),
  getRemainingAdapterCapabilities: vi.fn(),
  getScriptAnalysisGraphForProject: vi.fn(),
  getProjectStorageUsage: vi.fn(),
  importProjectBundle: vi.fn(),
  listExportBundles: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/providers/extendedAdapters", () => ({
  getRemainingAdapterCapabilities: routeMocks.getRemainingAdapterCapabilities,
}));
vi.mock("@/server/exportImport", () => ({
  exportProjectBundle: routeMocks.exportProjectBundle,
  importProjectBundle: routeMocks.importProjectBundle,
}));
vi.mock("@/server/observability", () => ({
  getProjectJobMetrics: routeMocks.getProjectJobMetrics,
}));
vi.mock("@/server/repository", () => ({
  getProjectRole: routeMocks.getProjectRole,
  getScriptAnalysisGraphForProject: routeMocks.getScriptAnalysisGraphForProject,
  listExportBundles: routeMocks.listExportBundles,
}));
vi.mock("@/server/session", () => ({ requireCurrentUser: routeMocks.requireCurrentUser }));
vi.mock("@/server/storageManagement", () => ({
  cleanupOrphanFiles: routeMocks.cleanupOrphanFiles,
  clearThumbnailCache: routeMocks.clearThumbnailCache,
  getProjectStorageUsage: routeMocks.getProjectStorageUsage,
}));

const projectId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ projectId }) };

function jsonRequest(body: unknown) {
  return new Request(`http://localhost/api/projects/${projectId}/operations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function storageUsage(overrides: { orphanFiles?: string[]; thumbnailFiles?: string[] } = {}) {
  return {
    projectId,
    totalBytes: 0,
    fileCount: 0,
    orphanFiles: overrides.orphanFiles ?? [],
    thumbnailFiles: overrides.thumbnailFiles ?? [],
    warningLevel: "ok" as const,
  };
}

function setupPayloadMocks() {
  routeMocks.requireCurrentUser.mockResolvedValue({ id: "owner-1" });
  routeMocks.getProjectRole.mockResolvedValue("owner");
  routeMocks.getProjectJobMetrics.mockResolvedValue({ totalJobs: 0 });
  routeMocks.getScriptAnalysisGraphForProject.mockResolvedValue({ project: { id: projectId } });
  routeMocks.listExportBundles.mockResolvedValue([]);
  routeMocks.getRemainingAdapterCapabilities.mockReturnValue([]);
}

describe("Project operations API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns refreshed storage usage after orphan cleanup", async () => {
    setupPayloadMocks();
    let cleanupRan = false;
    routeMocks.cleanupOrphanFiles.mockImplementation(async () => {
      cleanupRan = true;
      return { removedFiles: 1 };
    });
    routeMocks.getProjectStorageUsage.mockImplementation(async () =>
      storageUsage({
        orphanFiles: cleanupRan ? [] : ["C:\\storage\\projects\\project1\\assets\\partial.tmp"],
      }),
    );
    const { POST } = await import("@/app/api/projects/[projectId]/operations/route");

    const response = await POST(jsonRequest({ action: "cleanup_orphans" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cleanup).toEqual({ removedFiles: 1 });
    expect(body.storage.orphanFiles).toEqual([]);
    expect(routeMocks.cleanupOrphanFiles.mock.invocationCallOrder[0]).toBeLessThan(
      routeMocks.getProjectStorageUsage.mock.invocationCallOrder[0],
    );
  });

  it("returns refreshed storage usage after clearing thumbnails", async () => {
    setupPayloadMocks();
    let clearRan = false;
    routeMocks.clearThumbnailCache.mockImplementation(async () => {
      clearRan = true;
      return { clearedFiles: 2 };
    });
    routeMocks.getProjectStorageUsage.mockImplementation(async () =>
      storageUsage({
        thumbnailFiles: clearRan
          ? []
          : [
              "C:\\storage\\projects\\project1\\thumbnails\\a.jpg",
              "C:\\storage\\projects\\project1\\thumbnails\\b.jpg",
            ],
      }),
    );
    const { POST } = await import("@/app/api/projects/[projectId]/operations/route");

    const response = await POST(jsonRequest({ action: "clear_thumbnails" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.thumbnails).toEqual({ clearedFiles: 2 });
    expect(body.storage.thumbnailFiles).toEqual([]);
    expect(routeMocks.clearThumbnailCache.mock.invocationCallOrder[0]).toBeLessThan(
      routeMocks.getProjectStorageUsage.mock.invocationCallOrder[0],
    );
  });
});
