import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "@/providers/openai";
import { createMockAdapter } from "@/providers/mockFactory";
import { StabilityAdapter } from "@/providers/stability";

describe("provider adapters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("implements the OpenAI text and image adapter contracts in mock verification mode", async () => {
    const adapter = new OpenAIAdapter("mock");
    const text = await adapter.generateStructuredOutput("Break down this script.", {}, {
      modelId: "gpt-4o",
      responseFormat: "json",
    });
    const image = await adapter.generateImage(
      {
        positivePrompt: "Storyboard frame",
        negativePrompt: "blur",
        referenceImages: [],
        generationSettings: { width: 1024, height: 576 },
        metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
      },
      { modelId: "gpt-image-1", width: 1024, height: 576 },
    );

    expect(JSON.parse(text.content).provider).toBe("openai");
    expect(image.images[0].mimeType).toBe("image/png");
    expect(adapter.getCapabilities().supportsReferenceImages).toBe(true);
  });

  it("provides deterministic mock adapters that record calls and simulate errors", async () => {
    const adapter = createMockAdapter("mock", { errorOnCall: 2, errorClass: "rate_limit" });
    await adapter.analyzeScript("INT. ROOM - DAY", { modelId: "mock-model" });
    await expect(adapter.generateStructuredOutput("{}", {}, { modelId: "mock-model" })).rejects.toMatchObject({
      errorClass: "rate_limit",
    });
    expect(adapter.calls.map((call) => call.method)).toEqual(["analyzeScript", "generateStructuredOutput"]);
  });

  it("calls the OpenAI Responses API for live structured output", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        model: "gpt-4.1-mini",
        input: "Return JSON",
        text: {
          format: {
            type: "json_schema",
            name: "assemblyline_structured_output",
          },
        },
      });
      expect(init.headers).toMatchObject({ Authorization: "Bearer sk-live" });
      return Response.json({
        id: "resp_123",
        model: "gpt-4.1-mini",
        output_text: "{\"ok\":true}",
        usage: { input_tokens: 3, output_tokens: 5 },
      });
    }) as unknown as typeof fetch;
    const adapter = new OpenAIAdapter("sk-live", fetchMock);

    const result = await adapter.generateStructuredOutput(
      "Return JSON",
      { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
      { modelId: "gpt-4.1-mini", responseFormat: "json" },
    );

    expect(result.content).toBe("{\"ok\":true}");
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 5 });
    expect(result.providerJobId).toBe("resp_123");
  });

  it("rejects malformed successful OpenAI text responses without output text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "resp_empty", model: "gpt-4.1-mini", output: [] }));
    const adapter = new OpenAIAdapter("sk-live", fetchMock);

    await expect(adapter.generateStructuredOutput("Return JSON", { type: "object" }, { modelId: "gpt-4.1-mini" })).rejects.toMatchObject({
      message: "OpenAI response did not include output text.",
      errorClass: "fatal",
      status: 502,
    });
  });

  it("calls the OpenAI image generation API and maps provider failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          model: "gpt-image-1",
          data: [{ b64_json: Buffer.from("image-bytes").toString("base64") }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: { message: "rate limited" } }, { status: 429 })) as unknown as typeof fetch;
    const adapter = new OpenAIAdapter("sk-live", fetchMock);
    const prompt = {
      positivePrompt: "Production storyboard frame",
      negativePrompt: "blur",
      referenceImages: [],
      generationSettings: { width: 1536, height: 1024 },
      metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
    };

    const image = await adapter.generateImage(prompt, { modelId: "gpt-image-1", width: 1536, height: 1024, qualityMode: "high" });

    expect(image.images[0].data.toString()).toBe("image-bytes");
    await expect(adapter.generateImage(prompt, { modelId: "gpt-image-1", width: 1536, height: 1024 })).rejects.toMatchObject({
      errorClass: "rate_limit",
      status: 429,
    });
  });

  it("rejects malformed successful OpenAI image responses without usable image data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ model: "gpt-image-1", data: [] }));
    const adapter = new OpenAIAdapter("sk-live", fetchMock);
    const prompt = {
      positivePrompt: "Production storyboard frame",
      negativePrompt: "blur",
      referenceImages: [],
      generationSettings: { width: 1536, height: 1024 },
      metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
    };

    await expect(adapter.generateImage(prompt, { modelId: "gpt-image-1", width: 1536, height: 1024 })).rejects.toMatchObject({
      message: "OpenAI image response did not include usable image data.",
      errorClass: "fatal",
      status: 502,
    });
  });

  it("rejects direct OpenAI mock adapter usage in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const adapter = new OpenAIAdapter("mock");

    await expect(adapter.generateStructuredOutput("{}", {}, { modelId: "gpt-4o" })).rejects.toMatchObject({
      code: "provider_not_configured",
    });
    await expect(
      adapter.generateImage(
        {
          positivePrompt: "Storyboard frame",
          negativePrompt: "",
          referenceImages: [],
          generationSettings: { width: 1024, height: 576 },
          metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
        },
        { modelId: "gpt-image-1", width: 1024, height: 576 },
      ),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
  });

  it("provides a second image adapter for Asset Bible generation variety", async () => {
    const adapter = new StabilityAdapter();
    const image = await adapter.generateImage(
      {
        positivePrompt: "Character reference sheet",
        negativePrompt: "off model",
        referenceImages: [],
        generationSettings: { width: 1024, height: 1024 },
        metadata: { sourceIds: [], conflictWarnings: [], truncationWarnings: [] },
      },
      { modelId: "stable-image-core", width: 1024, height: 1024 },
    );

    expect(adapter.slug).toBe("stability");
    expect(adapter.getCapabilities().supportsSeeds).toBe(true);
    expect(image.images[0].mimeType).toBe("image/png");
  });
});
