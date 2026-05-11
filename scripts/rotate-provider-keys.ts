import { loadStandardEnvFiles } from "./env-files";
import { rotateProviderKeys } from "../src/server/keyRotation";
import { prisma } from "../src/server/prisma";

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const oldKey = requiredEnv(env.ENCRYPTION_KEY_OLD, "ENCRYPTION_KEY_OLD");
  const newKey = requiredEnv(env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
  if (oldKey === newKey) {
    throw new Error("ENCRYPTION_KEY_OLD and ENCRYPTION_KEY must be different before rotation.");
  }

  const result = await rotateProviderKeys(oldKey, newKey);
  console.log(
    `Rotated ${result.rotated} provider key(s) out of ${result.scanned} scanned record(s).`,
  );
}

function requiredEnv(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required for provider key rotation.`);
  }
  return trimmed;
}

if (process.env.NODE_ENV !== "test") {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
