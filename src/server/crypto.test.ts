import { describe, expect, it } from "vitest";
import { decryptProviderKey, encryptProviderKey, maskProviderKey } from "@/server/crypto";

describe("provider key encryption", () => {
  it("encrypts API keys with a nonce and decrypts only server-side", () => {
    const secret = encryptProviderKey("sk-test-1234567890");

    expect(secret.encryptedKey).not.toContain("sk-test");
    expect(secret.keyNonce).toBeTruthy();
    expect(decryptProviderKey(secret)).toBe("sk-test-1234567890");
  });

  it("masks keys for client responses", () => {
    expect(maskProviderKey("sk-test-1234567890")).toBe("sk-t...7890");
    expect(maskProviderKey("short")).toBe("****");
  });
});
