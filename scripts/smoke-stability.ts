import { loadStandardEnvFiles } from "./env-files";
import { runStabilitySmoke } from "../src/providers/stabilitySmoke";

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const result = await runStabilitySmoke({
    apiKey: env.STABILITY_API_KEY,
    modelId: env.STABILITY_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
