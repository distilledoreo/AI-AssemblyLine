import { loadStandardEnvFiles } from "./env-files";
import { runRunwaySmoke } from "../src/providers/runwaySmoke";

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const result = await runRunwaySmoke({
    apiKey: env.RUNWAYML_API_SECRET,
    modelId: env.RUNWAY_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
