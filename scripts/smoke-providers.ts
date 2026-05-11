import { assertProviderSmokeSuitePassed, runProviderSmokeSuite } from "../src/providers/providerSmoke";

async function main() {
  const results = await runProviderSmokeSuite();
  for (const result of results) {
    if (result.ok) {
      console.log(`PASS ${result.provider}: ${JSON.stringify(result.result)}`);
    } else {
      console.error(`FAIL ${result.provider}: ${result.errorMessage}`);
    }
  }
  assertProviderSmokeSuitePassed(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provider smoke suite failed.");
  process.exitCode = 1;
});
