import { decryptProviderKeyWithSecret, encryptProviderKeyWithSecret } from "@/server/crypto";
import { prisma } from "@/server/prisma";

export type ProviderKeyRotationResult = {
  scanned: number;
  rotated: number;
};

export async function rotateProviderKeys(
  oldKey: string,
  newKey: string,
): Promise<ProviderKeyRotationResult> {
  assertEncryptionKey(oldKey, "ENCRYPTION_KEY_OLD");
  assertEncryptionKey(newKey, "ENCRYPTION_KEY");

  const keys = await prisma.providerKey.findMany({ orderBy: { createdAt: "asc" } });
  const updates = keys.map((key) => {
    const plainText = decryptProviderKeyWithSecret(
      {
        encryptedKey: Buffer.from(key.encryptedKey).toString("base64"),
        keyNonce: Buffer.from(key.keyNonce).toString("base64"),
      },
      oldKey,
    );
    const encrypted = encryptProviderKeyWithSecret(plainText, newKey);
    return prisma.providerKey.update({
      where: { id: key.id },
      data: {
        encryptedKey: Buffer.from(encrypted.encryptedKey, "base64"),
        keyNonce: Buffer.from(encrypted.keyNonce, "base64"),
      },
    });
  });

  await prisma.$transaction(updates);

  return { scanned: keys.length, rotated: keys.length };
}

function assertEncryptionKey(value: string, name: string) {
  if (Buffer.from(value, "base64").byteLength !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes for AES-256-GCM.`);
  }
}
