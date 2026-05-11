import { isLiveProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";
import { AppError } from "@/server/errors";
import { decryptProjectProviderKey } from "@/server/repository";

type ProviderSlug = "openai" | "stability" | "runway";

export async function resolveOpenAiApiKeyForProject(projectId: string) {
  const key = await resolveProviderKey(projectId, "openai", process.env.OPENAI_API_KEY);
  if (isUsableProviderKey(key)) {
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new AppError("OpenAI API key is required for production generation.", 500, "provider_key_missing");
  }
  return "mock";
}

export async function resolveStabilityApiKeyForProject(projectId: string) {
  const key = await resolveProviderKey(projectId, "stability", process.env.STABILITY_API_KEY);
  if (isUsableProviderKey(key)) {
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new AppError("Stability API key is required for production image generation.", 500, "provider_key_missing");
  }
  return "mock";
}

export async function resolveRunwayApiKeyForProject(projectId: string) {
  const key = await resolveProviderKey(projectId, "runway", process.env.RUNWAYML_API_SECRET);
  if (isUsableProviderKey(key)) {
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new AppError("Runway API key is required for production video generation.", 500, "provider_key_missing");
  }
  return "mock";
}

async function resolveProviderKey(projectId: string, providerSlug: ProviderSlug, fallbackKey: string | undefined) {
  const workspaceKey = await resolveWorkspaceProviderKey(projectId, providerSlug);
  return normalizeProviderApiKey(workspaceKey) || normalizeProviderApiKey(fallbackKey);
}

async function resolveWorkspaceProviderKey(projectId: string, providerSlug: ProviderSlug) {
  try {
    return await decryptProjectProviderKey(projectId, providerSlug);
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "not_found");
}

function isUsableProviderKey(key: string | undefined): key is string {
  return process.env.NODE_ENV === "production" ? isLiveProviderApiKey(key) : Boolean(normalizeProviderApiKey(key));
}
