import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getScriptAnalysisGraph } from "@/server/repository";
import { ensureProjectStorage, projectFolderPath, projectStorageFolders, projectStoragePath } from "@/server/storage";
import type { StorageUsage } from "@/server/types";

const WARNING_BYTES = 80 * 1024 * 1024;
const CRITICAL_BYTES = 95 * 1024 * 1024;

async function walkFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(root, entry.name);
        return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
      }),
    );
    return nested.flat();
  } catch {
    return [];
  }
}

function referencedFiles(projectId: string) {
  const graph = getScriptAnalysisGraph(projectId);
  return new Set(
    [
      ...graph.scripts.map((script) => script.filename),
      graph.activeVersion?.filePath,
      ...graph.assetReferences.flatMap((reference) => [reference.filePath, reference.thumbnailPath]),
      ...graph.frameVersions.flatMap((version) => [version.filePath, version.thumbnailPath]),
      ...graph.clipVersions.flatMap((version) => [version.filePath, version.thumbnailPath]),
    ]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => path.resolve(candidate)),
  );
}

export async function getProjectStorageUsage(projectId: string): Promise<StorageUsage> {
  await ensureProjectStorage(projectId);
  const files = await walkFiles(projectStoragePath(projectId));
  const stats = await Promise.all(files.map(async (file) => ({ file, stats: await stat(file) })));
  const totalBytes = stats.reduce((sum, item) => sum + item.stats.size, 0);
  const references = referencedFiles(projectId);
  const orphanFiles = files.filter((file) => !references.has(path.resolve(file)) && !file.includes(`${path.sep}exports${path.sep}`));
  const thumbnailRoot = projectFolderPath(projectId, "thumbnails");
  const thumbnailFiles = files.filter((file) => path.resolve(file).startsWith(path.resolve(thumbnailRoot)));
  const warningLevel = totalBytes >= CRITICAL_BYTES ? "critical" : totalBytes >= WARNING_BYTES ? "warning" : "ok";

  return {
    projectId,
    totalBytes,
    fileCount: files.length,
    orphanFiles,
    thumbnailFiles,
    warningLevel,
    warningMessage:
      warningLevel === "ok"
        ? undefined
        : `Project storage is ${warningLevel}; review orphan files and clear thumbnails before more generation.`,
  };
}

export async function clearThumbnailCache(projectId: string) {
  const thumbnailRoot = projectFolderPath(projectId, "thumbnails");
  const files = await walkFiles(thumbnailRoot);
  await Promise.all(files.map((file) => rm(file, { force: true })));
  return { clearedFiles: files.length };
}

export async function cleanupOrphanFiles(projectId: string) {
  const usage = await getProjectStorageUsage(projectId);
  await Promise.all(usage.orphanFiles.map((file) => rm(file, { force: true })));
  return { removedFiles: usage.orphanFiles.length };
}

export function getProjectStorageFolders() {
  return projectStorageFolders;
}
