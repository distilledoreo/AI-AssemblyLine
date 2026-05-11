import { describe, expect, it } from "vitest";
import {
  decryptProviderKey,
  decryptProviderKeyWithSecret,
  encryptProviderKey,
  encryptProviderKeyWithSecret,
  maskProviderKey,
} from "@/server/crypto";

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

  it("can decrypt with an old key and re-encrypt with a new key for rotation", () => {
    const oldKey = Buffer.alloc(32, 1).toString("base64");
    const newKey = Buffer.alloc(32, 2).toString("base64");
    const oldSecret = encryptProviderKeyWithSecret("sk-rotating-secret", oldKey);

    expect(decryptProviderKeyWithSecret(oldSecret, oldKey)).toBe("sk-rotating-secret");
    expect(() => decryptProviderKeyWithSecret(oldSecret, newKey)).toThrow();

    const rotatedSecret = encryptProviderKeyWithSecret(
      decryptProviderKeyWithSecret(oldSecret, oldKey),
      newKey,
    );
    expect(rotatedSecret.encryptedKey).not.toBe(oldSecret.encryptedKey);
    expect(decryptProviderKeyWithSecret(rotatedSecret, newKey)).toBe("sk-rotating-secret");
  });

  it("rejects explicit encryption keys that do not decode to 32 bytes", () => {
    expect(() =>
      encryptProviderKeyWithSecret("sk-test", Buffer.alloc(16).toString("base64")),
    ).toThrow(/must decode to exactly 32 bytes/);
  });
});
