import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:fs/promises", () => fsMocks);
vi.mock("@/server/repository", () => ({
  getScriptAnalysisGraphForProject: vi.fn(async () => ({
    scripts: [],
    activeVersion: undefined,
    assetReferences: [],
    frameVersions: [],
    clipVersions: [],
  })),
}));
vi.mock("@/server/storage", () => ({
  ensureProjectStorage: vi.fn(async () => "C:\\storage\\projects\\project1"),
  projectFolderPath: vi.fn((projectId: string, folder: string) => `C:\\storage\\projects\\${projectId}\\${folder}`),
  projectStorageFolders: ["uploads", "assets", "storyboards", "videos", "exports", "logs", "thumbnails"],
  projectStoragePath: vi.fn((projectId: string) => `C:\\storage\\projects\\${projectId}`),
}));

describe("storage management diagnostics", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("treats missing storage folders as empty", async () => {
    fsMocks.readdir.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const { getProjectStorageUsage } = await import("@/server/storageManagement");

    await expect(getProjectStorageUsage("project1")).resolves.toMatchObject({
      fileCount: 0,
      orphanFiles: [],
      thumbnailFiles: [],
    });
  });

  it("surfaces storage walk failures instead of reporting empty usage", async () => {
    fsMocks.readdir.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const { getProjectStorageUsage } = await import("@/server/storageManagement");

    await expect(getProjectStorageUsage("project1")).rejects.toThrow("permission denied");
  });
});
