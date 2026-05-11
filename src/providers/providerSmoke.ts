import { runOpenAiSmoke, type OpenAiSmokeResult } from "@/providers/openaiSmoke";
import { runRunwaySmoke, type RunwaySmokeResult } from "@/providers/runwaySmoke";
import { runStabilitySmoke, type StabilitySmokeResult } from "@/providers/stabilitySmoke";

export type ProviderSmokeResult = OpenAiSmokeResult | StabilitySmokeResult | RunwaySmokeResult;

export type ProviderSmokeSummary =
  | { provider: ProviderSmokeResult["provider"]; ok: true; result: ProviderSmokeResult }
  | { provider: ProviderSmokeResult["provider"]; ok: false; errorMessage: string };

export async function runProviderSmokeSuite(input: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<ProviderSmokeSummary[]> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks: Array<{ provider: ProviderSmokeResult["provider"]; run: () => Promise<ProviderSmokeResult> }> = [
    {
      provider: "openai",
      run: () =>
        runOpenAiSmoke({
          apiKey: env.OPENAI_API_KEY,
          modelId: env.OPENAI_SMOKE_MODEL,
          fetchImpl,
        }),
    },
    {
      provider: "stability",
      run: () =>
        runStabilitySmoke({
          apiKey: env.STABILITY_API_KEY,
          modelId: env.STABILITY_SMOKE_MODEL,
          fetchImpl,
        }),
    },
    {
      provider: "runway",
      run: () =>
        runRunwaySmoke({
          apiKey: env.RUNWAYML_API_SECRET,
          modelId: env.RUNWAY_SMOKE_MODEL,
          fetchImpl,
        }),
    },
  ];

  const results: ProviderSmokeSummary[] = [];
  for (const check of checks) {
    try {
      results.push({ provider: check.provider, ok: true, result: await check.run() });
    } catch (error) {
      results.push({
        provider: check.provider,
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Provider smoke check failed.",
      });
    }
  }
  return results;
}

export function assertProviderSmokeSuitePassed(results: ProviderSmokeSummary[]) {
  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(`Provider smoke suite failed for ${failures.map((failure) => failure.provider).join(", ")}.`);
  }
}
