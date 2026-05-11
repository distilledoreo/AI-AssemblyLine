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

  it("keeps project storage paths under the storage root", () => {
    const storageRoot = path.resolve(process.env.STORAGE_ROOT ?? "./storage");
    const projectPath = projectStoragePath("1f8058f6-5d2a-4f6d-a113-e1eb4671c5a1");

    expect(projectPath).toBe(
      path.join(storageRoot, "projects", "1f8058f65d2a4f6da113e1eb4671c5a1"),
    );
    expect(path.relative(storageRoot, projectPath).startsWith("..")).toBe(false);
  });

  it("rejects project IDs that would escape project storage", () => {
    expect(() => projectStoragePath("..\\..\\outside")).toThrow(
      "Project storage IDs may contain only letters, numbers, underscores, and dashes.",
    );
    expect(() => projectFolderPath("../outside", "assets")).toThrow(
      "Project storage IDs may contain only letters, numbers, underscores, and dashes.",
    );
  });

  it("joins runtime storage paths without requiring path.join in media writers", () => {
    expect(storagePath("storage/projects/project-a/", "assets", "asset-1", "1-reference.png")).toBe(
      ["storage/projects/project-a", "assets", "asset-1", "1-reference.png"].join(path.sep),
    );
  });
});
