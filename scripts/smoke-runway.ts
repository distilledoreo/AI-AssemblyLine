import { runRunwaySmoke } from "../src/providers/runwaySmoke";

async function main() {
  const result = await runRunwaySmoke({
    apiKey: process.env.RUNWAYML_API_SECRET,
    modelId: process.env.RUNWAY_SMOKE_MODEL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
