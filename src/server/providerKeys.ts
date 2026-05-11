import { AppError } from "@/server/errors";
import { decryptProjectProviderKey } from "@/server/repository";

export async function resolveOpenAiApiKeyForProject(projectId: string) {
  const workspaceKey = await decryptProjectProviderKey(projectId, "openai").catch(() => undefined);
  const key = workspaceKey || process.env.OPENAI_API_KEY;
  if (key && (key !== "mock" || process.env.NODE_ENV !== "production")) {
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new AppError("OpenAI API key is required for production generation.", 500, "provider_key_missing");
  }
  return "mock";
}
