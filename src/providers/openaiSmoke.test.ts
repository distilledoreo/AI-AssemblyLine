import { describe, expect, it, vi } from "vitest";
import { runOpenAiSmoke } from "@/providers/openaiSmoke";

describe("OpenAI smoke helper", () => {
  it("requires a real API key", async () => {
    await expect(runOpenAiSmoke({ apiKey: "mock" })).rejects.toThrow(/OPENAI_API_KEY/);
    await expect(runOpenAiSmoke({ apiKey: "" })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("performs a low-token Responses API smoke call", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "resp_smoke",
        model: "gpt-4.1-mini",
        output_text: "{\"ok\":true,\"provider\":\"openai\"}",
        usage: { input_tokens: 18, output_tokens: 8 },
      }),
    ) as unknown as typeof fetch;

    const result = await runOpenAiSmoke({
      apiKey: "sk-live-test",
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      providerJobId: "resp_smoke",
      usage: { inputTokens: 18, outputTokens: 8 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-live-test" }),
      }),
    );
  });
});
