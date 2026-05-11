import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import { isMockProviderApiKey, normalizeProviderApiKey } from "@/providers/providerKeySafety";
import type { AsyncJobStatus, ComposedPrompt, VideoAdapter, VideoOptions, VideoResult } from "@/providers/types";

export class RunwayAdapter implements VideoAdapter {
  readonly slug = "runway";
  private readonly mock = createMockAdapter(this.slug);

  constructor(
    private readonly apiKey = process.env.RUNWAYML_API_SECRET ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult> {
    const apiKey = normalizeProviderApiKey(this.apiKey);
    if (apiKey && !isMockProviderApiKey(apiKey)) {
      const response = await this.runwayRequest("https://api.dev.runwayml.com/v1/image_to_video", {
        model: normalizeRunwayModel(options.modelId),
        promptText: prompt.positivePrompt,
        ratio: toRunwayRatio(options.width, options.height),
        duration: normalizeRunwayDuration(options.durationSeconds),
      }, apiKey);
      return {
        providerJobId: requireRunwayTaskId(response),
        isAsync: true,
      };
    }

    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  async checkJobStatus(providerJobId: string): Promise<AsyncJobStatus> {
    const apiKey = normalizeProviderApiKey(this.apiKey);
    if (!apiKey || isMockProviderApiKey(apiKey)) {
      assertMockProviderAllowed(this.slug);
      return this.mock.checkJobStatus?.(providerJobId) ?? { status: "complete", progress: 100 };
    }
    const response = await this.runwayRequest(`https://api.dev.runwayml.com/v1/tasks/${providerJobId}`, undefined, apiKey);
    return mapRunwayTaskStatus(response);
  }

  getCapabilities() {
    return {
      models: ["gen4.5", "gen4_turbo"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: true,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }

  private async runwayRequest(url: string, body: Record<string, unknown> | undefined, apiKey: string) {
    const response = await this.fetchImpl(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const error = new Error(payload.error?.message ?? payload.message ?? `Runway request failed with status ${response.status}.`);
      Object.assign(error, { errorClass: classifyRunwayStatus(response.status), status: response.status });
      throw error;
    }
    return payload;
  }
}

export class GoogleVeoAdapter implements VideoAdapter {
  readonly slug = "google-ai";
  private readonly mock = createMockAdapter(this.slug);
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult> {
    const apiKey = normalizeProviderApiKey(this.apiKey);
    if (apiKey && !isMockProviderApiKey(apiKey)) {
      const response = await this.googleRequest(
        `${this.baseUrl}/models/${normalizeGoogleVeoModel(options.modelId)}:predictLongRunning`,
        {
          instances: [{ prompt: prompt.positivePrompt }],
          parameters: {
            aspectRatio: toGoogleVeoAspectRatio(options.width, options.height),
            durationSeconds: normalizeGoogleVeoDuration(options.durationSeconds),
          },
        },
        apiKey,
      );
      return {
        providerJobId: requireGoogleOperationName(response),
        isAsync: true,
      };
    }

    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  async checkJobStatus(providerJobId: string): Promise<AsyncJobStatus> {
    const apiKey = normalizeProviderApiKey(this.apiKey);
    if (!apiKey || isMockProviderApiKey(apiKey)) {
      assertMockProviderAllowed(this.slug);
      return this.mock.checkJobStatus?.(providerJobId) ?? { status: "complete", progress: 100 };
    }
    const operationName = providerJobId.replace(/^\/+/, "");
    const response = await this.googleRequest(`${this.baseUrl}/${operationName}`, undefined, apiKey);
    return mapGoogleVeoOperationStatus(response);
  }

  getCapabilities() {
    return {
      models: ["veo-3.1-generate-preview", "veo-3.0-generate-001", "veo-3.0-fast-generate-001"],
      supportsTextToVideo: true,
      supportsImageToVideo: false,
      supportsVideoExtension: false,
      requiresAsyncPolling: true,
      maxDurationSeconds: 8,
      aspectRatios: ["16:9", "9:16"],
    };
  }

  downloadHeaders(): Record<string, string> {
    const apiKey = normalizeProviderApiKey(this.apiKey);
    return apiKey && !isMockProviderApiKey(apiKey) ? { "x-goog-api-key": apiKey } : {};
  }

  private async googleRequest(url: string, body: Record<string, unknown> | undefined, apiKey: string) {
    const response = await this.fetchImpl(url, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const error = new Error(
        payload.error?.message ?? payload.message ?? `Google AI Veo request failed with status ${response.status}.`,
      );
      Object.assign(error, { errorClass: classifyGoogleVeoStatus(response.status), status: response.status });
      throw error;
    }
    return payload;
  }
}

export class KlingAdapter {
  readonly slug = "kling";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  async checkJobStatus(providerJobId: string): Promise<AsyncJobStatus> {
    assertMockProviderAllowed(this.slug);
    return this.mock.checkJobStatus?.(providerJobId) ?? { status: "complete", progress: 100 };
  }
  getCapabilities() {
    return {
      models: ["kling-1.6"],
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsVideoExtension: false,
      requiresAsyncPolling: true,
      maxDurationSeconds: 10,
      aspectRatios: ["16:9", "9:16", "1:1"],
    };
  }
}

function normalizeRunwayModel(modelId: string) {
  if (modelId === "runway-gen3-alpha") {
    return "gen4_turbo";
  }
  return modelId || "gen4.5";
}

function normalizeRunwayDuration(durationSeconds: number) {
  return Math.max(5, Math.min(durationSeconds || 5, 10));
}

function toRunwayRatio(width: number, height: number) {
  if (height > width) return "720:1280";
  if (width === height) return "960:960";
  return "1280:720";
}

function mapRunwayTaskStatus(task: Record<string, any>): AsyncJobStatus {
  const status = String(task.status ?? "").toUpperCase();
  if (status === "SUCCEEDED") {
    return { status: "complete", progress: 100, resultUrl: Array.isArray(task.output) ? task.output[0] : undefined };
  }
  if (status === "FAILED" || status === "CANCELED") {
    return { status: "failed", error: task.failure ?? task.failureCode ?? task.error ?? "Runway task failed." };
  }
  if (status === "RUNNING" || status === "PROCESSING") {
    return { status: "processing", progress: typeof task.progress === "number" ? task.progress : undefined };
  }
  return { status: "pending", progress: status === "THROTTLED" ? 0 : undefined };
}

function requireRunwayTaskId(response: Record<string, any>) {
  if (typeof response.id === "string" && response.id.trim()) {
    return response.id;
  }
  const error = new Error("Runway task submission succeeded without a task id.");
  Object.assign(error, { errorClass: "fatal", status: 502 });
  throw error;
}

function classifyRunwayStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 400 || status === 401 || status === 403 || status === 404) return "fatal";
  if (status >= 500) return "retriable";
  return "fatal";
}

function normalizeGoogleVeoModel(modelId: string) {
  return modelId || "veo-3.1-generate-preview";
}

function normalizeGoogleVeoDuration(durationSeconds: number) {
  const duration = Math.max(4, Math.min(durationSeconds || 8, 8));
  if (duration <= 4) return 4;
  if (duration <= 6) return 6;
  return 8;
}

function toGoogleVeoAspectRatio(width: number, height: number) {
  return height > width ? "9:16" : "16:9";
}

function requireGoogleOperationName(response: Record<string, any>) {
  if (typeof response.name === "string" && response.name.trim()) {
    return response.name;
  }
  const error = new Error("Google AI Veo submission succeeded without an operation name.");
  Object.assign(error, { errorClass: "fatal", status: 502 });
  throw error;
}

function mapGoogleVeoOperationStatus(operation: Record<string, any>): AsyncJobStatus {
  if (!operation.done) {
    return { status: "processing", progress: undefined };
  }
  if (operation.error) {
    return {
      status: "failed",
      error: operation.error.message ?? operation.error.status ?? "Google AI Veo operation failed.",
    };
  }
  const generatedSamples = operation.response?.generateVideoResponse?.generatedSamples;
  const resultUrl = Array.isArray(generatedSamples) ? generatedSamples[0]?.video?.uri : undefined;
  return resultUrl
    ? { status: "complete", progress: 100, resultUrl }
    : { status: "failed", error: "Google AI Veo operation completed without an output video URI." };
}

function classifyGoogleVeoStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 400 || status === 401 || status === 403 || status === 404) return "fatal";
  if (status >= 500) return "retriable";
  return "fatal";
}
