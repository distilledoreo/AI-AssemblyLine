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

export function projectStoragePath(projectId: string) {
  return storagePath(getStorageRoot(), "projects", projectId.replaceAll("-", ""));
}

export function projectFolderPath(projectId: string, folder: ProjectStorageFolder) {
  return storagePath(projectStoragePath(projectId), folder);
}

export function allocateProjectStoragePath() {
  return storagePath(getStorageRoot(), "projects", createShortId());
}

export async function ensureProjectStorage(projectId: string) {
  const root = projectStoragePath(projectId);
  await Promise.all(projectStorageFolders.map((folder) => mkdir(storagePath(root, folder), { recursive: true })));
  return root;
}

export async function ensureStorageRoot() {
  await mkdir(getStorageRoot(), { recursive: true });
  return getStorageRoot();
}

export function storagePath(root: string, ...segments: string[]) {
  return [root.replace(/[\\/]$/, ""), ...segments].join(path.sep);
}
