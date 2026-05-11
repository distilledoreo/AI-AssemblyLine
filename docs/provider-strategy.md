# Provider and Model Strategy

AI AssemblyLine uses provider adapters so models and APIs can change without rewriting the production workflow. For async provider integration (polling, webhooks), see [job-queue-design.md](job-queue-design.md). For prompt composition and provider translation, see [prompt-engine.md](prompt-engine.md).

## Provider principles

- Users bring their own API keys.
- Model selectors are transparent and visible in the UI.
- The app should not hide model routing behind opaque automation.
- Provider capabilities should be stored and displayed so users understand tradeoffs.
- Provider-specific prompts and settings should be generated from a common internal production plan.

## Initial provider targets

The architecture should support adapters for:

- OpenAI
- ByteDance/Seedance
- Runway
- Pika
- Kling
- Luma
- ElevenLabs
- Stability
- Replicate

## Adapter categories

### Text and reasoning

Used for script analysis, scene breakdown, asset detection, shot planning, prompt generation, continuity checks, review summaries, and metadata repair.

### Image generation and editing

Used for asset reference sheets, style exploration, storyboard frames, variations, and image edits based on markup or prompt changes.

### Video generation and editing

Used for text-to-video, image-to-video, storyboard-to-video, clip extension, and video edits when supported by a provider.

### Audio and voice

Not required for MVP lip sync, but the provider layer should allow future voice, music, sound effects, and dialogue timing integrations.

## Adapter interface contracts

Every adapter implements a category-specific interface. The interfaces below are in pseudocode TypeScript.

### Text adapter

```typescript
interface TextAdapter {
  slug: string;
  analyzeScript(prompt: string, options: TextOptions): Promise<TextResult>;
  generateStructuredOutput(prompt: string, schema: JSONSchema, options: TextOptions): Promise<TextResult>;
  getCapabilities(): TextCapabilities;
}

interface TextOptions {
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
}

interface TextResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  modelId: string;
  providerJobId?: string;
}
```

### Image adapter

```typescript
interface ImageAdapter {
  slug: string;
  generateImage(prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult>;
  editImage?(baseImage: Buffer, prompt: ComposedPrompt, options: ImageOptions): Promise<ImageResult>;
  getCapabilities(): ImageCapabilities;
}

interface ImageOptions {
  modelId: string;
  width: number;
  height: number;
  count?: number;
  seed?: number;
  qualityMode?: string;
  referenceImages?: ReferenceAttachment[];
}

interface ImageResult {
  images: { data: Buffer; mimeType: string }[];
  usage?: { units: number };
  modelId: string;
  providerJobId?: string;
  isAsync: boolean;
}
```

### Video adapter

```typescript
interface VideoAdapter {
  slug: string;
  generateVideo(prompt: ComposedPrompt, options: VideoOptions): Promise<VideoResult>;
  checkJobStatus?(providerJobId: string): Promise<AsyncJobStatus>;
  getCapabilities(): VideoCapabilities;
}

interface VideoOptions {
  modelId: string;
  width: number;
  height: number;
  durationSeconds: number;
  seed?: number;
  startImage?: Buffer;
  endImage?: Buffer;
}

interface VideoResult {
  video?: { data: Buffer; mimeType: string };
  providerJobId?: string;
  isAsync: boolean;
}

interface AsyncJobStatus {
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress?: number;
  resultUrl?: string;
  error?: string;
}
```

All adapters must handle provider-specific authentication internally using the decrypted API key passed at construction time. Adapters must never store or log API keys.

## Capability matrix fields

Each provider/model entry should track:

- provider name
- model ID
- media type
- supports text-to-image
- supports image editing
- supports reference images
- supports character consistency
- supports text-to-video
- supports image-to-video
- supports video extension
- supports seeds
- supports transparent background
- supports 1080p or higher
- maximum image count
- maximum video duration
- maximum prompt length (tokens or characters)
- aspect ratios
- average latency
- requires asynchronous polling
- supports webhooks
- rate limit (requests per minute)
- safety restrictions
- cost notes entered by the user or admin

### Capability matrix maintenance

The capability matrix is **hard-coded per adapter** as a default and **user-editable per workspace**. This hybrid approach handles the reality that providers change models frequently:

- Each adapter ships with a built-in capability snapshot for its supported models.
- Workspace admins can override fields (e.g. adding a new model ID, adjusting rate limits) through the provider settings UI.
- When the app updates, new adapter versions may include updated default capabilities. User overrides are preserved and take precedence.

## API key handling

Users should add provider API keys through workspace settings. Keys are encrypted at rest using AES-256-GCM. See [deployment-and-config.md](deployment-and-config.md) for the encryption scheme, key rotation, and security rules.

Keys are never exposed in generation logs, prompts, exports, or client-side code.

## OpenAI live mode

The OpenAI adapter has two modes:

- `mock` key: deterministic local responses for development and automated tests.
- real API key: live calls to OpenAI.

Live structured text output is sent to `POST /v1/responses` with `text.format` when JSON output is requested. Live image output is sent to `POST /v1/images/generations` and expects base64 image data for GPT Image models. Provider HTTP failures are mapped into the common retry classes: `rate_limit`, `timeout`, `retriable`, and `fatal`.

Run `npm run smoke:openai` with `OPENAI_API_KEY` set to verify live OpenAI connectivity before a production release. The smoke command uses a small structured-output Responses API request with `gpt-4.1-mini` by default; set `OPENAI_SMOKE_MODEL` to test a different approved model.

Runtime generation paths resolve OpenAI credentials from the project workspace's encrypted provider key first. If no workspace key is configured, they fall back to `OPENAI_API_KEY`. If neither is present, local development and tests use the mock OpenAI adapter response; production generation fails with a provider-key configuration error instead of silently producing mock outputs. The literal `mock` key is also rejected in production.

The OpenAI adapter itself also blocks direct mock-mode usage when `NODE_ENV=production`, so production safety does not depend on all callers using the project credential resolver.

Script analysis uses the OpenAI text adapter for its scene, shot, and asset passes whenever real credentials are resolved. The deterministic parser remains only for local development and tests that run without provider credentials.

Mock-backed placeholder adapters for providers that do not yet have live HTTP clients, including Stability, Runway, Kling, Seedance, Pika, Luma, and ElevenLabs, are development/test-only. In production, attempting generation through one of these placeholder adapters fails with `provider_not_configured` until a real provider client and credentials are configured.

## Model selector behavior

For every generation job, users should be able to see and choose:

- provider
- model
- quality mode
- resolution
- duration
- aspect ratio
- reference inputs
- seed or reproducibility setting when supported
- provider-specific options

The app may recommend models, but final selection should remain transparent and user-controlled.

## Error classification

Provider errors are classified into categories that determine retry behavior (see [job-queue-design.md](job-queue-design.md) for retry policy):

| Error class | Examples | User message |
|------------|----------|--------------|
| `retriable` | Network timeout, 500/502/503 from provider, connection reset | "Generation failed due to a temporary error. Retrying automatically." |
| `rate_limit` | HTTP 429, provider-specific rate limit response | "Provider rate limit reached. The job will retry after a delay." |
| `content_policy` | Provider rejects the prompt for safety reasons | "The provider rejected this generation due to content policy. Review your prompt and asset descriptions, then try again." |
| `timeout` | Async job exceeded max poll duration | "The provider did not complete this job within the expected time. You can retry or try a different provider." |
| `fatal` | Invalid API key (401/403), malformed request (400), unsupported operation | "Generation failed: [specific reason]. Check your provider settings." |

Adapters are responsible for mapping provider-specific HTTP status codes and error responses to the correct error class.
