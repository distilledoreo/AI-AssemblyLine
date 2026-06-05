import { describe, expect, it } from "vitest";
import {
  hasLiveProviderApiKeyShape,
  isLiveProviderApiKey,
  isPlaceholderProviderApiKey,
  normalizeProviderApiKey,
} from "@/providers/providerKeySafety";

describe("provider key safety", () => {
  it("trims keys before classification", () => {
    expect(normalizeProviderApiKey("  sk-prod-openai-smoke-abc123  ")).toBe("sk-prod-openai-smoke-abc123");
  });

  it("rejects known mock, placeholder, and checked-in test key values as live credentials", () => {
    for (const key of [
      "mock",
      " Mock ",
      "placeholder",
      "dummy",
      "your-api-key",
      "your-openai-api-key",
      "sk-live-test",
      "sk-stability-live-test",
      "key_runway_live",
    ]) {
      expect(isPlaceholderProviderApiKey(key)).toBe(true);
      expect(isLiveProviderApiKey(key)).toBe(false);
    }
  });

  it("rejects short or low-entropy values as live-shaped credentials", () => {
    for (const key of ["abc", "123456789012", "abcdefghijkl", "short-key"]) {
      expect(isPlaceholderProviderApiKey(key)).toBe(false);
      expect(hasLiveProviderApiKeyShape(key)).toBe(false);
      expect(isLiveProviderApiKey(key)).toBe(false);
    }
  });

  it("accepts non-placeholder values as live-shaped credentials", () => {
    expect(hasLiveProviderApiKeyShape("sk-prod-openai-smoke-abc123")).toBe(true);
    expect(isLiveProviderApiKey("sk-prod-openai-smoke-abc123")).toBe(true);
    expect(isLiveProviderApiKey("rw-prod-runway-smoke-abc123")).toBe(true);
  });
});
