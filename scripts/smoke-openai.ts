import { runOpenAiSmoke } from "../src/providers/openaiSmoke";

async function main() {
  const result = await runOpenAiSmoke({
    apiKey: process.env.OPENAI_API_KEY,
    modelId: process.env.OPENAI_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
