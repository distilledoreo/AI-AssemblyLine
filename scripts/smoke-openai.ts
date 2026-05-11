import { loadStandardEnvFiles } from "./env-files";
import { runOpenAiSmoke } from "../src/providers/openaiSmoke";

async function main() {
  const env = await loadStandardEnvFiles(process.cwd());
  const result = await runOpenAiSmoke({
    apiKey: env.OPENAI_API_KEY,
    modelId: env.OPENAI_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
