import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOpenAiApiKeyForProject, resolveStabilityApiKeyForProject } from "@/server/providerKeys";

describe("provider key resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses mock OpenAI credentials only outside production", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "test");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("mock");
  });

  it("requires real OpenAI credentials in production", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("rejects mock OpenAI credentials in production", async () => {
    vi.stubEnv("OPENAI_API_KEY", "mock");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses OPENAI_API_KEY when no workspace key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-live-test");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("sk-live-test");
  });

  it("requires real Stability credentials in production", async () => {
    vi.stubEnv("STABILITY_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveStabilityApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses STABILITY_API_KEY when no workspace key is configured", async () => {
    vi.stubEnv("STABILITY_API_KEY", "sk-stability-live-test");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveStabilityApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("sk-stability-live-test");
  });
});
