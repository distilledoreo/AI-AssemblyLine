import { runStabilitySmoke } from "../src/providers/stabilitySmoke";

async function main() {
  const result = await runStabilitySmoke({
    apiKey: process.env.STABILITY_API_KEY,
    modelId: process.env.STABILITY_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
