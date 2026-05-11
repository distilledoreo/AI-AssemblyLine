import { stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureProjectStorage,
  projectFolderPath,
  projectStorageFolders,
  projectStoragePath,
  storagePath,
} from "@/server/storage";

describe("local filesystem storage", () => {
  it("creates the required project media directory structure", async () => {
    const projectId = "1f8058f6-5d2a-4f6d-a113-e1eb4671c5a1";
    await ensureProjectStorage(projectId);

    expect((await stat(projectStoragePath(projectId))).isDirectory()).toBe(true);
    for (const folder of projectStorageFolders) {
      expect((await stat(projectFolderPath(projectId, folder))).isDirectory()).toBe(true);
    }
  });

  it("joins runtime storage paths without requiring path.join in media writers", () => {
    expect(storagePath("storage/projects/project-a/", "assets", "asset-1", "1-reference.png")).toBe(
      ["storage/projects/project-a", "assets", "asset-1", "1-reference.png"].join(path.sep),
    );
  });
});
