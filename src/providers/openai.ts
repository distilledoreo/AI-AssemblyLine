import type {
  ComposedPrompt,
  ImageAdapter,
  ImageCapabilities,
  ImageOptions,
  ImageResult,
  TextAdapter,
  TextCapabilities,
  TextOptions,
  TextResult,
} from "@/providers/types";

const oneByOnePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export class OpenAIAdapter implements TextAdapter, ImageAdapter {
  readonly slug = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyzeScript(prompt: string, options: TextOptions): Promise<TextResult> {
    return this.generateStructuredOutput(prompt, { type: "object" }, options);
  }

  async generateStructuredOutput(prompt: string, schema: unknown, options: TextOptions): Promise<TextResult> {
    if (!this.apiKey || this.apiKey === "mock") {
      return {
        content: JSON.stringify({
          provider: this.slug,
          modelId: options.modelId,
          promptPreview: prompt.slice(0, 120),
        }),
        usage: {
          inputTokens: estimateTokens(prompt),
          outputTokens: 40,
        },
        modelId: options.modelId,
      };
    }

    const body: Record<string, unknown> = {
      model: options.modelId,
      input: prompt,
    };
    if (options.maxTokens) body.max_output_tokens = options.maxTokens;
    if (typeof options.temperature === "number") body.temperature = options.temperature;
    if (schema && options.responseFormat === "json") {
      body.text = {
        format: {
          type: "json_schema",
          name: "assemblyline_structured_output",
          schema,
          strict: false,
        },
      };
    } else if (options.responseFormat === "json") {
      body.text = { format: { type: "json_object" } };
    }

    const response = await this.openAiRequest("https://api.openai.com/v1/responses", body);
    return {
      content: extractResponseText(response),
      usage: {
        inputTokens: Number(response.usage?.input_tokens ?? 0),
        outputTokens: Number(response.usage?.output_tokens ?? 0),
      },
      modelId: String(response.model ?? options.modelId),
      providerJobId: typeof response.id === "string" ? response.id : undefined,
    };
  }

  async generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult> {
    if (this.apiKey && this.apiKey !== "mock") {
      const response = await this.openAiRequest("https://api.openai.com/v1/images/generations", {
        model: options.modelId,
        prompt: prompt.positivePrompt,
        size: toOpenAiImageSize(options.width, options.height),
        n: options.count ?? 1,
        quality: normalizeImageQuality(options.qualityMode),
      });
      const images = (response.data ?? []).map((item: { b64_json?: string; mime_type?: string }) => {
        if (!item.b64_json) {
          const error = new Error("OpenAI image response did not include base64 image data.");
          Object.assign(error, { errorClass: "fatal" });
          throw error;
        }
        return { data: Buffer.from(item.b64_json, "base64"), mimeType: item.mime_type ?? "image/png" };
      });
      return {
        images,
        usage: { units: images.length },
        modelId: String(response.model ?? options.modelId),
        isAsync: false,
      };
    }

    return {
      images: Array.from({ length: options.count ?? 1 }, () => ({
        data: oneByOnePng,
        mimeType: "image/png",
      })),
      usage: { units: 1 },
      modelId: options.modelId,
      isAsync: false,
      providerJobId: `mock-openai-${hashPrompt(prompt.positivePrompt)}`,
    };
  }

  getCapabilities(): TextCapabilities & ImageCapabilities {
    return {
      models: ["gpt-4o", "gpt-4o-mini", "gpt-image-1"],
      structuredOutput: true,
      maxPromptLength: 128000,
      supportsTextToImage: true,
      supportsImageEditing: true,
      supportsReferenceImages: true,
      supportsSeeds: false,
      maxImageCount: 4,
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:2"],
    };
  }

  private async openAiRequest(url: string, body: Record<string, unknown>) {
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const error = new Error(payload.error?.message ?? `OpenAI request failed with status ${response.status}.`);
      Object.assign(error, { errorClass: classifyOpenAiStatus(response.status), status: response.status });
      throw error;
    }
    return payload;
  }
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function hashPrompt(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function extractResponseText(response: any) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  const text = response.output
    ?.flatMap((item: any) => item.content ?? [])
    .map((content: any) => content.text)
    .filter(Boolean)
    .join("");
  if (text) {
    return text;
  }
  return JSON.stringify(response);
}

function classifyOpenAiStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 401 || status === 403 || status === 400 || status === 404) return "fatal";
  if (status >= 500) return "retriable";
  return "fatal";
}

function toOpenAiImageSize(width: number, height: number) {
  if (width > height) return "1536x1024";
  if (height > width) return "1024x1536";
  return "1024x1024";
}

function normalizeImageQuality(value: string | undefined) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "auto";
}
