import { LocalLtxVideoAdapter, LocalQwenImageAdapter, LocalQwenTextAdapter } from "@/providers/localRuntime";
import { OpenAIAdapter } from "@/providers/openai";
import { StabilityAdapter } from "@/providers/stability";
import { GoogleVeoAdapter, RunwayAdapter } from "@/providers/videoProviders";
import { AppError, NotFoundError } from "@/server/errors";
import { getProject } from "@/server/repository";
import {
  resolveGoogleAiApiKeyForProject,
  resolveOpenAiApiKeyForProject,
  resolveRunwayApiKeyForProject,
  resolveStabilityApiKeyForProject,
} from "@/server/providerKeys";
import type { GenerationMode } from "@/server/types";

export async function resolveProjectGenerationMode(projectId: string): Promise<GenerationMode> {
  const project = await getProject(projectId);
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  return project.generationMode;
}

export async function createTextAdapterForProject(projectId: string) {
  if ((await resolveProjectGenerationMode(projectId)) === "local") {
    return new LocalQwenTextAdapter();
  }
  return new OpenAIAdapter(await resolveOpenAiApiKeyForProject(projectId));
}

export async function createImageAdapterForProject(projectId: string, cloudProviderSlug: "openai" | "stability" = "stability") {
  if ((await resolveProjectGenerationMode(projectId)) === "local") {
    return new LocalQwenImageAdapter();
  }
  return cloudProviderSlug === "openai"
    ? new OpenAIAdapter(await resolveOpenAiApiKeyForProject(projectId))
    : new StabilityAdapter(await resolveStabilityApiKeyForProject(projectId));
}

export async function createVideoAdapterForProject(projectId: string, cloudProviderSlug: string, fetchImpl: typeof fetch = fetch) {
  if ((await resolveProjectGenerationMode(projectId)) === "local") {
    return new LocalLtxVideoAdapter(process.env.LOCAL_RUNTIME_URL, fetchImpl);
  }
  if (cloudProviderSlug === "google-ai") {
    return new GoogleVeoAdapter(await resolveGoogleAiApiKeyForProject(projectId), fetchImpl);
  }
  if (cloudProviderSlug === "runway") {
    return new RunwayAdapter(await resolveRunwayApiKeyForProject(projectId), fetchImpl);
  }
  throw new AppError("Runway and Google AI Veo are the live-wired video providers for Cloud Mode.", 400, "unsupported_provider");
}

export function localProviderSlugForJob(type: "text" | "image" | "video") {
  if (type === "text") return "local-qwen-text";
  if (type === "image") return "local-qwen-image";
  return "local-ltx-video";
}

export function localModelIdForJob(type: "text" | "image" | "video") {
  if (type === "text") return "Qwen/Qwen3.6-27B";
  if (type === "image") return "Qwen/Qwen-Image-2512";
  return "diffusers/LTX-2.3-Diffusers";
}
