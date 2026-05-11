import { loadStandardEnvFiles } from "./env-files";
import { runGoogleVeoSmoke } from "../src/providers/googleVeoSmoke";

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const result = await runGoogleVeoSmoke({
    apiKey: env.GEMINI_API_KEY ?? env.GOOGLE_AI_API_KEY,
    modelId: env.GOOGLE_VEO_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
