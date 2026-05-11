import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveGoogleAiApiKeyForProject,
  resolveOpenAiApiKeyForProject,
  resolveRunwayApiKeyForProject,
  resolveStabilityApiKeyForProject,
} from "@/server/providerKeys";

const decryptProjectProviderKeyMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repository", () => ({
  decryptProjectProviderKey: decryptProjectProviderKeyMock,
}));

describe("provider key resolution", () => {
  beforeEach(() => {
    decryptProjectProviderKeyMock.mockRejectedValue({ code: "not_found" });
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it("rejects mock OpenAI credentials in production regardless of casing", async () => {
    vi.stubEnv("OPENAI_API_KEY", " MOCK ");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses OPENAI_API_KEY when no workspace key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-prod-openai-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("sk-prod-openai-smoke-abc123");
  });

  it("uses a workspace OpenAI key before the server fallback key", async () => {
    decryptProjectProviderKeyMock.mockResolvedValue("sk-workspace-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-env-test");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe(
      "sk-workspace-test",
    );
    expect(decryptProjectProviderKeyMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000000", "openai");
  });

  it("surfaces OpenAI workspace key lookup failures instead of falling back to env credentials", async () => {
    decryptProjectProviderKeyMock.mockRejectedValue(new Error("database unavailable"));
    vi.stubEnv("OPENAI_API_KEY", "sk-env-test");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveOpenAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      "database unavailable",
    );
  });

  it("requires real Stability credentials in production", async () => {
    vi.stubEnv("STABILITY_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveStabilityApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses STABILITY_API_KEY when no workspace key is configured", async () => {
    vi.stubEnv("STABILITY_API_KEY", "sk-stability-prod-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveStabilityApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("sk-stability-prod-smoke-abc123");
  });

  it("surfaces Stability workspace key lookup failures instead of falling back to env credentials", async () => {
    decryptProjectProviderKeyMock.mockRejectedValue(new Error("decrypt failed"));
    vi.stubEnv("STABILITY_API_KEY", "sk-stability-prod-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveStabilityApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      "decrypt failed",
    );
  });

  it("requires real Runway credentials in production", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveRunwayApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses RUNWAYML_API_SECRET when no workspace key is configured", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveRunwayApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe("rw-prod-runway-smoke-abc123");
  });

  it("surfaces Runway workspace key lookup failures instead of falling back to env credentials", async () => {
    decryptProjectProviderKeyMock.mockRejectedValue(new Error("key store offline"));
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveRunwayApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      "key store offline",
    );
  });

  it("requires real Google AI credentials in production", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveGoogleAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "provider_key_missing",
    });
  });

  it("uses GEMINI_API_KEY when no workspace Google AI key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-prod-veo-smoke-abc123");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveGoogleAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe(
      "gemini-prod-veo-smoke-abc123",
    );
  });

  it("uses a workspace Google AI key before the server fallback key", async () => {
    decryptProjectProviderKeyMock.mockResolvedValue("gemini-workspace-test");
    vi.stubEnv("GEMINI_API_KEY", "gemini-env-test");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveGoogleAiApiKeyForProject("00000000-0000-4000-8000-000000000000")).resolves.toBe(
      "gemini-workspace-test",
    );
    expect(decryptProjectProviderKeyMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000000", "google-ai");
  });
});
