import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptProviderKeyWithSecret, encryptProviderKeyWithSecret } from "@/server/crypto";

const prismaMock = vi.hoisted(() => ({
  providerKey: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/server/prisma", () => ({ prisma: prismaMock }));

describe("provider key rotation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("decrypts provider keys with ENCRYPTION_KEY_OLD and stores them with ENCRYPTION_KEY", async () => {
    const oldKey = Buffer.alloc(32, 1).toString("base64");
    const newKey = Buffer.alloc(32, 2).toString("base64");
    const encrypted = encryptProviderKeyWithSecret("sk-live-rotation-secret", oldKey);
    prismaMock.providerKey.findMany.mockResolvedValue([
      {
        id: "key-1",
        encryptedKey: Buffer.from(encrypted.encryptedKey, "base64"),
        keyNonce: Buffer.from(encrypted.keyNonce, "base64"),
        createdAt: new Date("2026-05-11T00:00:00.000Z"),
      },
    ]);
    prismaMock.providerKey.update.mockReturnValue({ id: "key-1" });
    prismaMock.$transaction.mockResolvedValue([{ id: "key-1" }]);

    const { rotateProviderKeys } = await import("@/server/keyRotation");
    const result = await rotateProviderKeys(oldKey, newKey);

    expect(result).toEqual({ scanned: 1, rotated: 1 });
    expect(prismaMock.providerKey.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" } });
    expect(prismaMock.providerKey.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: {
        encryptedKey: expect.any(Buffer),
        keyNonce: expect.any(Buffer),
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([{ id: "key-1" }]);
    const update = prismaMock.providerKey.update.mock.calls[0]?.[0];
    const rotatedPlainText = decryptProviderKeyWithSecret(
      {
        encryptedKey: update.data.encryptedKey.toString("base64"),
        keyNonce: update.data.keyNonce.toString("base64"),
      },
      newKey,
    );
    expect(rotatedPlainText).toBe("sk-live-rotation-secret");
  });

  it("rejects rotation keys that do not decode to 32 bytes", async () => {
    const { rotateProviderKeys } = await import("@/server/keyRotation");

    await expect(
      rotateProviderKeys(
        Buffer.alloc(16).toString("base64"),
        Buffer.alloc(32, 2).toString("base64"),
      ),
    ).rejects.toThrow(/ENCRYPTION_KEY_OLD must decode to exactly 32 bytes/);
    expect(prismaMock.providerKey.findMany).not.toHaveBeenCalled();
  });
});
