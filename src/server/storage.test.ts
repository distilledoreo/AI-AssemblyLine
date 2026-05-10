import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ensureProjectStorage,
  projectFolderPath,
  projectStorageFolders,
  projectStoragePath,
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
});
