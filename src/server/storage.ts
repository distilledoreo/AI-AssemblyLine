import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { createShortId } from "@/server/ids";

export const projectStorageFolders = [
  "uploads",
  "assets",
  "storyboards",
  "videos",
  "exports",
  "logs",
  "thumbnails",
] as const;

export type ProjectStorageFolder = (typeof projectStorageFolders)[number];

export function getStorageRoot() {
  return path.resolve(getConfig().STORAGE_ROOT);
}

function projectStorageDirectoryName(projectId: string) {
  const directoryName = projectId.replaceAll("-", "");
  if (!/^[A-Za-z0-9_]+$/.test(directoryName)) {
    throw new Error(
      "Project storage IDs may contain only letters, numbers, underscores, and dashes.",
    );
  }
  return directoryName;
}

export function projectStoragePath(projectId: string) {
  return storagePath(getStorageRoot(), "projects", projectStorageDirectoryName(projectId));
}

export function projectFolderPath(projectId: string, folder: ProjectStorageFolder) {
  return storagePath(projectStoragePath(projectId), folder);
}

export function allocateProjectStoragePath() {
  return storagePath(getStorageRoot(), "projects", createShortId());
}

export async function ensureProjectStorage(projectId: string) {
  const root = projectStoragePath(projectId);
  await Promise.all(
    projectStorageFolders.map((folder) => mkdir(storagePath(root, folder), { recursive: true })),
  );
  return root;
}

export async function ensureStorageRoot() {
  await mkdir(getStorageRoot(), { recursive: true });
  return getStorageRoot();
}

export function storagePath(root: string, ...segments: string[]) {
  return [root.replace(/[\\/]$/, ""), ...segments].join(path.sep);
}
