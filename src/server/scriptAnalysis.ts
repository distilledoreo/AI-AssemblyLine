import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, NotFoundError } from "@/server/errors";
import { createId, nowIso } from "@/server/ids";
import {
  addJobEvent,
  createGenerationJob,
  completeGenerationJob,
  createScriptVersionForProject,
  getProject,
  getScriptAnalysisGraph,
  getScriptAnalysisGraphForProject,
  getScriptVersionById,
  getStore,
  deleteSceneAssetRequirement,
  getAssetById,
  getSceneById,
  getShotById,
  persistGeneratedScriptAnalysis,
  persistAssetState,
  persistSceneAssetRequirement,
  persistSceneState,
  persistShotState,
  refreshPrismaReadiness,
  markGenerationJobRunning,
  updateScriptVersionAnalysisStatus,
} from "@/server/repository";
import { isRedisQueueEnabled } from "@/server/queue";
import { projectFolderPath } from "@/server/storage";
import type { Asset, AssetType, Scene, Shot } from "@/server/types";

const sceneHeadingPattern = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i;
const characterCuePattern = /^[A-Z][A-Z0-9 '\-]{1,32}$/;

export type ScriptSceneOutput = {
  sceneNumber: number;
  heading: string;
  summary: string;
  scriptStartLine: number;
  scriptEndLine: number;
  locationHint?: string;
};

export type ScriptShotOutput = {
  sceneNumber: number;
  shots: Array<{
    shotNumber: number;
    action: string;
    cameraAngle?: string;
    cameraMovement?: string;
    lensNotes?: string;
    lightingNotes?: string;
  }>;
};

export type ScriptAssetOutput = {
  assets: Array<{
    canonicalName: string;
    type: AssetType;
    aliases?: string[];
    description?: string;
    firstAppearance?: { sceneNumber: number; shotNumber?: number };
  }>;
  sceneAssetLinks: Array<{ sceneNumber: number; assetName: string }>;
  shotAssetLinks: Array<{ sceneNumber: number; shotNumber: number; assetName: string }>;
  warnings: string[];
};

export async function uploadScriptForProject(input: {
  projectId: string;
  filename: string;
  text: string;
}) {
  const project = await getProject(input.projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  const text = input.text.trim();
  if (text.length < 10) {
    throw new AppError("Script text must contain at least ten characters.");
  }

  const store = getStore();
  const timestamp = nowIso();
  const uploadDir = projectFolderPath(input.projectId, "uploads");
  await mkdir(uploadDir, { recursive: true });
  const safeName = input.filename.replace(/[^a-z0-9._-]/gi, "_") || "script.txt";
  const versionNumber = store.scriptVersions.filter((version) =>
    store.scripts.some((script) => script.projectId === input.projectId && script.id === version.scriptId),
  ).length + 1;
  const filePath = path.join(uploadDir, `v${versionNumber}-${safeName}`);
  await writeFile(filePath, text, "utf8");

  const { version, previousVersionIds } = await createScriptVersionForProject({
    projectId: input.projectId,
    filename: input.filename,
    filePath,
    rawText: text,
  });
  const previousSceneIds = new Set(
    store.scenes
      .filter((scene) => previousVersionIds.has(scene.scriptVersionId))
      .map((scene) => {
        scene.status = "superseded";
        scene.updatedAt = timestamp;
        return scene.id;
      }),
  );
  store.shots
    .filter((shot) => previousSceneIds.has(shot.sceneId))
    .forEach((shot) => {
      shot.status = "superseded";
      shot.updatedAt = timestamp;
    });
  const job = createScriptAnalysisJob(input.projectId, version.id);
  if (isRedisQueueEnabled()) {
    return getScriptAnalysisGraph(input.projectId);
  }
  await processScriptAnalysisJob({ projectId: input.projectId, scriptVersionId: version.id, jobId: job.id });
  return getScriptAnalysisGraph(input.projectId);
}

export async function runScriptAnalysis(projectId: string, scriptVersionId?: string) {
  const version =
    (scriptVersionId ? await getScriptVersionById(scriptVersionId) : undefined) ??
    (await getScriptAnalysisGraphForProject(projectId)).activeVersion;
  if (!version) {
    throw new NotFoundError("Script version not found.");
  }

  const job = createScriptAnalysisJob(projectId, version.id);
  if (isRedisQueueEnabled()) {
    return getScriptAnalysisGraph(projectId);
  }
  return processScriptAnalysisJob({ projectId, scriptVersionId: version.id, jobId: job.id });
}

export async function processScriptAnalysisJob(input: { projectId: string; scriptVersionId: string; jobId: string }) {
  const version = await getScriptVersionById(input.scriptVersionId);
  if (!version) {
    throw new NotFoundError("Script version not found.");
  }
  const job = await markGenerationJobRunning(input.jobId);
  if (!job) {
    throw new NotFoundError("Generation job not found.");
  }

  await updateScriptVersionAnalysisStatus(version.id, "running");
  addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "status_change",
    message: "Script analysis started.",
    progressPct: 5,
  });
  addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "progress",
    message: "Pass 1: extracting scenes.",
    progressPct: 15,
  });
  const sceneOutputs = extractScenes(version.rawText);

  addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "progress",
    message: "Pass 2: breaking scenes into shots.",
    progressPct: 45,
  });
  const shotOutputs = sceneOutputs.map((scene) => breakSceneIntoShots(scene, version.rawText));

  addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "progress",
    message: "Pass 3: detecting and deduplicating assets.",
    progressPct: 75,
  });
  const assetOutput = detectAssets(sceneOutputs, shotOutputs, version.rawText);

  await persistAnalysis(input.projectId, version.id, sceneOutputs, shotOutputs, assetOutput);
  await updateScriptVersionAnalysisStatus(version.id, "complete");
  completeGenerationJob(job.id, {
    status: "complete",
    outputPayload: {
      scenes: sceneOutputs.length,
      shots: shotOutputs.reduce((total, scene) => total + scene.shots.length, 0),
      assets: assetOutput.assets.length,
      warnings: assetOutput.warnings,
    },
  });
  addJobEvent({
    jobId: job.id,
    projectId: input.projectId,
    eventType: "status_change",
    message: "Script analysis complete.",
    progressPct: 100,
  });
  return getScriptAnalysisGraphForProject(input.projectId);
}

