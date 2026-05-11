import { describe, expect, it } from "vitest";
import { isLiveProviderApiKey, isPlaceholderProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";

describe("provider key safety", () => {
  it("trims keys before classification", () => {
    expect(normalizeProviderApiKey("  sk-prod-openai-smoke-abc123  ")).toBe("sk-prod-openai-smoke-abc123");
  });

  it("rejects known mock, placeholder, and checked-in test key values as live credentials", () => {
    for (const key of ["mock", " Mock ", "placeholder", "sk-live-test", "sk-stability-live-test", "key_runway_live"]) {
      expect(isPlaceholderProviderApiKey(key)).toBe(true);
      expect(isLiveProviderApiKey(key)).toBe(false);
    }
  });

  it("accepts non-placeholder values as live-shaped credentials", () => {
    expect(isLiveProviderApiKey("sk-prod-openai-smoke-abc123")).toBe(true);
    expect(isLiveProviderApiKey("rw-prod-runway-smoke-abc123")).toBe(true);
  });
});
