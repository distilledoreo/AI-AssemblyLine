import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertProviderSmokeSuitePassed, runProviderSmokeSuite } from "@/providers/providerSmoke";
import { loadStandardEnvFiles } from "../../scripts/env-files";

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
      .mockResolvedValueOnce(Response.json({ id: "task-runway-smoke", status: "PENDING" }))
      .mockResolvedValueOnce(Response.json({ id: "task-runway-smoke", status: "RUNNING", progress: 25 }))
      .mockResolvedValueOnce(Response.json({ name: "operations/veo-smoke" }))
      .mockResolvedValueOnce(Response.json({ done: false }));

    const results = await runProviderSmokeSuite({
      env: {
        OPENAI_API_KEY: "sk-openai-live-abc123",
        STABILITY_API_KEY: "sk-stability-live-abc123",
        RUNWAYML_API_SECRET: "rw-prod-runway-smoke-abc123",
        GEMINI_API_KEY: "gemini-prod-veo-smoke-abc123",
      },
      fetchImpl: fetchMock,
    });

    expect(results).toEqual([
      expect.objectContaining({ provider: "openai", ok: true }),
      expect.objectContaining({ provider: "stability", ok: true }),
      expect.objectContaining({ provider: "runway", ok: true }),
      expect.objectContaining({ provider: "google-ai", ok: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
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
      expect.objectContaining({ provider: "google-ai", ok: false, errorMessage: expect.stringContaining("GEMINI_API_KEY") }),
    ]);
    expect(() => assertProviderSmokeSuitePassed(results)).toThrow("Provider smoke suite failed for openai, stability, runway, google-ai.");
  });

  it("can run the suite from standard env files", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "assemblyline-provider-smoke-env-"));
    try {
      await writeFile(
        path.join(tempRoot, ".env.production.local"),
        [
          "OPENAI_API_KEY=sk-openai-live-abc123",
          "STABILITY_API_KEY=sk-stability-live-abc123",
          "RUNWAYML_API_SECRET=rw-prod-runway-smoke-abc123",
          "GEMINI_API_KEY=gemini-prod-veo-smoke-abc123",
          "",
        ].join("\n"),
      );
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
        .mockResolvedValueOnce(Response.json({ id: "task-runway-smoke", status: "PENDING" }))
        .mockResolvedValueOnce(Response.json({ id: "task-runway-smoke", status: "RUNNING", progress: 25 }))
        .mockResolvedValueOnce(Response.json({ name: "operations/veo-smoke" }))
        .mockResolvedValueOnce(Response.json({ done: false }));

      const env = await loadStandardEnvFiles(tempRoot, {});
      const results = await runProviderSmokeSuite({ env, fetchImpl: fetchMock });

      expect(results.map((result) => result.ok)).toEqual([true, true, true, true]);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