function createScriptAnalysisJob(projectId: string, scriptVersionId: string) {
  return createGenerationJob({
    projectId,
    type: "script_analysis",
    providerSlug: "local-mock",
    modelId: "deterministic-script-pass-v1",
    inputPayload: { projectId, scriptVersionId, preserveUserEdits: true },
  });
}

export function extractScenes(scriptText: string): ScriptSceneOutput[] {
  const lines = scriptText.split(/\r?\n/);
  const headings = lines
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter((entry) => sceneHeadingPattern.test(entry.line));

  if (headings.length === 0) {
    return [
      {
        sceneNumber: 1,
        heading: "UNTITLED SCENE",
        summary: summarizeLines(lines),
        scriptStartLine: 1,
        scriptEndLine: lines.length,
      },
    ];
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const body = lines.slice(heading.index, (next?.index ?? lines.length + 1) - 1);
    return {
      sceneNumber: index + 1,
      heading: heading.line,
      summary: summarizeLines(body),
      scriptStartLine: heading.index,
      scriptEndLine: (next?.index ?? lines.length + 1) - 1,
      locationHint: extractLocationHint(heading.line),
    };
  });
}

export function breakSceneIntoShots(scene: ScriptSceneOutput, scriptText: string): ScriptShotOutput {
  const lines = scriptText.split(/\r?\n/).slice(scene.scriptStartLine, scene.scriptEndLine);
  const actionLines = lines
    .map((line) => line.trim())
    .filter((line) => line && !sceneHeadingPattern.test(line) && !characterCuePattern.test(line));
  const blocks = chunkLines(actionLines, 3);
  const shots = (blocks.length ? blocks : [[scene.summary]]).map((block, index) => ({
    shotNumber: index + 1,
    action: block.join(" "),
    cameraAngle: index === 0 ? "establishing wide" : "medium",
    cameraMovement: index === 0 ? "static" : "slow push in",
    lensNotes: "Production-safe lens suggestion derived from scene action.",
    lightingNotes: scene.heading.toUpperCase().includes("NIGHT")
      ? "Low-key practical motivated lighting."
      : "Natural motivated key light.",
  }));
  return { sceneNumber: scene.sceneNumber, shots };
}

