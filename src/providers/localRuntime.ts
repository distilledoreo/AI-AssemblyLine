import type {
  AsyncJobStatus,
  ComposedPrompt,
  ImageAdapter,
  ImageOptions,
  ImageResult,
  TextAdapter,
  TextOptions,
  TextResult,
  VideoAdapter,
  VideoOptions,
  VideoResult,
} from "@/providers/types";

const DEFAULT_LOCAL_RUNTIME_URL = "http://127.0.0.1:7861";

type LocalRuntimeImageResponse = {
  images?: Array<{ b64: string; mimeType?: string }>;
  modelId?: string;
};

type LocalRuntimeVideoResponse = {
  dataB64?: string;
  mimeType?: string;
  jobId?: string;
  isAsync?: boolean;
};

export class LocalQwenTextAdapter implements TextAdapter {
  readonly slug = "local-qwen-text";

  constructor(
    private readonly baseUrl = process.env.LOCAL_RUNTIME_URL ?? DEFAULT_LOCAL_RUNTIME_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyzeScript(prompt: string, options: TextOptions): Promise<TextResult> {
    return this.generateStructuredOutput(prompt, { type: "object" }, options);
  }

  async generateStructuredOutput(prompt: string, schema: unknown, options: TextOptions): Promise<TextResult> {
    const response = await this.localRequest("/v1/text", {
      prompt,
      schema,
      modelId: options.modelId || "qwen3.6-27b",
      responseFormat: options.responseFormat ?? "json",
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content ?? {});
    return {
      content,
      usage: {
        inputTokens: Number(response.usage?.inputTokens ?? estimateTokens(prompt)),
        outputTokens: Number(response.usage?.outputTokens ?? estimateTokens(content)),
      },
      modelId: String(response.modelId ?? options.modelId ?? "qwen3.6-27b"),
      providerJobId: typeof response.id === "string" ? response.id : undefined,
    };
  }

  getCapabilities() {
    return {
      models: ["qwen3.6-27b"],
      structuredOutput: true,
      maxPromptLength: 64000,
    };
  }

  private async localRequest(path: string, body: Record<string, unknown>) {
    return postJson(this.fetchImpl, this.baseUrl, path, body);
  }
}

export class LocalQwenImageAdapter implements ImageAdapter {
  readonly slug = "local-qwen-image";

  constructor(
    private readonly baseUrl = process.env.LOCAL_RUNTIME_URL ?? DEFAULT_LOCAL_RUNTIME_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult> {
    const response = (await postJson(this.fetchImpl, this.baseUrl, "/v1/image", {
      prompt: prompt.positivePrompt,
      negativePrompt: prompt.negativePrompt,
      modelId: options.modelId || "qwen-image-2512",
      width: options.width,
      height: options.height,
      count: options.count ?? 1,
      seed: options.seed,
      qualityMode: options.qualityMode,
      referenceImages: options.referenceImages ?? prompt.referenceImages,
    })) as LocalRuntimeImageResponse;
    const images = (response.images ?? []).map((image) => ({
      data: Buffer.from(image.b64, "base64"),
      mimeType: image.mimeType ?? "image/png",
    }));
    if (images.length === 0 || images.some((image) => image.data.length === 0)) {
      const error = new Error("Local image runtime did not return usable image data.");
      Object.assign(error, { errorClass: "fatal", status: 502 });
      throw error;
    }
    return {
      images,
      usage: { units: images.length },
      modelId: response.modelId ?? options.modelId ?? "qwen-image-2512",
      isAsync: false,
    };
  }

  getCapabilities() {
    return {
      models: ["qwen-image-2512"],
      supportsTextToImage: true,
      supportsImageEditing: false,
      supportsReferenceImages: true,
      supportsSeeds: true,
      maxImageCount: 2,
      aspectRatios: ["1:1", "16:9", "9:16"],
    };
  }
}

export class LocalLtxVideoAdapter implements VideoAdapter {
  readonly slug = "local-ltx-video";

  constructor(
    private readonly baseUrl = process.env.LOCAL_RUNTIME_URL ?? DEFAULT_LOCAL_RUNTIME_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult> {
    const response = (await postJson(this.fetchImpl, this.baseUrl, "/v1/video", {
      prompt: prompt.positivePrompt,
      negativePrompt: prompt.negativePrompt,
      modelId: options.modelId || "ltx-2.3",
      width: options.width,
      height: options.height,
      durationSeconds: options.durationSeconds,
      seed: options.seed,
      startImageB64: options.startImage?.toString("base64"),
      endImageB64: options.endImage?.toString("base64"),
    })) as LocalRuntimeVideoResponse;
    if (response.isAsync && response.jobId) {
      const status = await this.checkJobStatus(response.jobId);
      if (status.status === "complete" && status.resultUrl) {
        const output = await this.fetchImpl(new URL(status.resultUrl, this.baseUrl), { signal: AbortSignal.timeout(120000) });
        const data = Buffer.from(await output.arrayBuffer());
        if (output.ok && data.length > 0) {
          return { video: { data, mimeType: output.headers.get("content-type")?.split(";")[0] ?? "video/mp4" }, isAsync: false };
        }
      }
      return { providerJobId: response.jobId, isAsync: true };
    }
    if (!response.dataB64) {
      const error = new Error("Local video runtime did not return video bytes or a job id.");
      Object.assign(error, { errorClass: "fatal", status: 502 });
      throw error;
    }
    return {
      video: { data: Buffer.from(response.dataB64, "base64"), mimeType: response.mimeType ?? "video/mp4" },
      isAsync: false,
    };
  }

  async checkJobStatus(providerJobId: string): Promise<AsyncJobStatus> {
    const status = await getJson(this.fetchImpl, this.baseUrl, `/v1/video/${encodeURIComponent(providerJobId)}`);
    if (status.status === "complete") {
      return {
        status: "complete",
        progress: 100,
        resultUrl: typeof status.resultUrl === "string" ? status.resultUrl : `/v1/video/${providerJobId}/result`,
      };
    }
    return {
      status: status.status === "failed" ? "failed" : status.status === "pending" ? "pending" : "processing",
      progress: typeof status.progress === "number" ? status.progress : undefined,
      resultUrl: typeof status.resultUrl === "string" ? status.resultUrl : undefined,
      error: typeof status.error === "string" ? status.error : undefined,
    };
  }

  getCapabilities() {
    return {
      models: ["ltx-2.3"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: false,
      requiresAsyncPolling: false,
      maxDurationSeconds: 5,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}

async function postJson(fetchImpl: typeof fetch, baseUrl: string, path: string, body: Record<string, unknown>) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    const error = new Error(payload.error ?? payload.message ?? `Local runtime request failed with status ${response.status}.`);
    Object.assign(error, { errorClass: classifyLocalStatus(response.status), status: response.status });
    throw error;
  }
  return payload;
}

async function getJson(fetchImpl: typeof fetch, baseUrl: string, path: string) {
  const response = await fetchImpl(new URL(path, baseUrl), { signal: AbortSignal.timeout(120000) });
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    const error = new Error(payload.error ?? payload.message ?? `Local runtime request failed with status ${response.status}.`);
    Object.assign(error, { errorClass: classifyLocalStatus(response.status), status: response.status });
    throw error;
  }
  return payload;
}

function classifyLocalStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "retriable";
  return "fatal";
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}
