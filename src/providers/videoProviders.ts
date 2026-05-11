import { createMockAdapter } from "@/providers/mockFactory";
import { assertMockProviderAllowed } from "@/providers/productionGuard";
import type { AsyncJobStatus, ComposedPrompt, VideoAdapter, VideoOptions, VideoResult } from "@/providers/types";

export class RunwayAdapter implements VideoAdapter {
  readonly slug = "runway";
  private readonly mock = createMockAdapter(this.slug);

  constructor(
    private readonly apiKey = process.env.RUNWAYML_API_SECRET ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult> {
    if (this.apiKey && this.apiKey !== "mock") {
      const response = await this.runwayRequest("https://api.dev.runwayml.com/v1/image_to_video", {
        model: normalizeRunwayModel(options.modelId),
        promptText: prompt.positivePrompt,
        ratio: toRunwayRatio(options.width, options.height),
        duration: normalizeRunwayDuration(options.durationSeconds),
      });
      return {
        providerJobId: String(response.id),
        isAsync: true,
      };
    }

    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  async checkJobStatus(providerJobId: string): Promise<AsyncJobStatus> {
    if (!this.apiKey || this.apiKey === "mock") {
      return this.mock.checkJobStatus?.(providerJobId) ?? { status: "complete", progress: 100 };
    }
    const response = await this.runwayRequest(`https://api.dev.runwayml.com/v1/tasks/${providerJobId}`);
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

  private async runwayRequest(url: string, body?: Record<string, unknown>) {
    const response = await this.fetchImpl(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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

export class KlingAdapter {
  readonly slug = "kling";
  private readonly mock = createMockAdapter(this.slug);

  async generateVideo(prompt: ComposedPrompt, options: VideoOptions) {
    assertMockProviderAllowed(this.slug);
    return this.mock.generateVideo(prompt, options);
  }

  checkJobStatus = this.mock.checkJobStatus;
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

function classifyRunwayStatus(status: number) {
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status === 400 || status === 401 || status === 403 || status === 404) return "fatal";
  if (status >= 500) return "retriable";
  return "fatal";
}
