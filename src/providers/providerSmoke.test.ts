import { describe, expect, it, vi } from "vitest";
import { assertProviderSmokeSuitePassed, runProviderSmokeSuite } from "@/providers/providerSmoke";

describe("provider smoke suite", () => {
  it("runs all live provider smoke checks with configured keys", async () => {
    const image = Buffer.from("stability-smoke-image");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "resp_smoke",
          model: "gpt-4.1-mini",
          output_text: "{\"ok\":true,\"provider\":\"openai\"}",
          usage: { input_tokens: 18, output_tokens: 8 },
        }),
      )
      .mockResolvedValueOnce(new Response(image, { status: 200, headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(Response.json({ id: "task-runway-smoke", status: "PENDING" }));

    const results = await runProviderSmokeSuite({
      env: {
        OPENAI_API_KEY: "sk-openai-live",
        STABILITY_API_KEY: "sk-stability-live",
        RUNWAYML_API_SECRET: "key_runway_live",
      },
      fetchImpl: fetchMock,
    });

    expect(results).toEqual([
      expect.objectContaining({ provider: "openai", ok: true }),
      expect.objectContaining({ provider: "stability", ok: true }),
      expect.objectContaining({ provider: "runway", ok: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(() => assertProviderSmokeSuitePassed(results)).not.toThrow();
  });

  it("reports every missing provider key and fails the suite", async () => {
    const results = await runProviderSmokeSuite({
      env: {},
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(results).toEqual([
      expect.objectContaining({ provider: "openai", ok: false, errorMessage: expect.stringContaining("OPENAI_API_KEY") }),
      expect.objectContaining({ provider: "stability", ok: false, errorMessage: expect.stringContaining("STABILITY_API_KEY") }),
      expect.objectContaining({ provider: "runway", ok: false, errorMessage: expect.stringContaining("RUNWAYML_API_SECRET") }),
    ]);
    expect(() => assertProviderSmokeSuitePassed(results)).toThrow("Provider smoke suite failed for openai, stability, runway.");
  });
});
