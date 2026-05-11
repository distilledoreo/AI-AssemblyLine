import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getConfig } from "@/lib/config";

export type EncryptedSecret = {
  encryptedKey: string;
  keyNonce: string;
};

function decodeEncryptionKey(value: string, name = "ENCRYPTION_KEY") {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes for AES-256-GCM.`);
  }
  return key;
}

export function encryptProviderKey(plainText: string): EncryptedSecret {
  return encryptProviderKeyWithSecret(plainText, getConfig().ENCRYPTION_KEY);
}

export function encryptProviderKeyWithSecret(
  plainText: string,
  encryptionKey: string,
): EncryptedSecret {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeEncryptionKey(encryptionKey), nonce);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedKey: Buffer.concat([encrypted, tag]).toString("base64"),
    keyNonce: nonce.toString("base64"),
  };
}

export function decryptProviderKey(secret: EncryptedSecret) {
  return decryptProviderKeyWithSecret(secret, getConfig().ENCRYPTION_KEY);
}

export function decryptProviderKeyWithSecret(secret: EncryptedSecret, encryptionKey: string) {
  const payload = Buffer.from(secret.encryptedKey, "base64");
  const nonce = Buffer.from(secret.keyNonce, "base64");
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", decodeEncryptionKey(encryptionKey), nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskProviderKey(value: string) {
  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