export function detectAssets(
  scenes: ScriptSceneOutput[],
  shotBreakdowns: ScriptShotOutput[],
  scriptText: string,
): ScriptAssetOutput {
  const assets = new Map<string, ScriptAssetOutput["assets"][number]>();
  const sceneAssetLinks: ScriptAssetOutput["sceneAssetLinks"] = [];
  const shotAssetLinks: ScriptAssetOutput["shotAssetLinks"] = [];
  const warnings: string[] = [];

  for (const scene of scenes) {
    if (scene.locationHint) {
      upsertAsset(assets, {
        canonicalName: scene.locationHint,
        type: "location",
        aliases: [scene.heading],
        description: `Location inferred from ${scene.heading}.`,
        firstAppearance: { sceneNumber: scene.sceneNumber },
      });
      sceneAssetLinks.push({ sceneNumber: scene.sceneNumber, assetName: scene.locationHint });
    }
  }

  for (const name of detectCharacterNames(scriptText)) {
    upsertAsset(assets, {
      canonicalName: titleCase(name),
      type: "character",
      aliases: [name],
      description: `Character cue detected for ${titleCase(name)}.`,
      firstAppearance: { sceneNumber: 1, shotNumber: 1 },
    });
  }

  const propMatches = Array.from(scriptText.matchAll(/\b(?:close on|insert|reveals?|holds?)\s+(?:the\s+|a\s+|an\s+)?([A-Z][a-zA-Z0-9 '\-]{2,32})/g));
  for (const match of propMatches) {
    upsertAsset(assets, {
      canonicalName: titleCase(match[1]),
      type: "prop",
      aliases: [match[1]],
      description: "Close-up or interaction prop inferred from script action.",
      firstAppearance: { sceneNumber: 1 },
    });
  }

  const assetList = Array.from(assets.values());
  for (const scene of scenes) {
    const shots = shotBreakdowns.find((candidate) => candidate.sceneNumber === scene.sceneNumber)?.shots ?? [];
    for (const asset of assetList) {
      const haystack = `${scene.heading} ${scene.summary} ${shots.map((shot) => shot.action).join(" ")}`.toLowerCase();
      if (haystack.includes(asset.canonicalName.toLowerCase()) || asset.type === "location") {
        sceneAssetLinks.push({ sceneNumber: scene.sceneNumber, assetName: asset.canonicalName });
        shots.forEach((shot) => {
          if (haystack.includes(asset.canonicalName.toLowerCase()) || asset.type === "location") {
            shotAssetLinks.push({
              sceneNumber: scene.sceneNumber,
              shotNumber: shot.shotNumber,
              assetName: asset.canonicalName,
            });
          }
        });
      }
    }
  }

  if (scenes.length === 1 && scenes[0].heading === "UNTITLED SCENE") {
    warnings.push("No INT./EXT. scene headings were detected; review the generated scene manually.");
  }

  return {
    assets: assetList,
    sceneAssetLinks: uniqueLinks(sceneAssetLinks),
    shotAssetLinks: uniqueLinks(shotAssetLinks),
    warnings,
  };
}

export function extractJsonFromModelOutput(output: string) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? output;
  return JSON.parse(candidate);
}

async function persistAnalysis(
  projectId: string,
  scriptVersionId: string,
  sceneOutputs: ScriptSceneOutput[],
  shotOutputs: ScriptShotOutput[],
  assetOutput: ScriptAssetOutput,
) {
  const store = getStore();
  const timestamp = nowIso();
  const previousScenes = store.scenes.filter((scene) => scene.scriptVersionId === scriptVersionId);
  const previousSceneIds = new Set(previousScenes.map((scene) => scene.id));
  const previousShots = store.shots.filter((shot) => previousSceneIds.has(shot.sceneId));
  const previousShotIds = new Set(previousShots.map((shot) => shot.id));
  const previousSceneNumberById = new Map(previousScenes.map((scene) => [scene.id, scene.sceneNumber]));
  store.sceneAssetRequirements = store.sceneAssetRequirements.filter((req) => !previousSceneIds.has(req.sceneId));
  store.shotAssetRequirements = store.shotAssetRequirements.filter((req) => !previousShotIds.has(req.shotId));
  store.shots = store.shots.filter((shot) => !previousShotIds.has(shot.id) || shot.isUserEdited);
  store.scenes = store.scenes.filter((scene) => !previousSceneIds.has(scene.id) || scene.isUserEdited);

  const sceneByNumber = new Map<number, Scene>();
  for (const output of sceneOutputs) {
    const existing = previousScenes.find((scene) => scene.sceneNumber === output.sceneNumber && scene.isUserEdited);
    const scene: Scene =
      existing ??
      ({
        id: createId(),
        scriptVersionId,
        sceneNumber: output.sceneNumber,
        heading: output.heading,
        summary: output.summary,
        scriptStartLine: output.scriptStartLine,
        scriptEndLine: output.scriptEndLine,
        locationHint: output.locationHint,
        status: "blocked",
        warnings: assetOutput.warnings,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Scene);
    sceneByNumber.set(output.sceneNumber, scene);
    if (!store.scenes.some((candidate) => candidate.id === scene.id)) {
      store.scenes.push(scene);
    }
  }

  const shotBySceneAndNumber = new Map<string, Shot>();
  for (const sceneShots of shotOutputs) {
    const scene = sceneByNumber.get(sceneShots.sceneNumber);
    if (!scene) {
      continue;
    }
    for (const output of sceneShots.shots) {
      const existing = previousShots.find(
        (shot) =>
          shot.isUserEdited &&
          previousSceneNumberById.get(shot.sceneId) === sceneShots.sceneNumber &&
          shot.shotNumber === output.shotNumber,
      );
      const shot: Shot =
        existing ??
        ({
          id: createId(),
          sceneId: scene.id,
          shotNumber: output.shotNumber,
          action: output.action,
          cameraAngle: output.cameraAngle,
          cameraMovement: output.cameraMovement,
          lensNotes: output.lensNotes,
          lightingNotes: output.lightingNotes,
          status: "blocked",
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies Shot);
      shot.sceneId = scene.id;
      if (!store.shots.some((candidate) => candidate.id === shot.id)) {
        store.shots.push(shot);
      }
      shotBySceneAndNumber.set(`${sceneShots.sceneNumber}:${output.shotNumber}`, shot);
    }
  }

  const assetByName = new Map<string, Asset>();
  for (const output of assetOutput.assets) {
    const existing = store.assets.find(
      (asset) => asset.projectId === projectId && asset.canonicalName.toLowerCase() === output.canonicalName.toLowerCase(),
    );
    const asset: Asset =
      existing ??
      ({
        id: createId(),
        projectId,
        type: output.type,
        canonicalName: output.canonicalName,
        aliases: output.aliases ?? [],
        status: "missing",
        description: output.description,
        firstAppearance: output.firstAppearance,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Asset);
    asset.aliases = Array.from(new Set([...(asset.aliases ?? []), ...(output.aliases ?? [])]));
    assetByName.set(output.canonicalName.toLowerCase(), asset);
    if (!store.assets.some((candidate) => candidate.id === asset.id)) {
      store.assets.push(asset);
    }
  }

  for (const link of assetOutput.sceneAssetLinks) {
    const scene = sceneByNumber.get(link.sceneNumber);
    const asset = assetByName.get(link.assetName.toLowerCase());
    if (scene && asset && !store.sceneAssetRequirements.some((req) => req.sceneId === scene.id && req.assetId === asset.id)) {
      store.sceneAssetRequirements.push({
        id: createId(),
        sceneId: scene.id,
        assetId: asset.id,
        isOptional: false,
        detectedBy: "ai",
        createdAt: timestamp,
      });
    }
  }

  for (const link of assetOutput.shotAssetLinks) {
    const shot = shotBySceneAndNumber.get(`${link.sceneNumber}:${link.shotNumber}`);
    const asset = assetByName.get(link.assetName.toLowerCase());
    if (shot && asset && !store.shotAssetRequirements.some((req) => req.shotId === shot.id && req.assetId === asset.id)) {
      store.shotAssetRequirements.push({
        id: createId(),
        shotId: shot.id,
        assetId: asset.id,
        isOptional: false,
        detectedBy: "ai",
        createdAt: timestamp,
      });
    }
  }
  await persistGeneratedScriptAnalysis({
    projectId,
    scriptVersionId,
    scenes: sceneOutputs,
    shotBreakdowns: shotOutputs,
    assets: assetOutput.assets,
    sceneAssetLinks: assetOutput.sceneAssetLinks,
    shotAssetLinks: assetOutput.shotAssetLinks,
    warnings: assetOutput.warnings,
  });
  refreshReadiness(projectId);
}

export async function updateScene(sceneId: string, input: Partial<Pick<Scene, "heading" | "summary" | "locationHint" | "status">>) {
  const scene = await getSceneById(sceneId);
  if (!scene) {
    throw new NotFoundError("Scene not found.");
  }
  Object.assign(scene, input, { isUserEdited: true, updatedAt: nowIso() });
  await persistSceneState(scene);
  return scene;
}

export async function updateShot(shotId: string, input: Partial<Pick<Shot, "action" | "cameraAngle" | "cameraMovement" | "lensNotes" | "lightingNotes" | "userDirection" | "status">>) {
  const shot = await getShotById(shotId);
  if (!shot) {
    throw new NotFoundError("Shot not found.");
  }
  Object.assign(shot, input, { isUserEdited: true, updatedAt: nowIso() });
  await persistShotState(shot);
  return shot;
}

export async function updateAsset(assetId: string, input: Partial<Pick<Asset, "canonicalName" | "type" | "status" | "description" | "continuityNotes" | "negativePrompts">>) {
  const asset = await getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError("Asset not found.");
  }
  Object.assign(asset, input, { isUserEdited: true, updatedAt: nowIso() });
  refreshReadiness(asset.projectId);
  await persistAssetState(asset);
  await refreshPrismaReadiness(asset.projectId);
  return asset;
}

export async function addSceneAssetRequirement(sceneId: string, assetId: string) {
  const store = getStore();
  const scene = store.scenes.find((candidate) => candidate.id === sceneId);
  const asset = store.assets.find((candidate) => candidate.id === assetId);
  if (!scene || !asset) {
    throw new NotFoundError("Scene or asset not found.");
  }
  if (!store.sceneAssetRequirements.some((req) => req.sceneId === sceneId && req.assetId === assetId)) {
    const requirement = {
      id: createId(),
      sceneId,
      assetId,
      isOptional: false,
      detectedBy: "user",
      createdAt: nowIso(),
    } as const;
    store.sceneAssetRequirements.push(requirement);
    await persistSceneAssetRequirement(requirement);
  }
  refreshReadiness(asset.projectId);
  await refreshPrismaReadiness(asset.projectId);
}

export async function removeSceneAssetRequirement(requirementId: string) {
  const store = getStore();
  const requirement = store.sceneAssetRequirements.find((req) => req.id === requirementId);
  const asset = requirement ? store.assets.find((candidate) => candidate.id === requirement.assetId) : undefined;
  store.sceneAssetRequirements = store.sceneAssetRequirements.filter((req) => req.id !== requirementId);
  await deleteSceneAssetRequirement(requirementId);
  if (asset) {
    refreshReadiness(asset.projectId);
    await refreshPrismaReadiness(asset.projectId);
  }
}

function refreshReadiness(projectId: string) {
  const store = getStore();
  const approvedAssetIds = new Set(
    store.assets.filter((asset) => asset.projectId === projectId && ["approved", "locked"].includes(asset.status)).map((asset) => asset.id),
  );
  for (const scene of store.scenes) {
    const reqs = store.sceneAssetRequirements.filter((req) => req.sceneId === scene.id && !req.isOptional);
    scene.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
  for (const shot of store.shots) {
    const reqs = store.shotAssetRequirements.filter((req) => req.shotId === shot.id && !req.isOptional);
    shot.status = reqs.length > 0 && reqs.every((req) => approvedAssetIds.has(req.assetId)) ? "ready" : "blocked";
  }
}

function summarizeLines(lines: string[]) {
  return (
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .find((line) => !sceneHeadingPattern.test(line) && !characterCuePattern.test(line))
      ?.slice(0, 180) ?? "Scene summary pending user review."
  );
}

function extractLocationHint(heading: string) {
  return titleCase(heading
    .replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i, "")
    .split(/\s+-\s+/)[0]
    .trim());
}

function chunkLines(lines: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks;
}

function detectCharacterNames(scriptText: string) {
  return Array.from(
    new Set(
      scriptText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => characterCuePattern.test(line) && !sceneHeadingPattern.test(line)),
    ),
  );
}

function upsertAsset(
  assets: Map<string, ScriptAssetOutput["assets"][number]>,
  asset: ScriptAssetOutput["assets"][number],
) {
  const key = asset.canonicalName.toLowerCase();
  const existing = assets.get(key);
  if (!existing) {
    assets.set(key, asset);
    return;
  }
  existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...(asset.aliases ?? [])]));
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueLinks<T>(links: T[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = JSON.stringify(link);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
