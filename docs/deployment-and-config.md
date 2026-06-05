# Deployment and Configuration

This document covers environment configuration, secrets management, API key encryption, and local development setup for AI AssemblyLine.

## Environment variables

All configuration is driven by environment variables loaded from `.env` files (via `dotenv`) or the host environment. The app uses a validated config module that fails fast on startup if required variables are missing.

### Required variables

| Variable          | Description                                                    | Example                                              |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection string                                     | `postgresql://user:pass@localhost:5432/assemblyline` |
| `REDIS_URL`       | Redis connection string                                        | `redis://localhost:6379`                             |
| `NEXTAUTH_URL`    | Canonical app origin, without a path/query/fragment            | `http://localhost:3000`                              |
| `NEXTAUTH_SECRET` | NextAuth session signing secret (32+ chars)                    | Generated via `openssl rand -base64 32`              |
| `ENCRYPTION_KEY`  | AES-256 key for provider API key encryption (32 bytes, base64) | Generated via `openssl rand -base64 32`              |
| `STORAGE_ROOT`    | Root directory for local media storage                         | `./storage`                                          |

### Optional variables

| Variable                               | Description                                                                                                                                                                      | Default                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `PORT`                                 | App port                                                                                                                                                                         | `3000`                                      |
| `QUEUE_MODE`                           | Queue execution mode. Use `inline` for no-worker local development or `redis` for BullMQ-backed async jobs. Production rejects `inline` and defaults to Redis mode when unset.   | Production: Redis; local example: `inline`  |
| `REPOSITORY_MODE`                      | Repository backend override. Use `memory` only for local development or `prisma` for production-like persistence. Production rejects `memory` and defaults to Prisma when unset. | Production: Prisma; local example: `memory` |
| `ANALYSIS_QUEUE_CONCURRENCY`           | Workers for script analysis queue                                                                                                                                                | `2`                                         |
| `IMAGE_QUEUE_CONCURRENCY`              | Workers for image generation queue                                                                                                                                               | `3`                                         |
| `VIDEO_QUEUE_CONCURRENCY`              | Workers for video generation queue                                                                                                                                               | `2`                                         |
| `MEDIA_QUEUE_CONCURRENCY`              | Workers for FFmpeg media queue                                                                                                                                                   | `4`                                         |
| `FFMPEG_PATH`                          | Optional absolute path to an operator-managed FFmpeg binary. When unset, the app uses the bundled `ffmpeg-static` binary, then PATH fallback if no bundled binary is available. | Bundled binary                              |
| `FFPROBE_PATH`                         | Optional absolute path to an operator-managed ffprobe binary. When unset, the app uses the bundled `ffprobe-static` binary, then PATH fallback if no bundled binary is available. | Bundled binary                              |
| `PROJECT_QUEUE_CONCURRENCY`            | Workers for export/import queue                                                                                                                                                  | `1`                                         |
| `QUEUE_RATE_LIMIT_MAX`                 | Optional global BullMQ worker limiter maximum jobs per duration window                                                                                                           | None                                        |
| `QUEUE_RATE_LIMIT_DURATION_MS`         | Optional global BullMQ worker limiter duration window in milliseconds                                                                                                            | None                                        |
| `<QUEUE>_QUEUE_RATE_LIMIT_MAX`         | Optional per-queue override for `ANALYSIS`, `IMAGE`, `VIDEO`, `MEDIA`, or `PROJECT` queue limiter maximum jobs                                                                   | None                                        |
| `<QUEUE>_QUEUE_RATE_LIMIT_DURATION_MS` | Optional per-queue override for `ANALYSIS`, `IMAGE`, `VIDEO`, `MEDIA`, or `PROJECT` queue limiter duration in milliseconds                                                       | None                                        |
| `MAX_UPLOAD_SIZE_MB`                   | Maximum file upload size                                                                                                                                                         | `100`                                       |
| `SESSION_MAX_AGE_DAYS`                 | Session expiry                                                                                                                                                                   | `30`                                        |
| `LOG_LEVEL`                            | Logging verbosity                                                                                                                                                                | `info`                                      |
| `SENTRY_DSN`                           | Sentry error tracking DSN                                                                                                                                                        | None (disabled)                             |
| `OPENAI_API_KEY`                       | Optional server fallback OpenAI Platform key when a workspace OpenAI key is not saved. Required by `preflight:production` for live smoke verification.                           | None                                        |
| `OPENAI_SMOKE_MODEL`                   | Optional model override for `npm run smoke:openai`.                                                                                                                              | `gpt-4.1-mini`                              |
| `STABILITY_API_KEY`                    | Optional server fallback Stability AI key when a workspace Stability key is not saved. Enables live Stable Image Core/Ultra image generation and `npm run smoke:stability`.      | None                                        |
| `STABILITY_SMOKE_MODEL`                | Optional model override for `npm run smoke:stability`.                                                                                                                           | `stable-image-core`                         |
| `RUNWAYML_API_SECRET`                  | Optional server fallback Runway key when a workspace Runway key is not saved. Enables live Runway video task submission.                                                         | None                                        |
| `RUNWAY_SMOKE_MODEL`                   | Optional model override for `npm run smoke:runway`.                                                                                                                              | `gen4.5`                                    |
| `GEMINI_API_KEY`                       | Optional server fallback Google AI key when a workspace Google AI key is not saved. Enables live Gemini API / Veo video operation submission.                                   | None                                        |
| `GOOGLE_AI_API_KEY`                    | Alternate fallback variable accepted when `GEMINI_API_KEY` is not set.                                                                                                           | None                                        |
| `GOOGLE_VEO_SMOKE_MODEL`               | Optional model override for `npm run smoke:google-veo`.                                                                                                                          | `veo-3.1-generate-preview`                  |

### OAuth sign-in variables

Google and GitHub sign-in are optional. Configure both a client ID and client secret to show the provider on `/signin`.

| Provider | Client ID variables                               | Client secret variables                                       |
| -------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Google   | `AUTH_GOOGLE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_ID` | `AUTH_GOOGLE_SECRET`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SECRET` |
| GitHub   | `AUTH_GITHUB_ID`, `GITHUB_CLIENT_ID`, `GITHUB_ID` | `AUTH_GITHUB_SECRET`, `GITHUB_CLIENT_SECRET`, `GITHUB_SECRET` |

## API key encryption

Provider API keys entered by users are encrypted before storage and decrypted only server-side when making provider API calls. The key UI and API currently accept live credentials for OpenAI, Stability, Runway, and Google AI only; development-only placeholder adapters do not accept saved production keys until a live client is implemented for that provider.

### Encryption scheme

- **Algorithm:** AES-256-GCM (authenticated encryption).
- **Key:** The `ENCRYPTION_KEY` environment variable (32 bytes, base64-encoded).
- **Nonce:** A unique 12-byte random nonce generated per key, stored alongside the ciphertext in the `ProviderKey` table (`keyNonce` column).
- **Auth tag:** 16 bytes, appended to the ciphertext.

### Key rotation

If `ENCRYPTION_KEY` needs to be rotated:

1. Set `ENCRYPTION_KEY_OLD` to the current key.
2. Set `ENCRYPTION_KEY` to the new key.
3. Run `npm run rotate-keys`, which re-encrypts all `ProviderKey` records in Postgres with the new key.
4. Remove `ENCRYPTION_KEY_OLD` after successful rotation.

The rotation command loads `.env`, `.env.production`, `.env.local`, and `.env.production.local` with shell variables taking priority. It requires both keys to decode to exactly 32 bytes and fails if the old and new key values are identical. Run it from a trusted operator shell; it prints only record counts and never prints decrypted provider keys.

### Prisma repository smoke

Run `npm run smoke:prisma-repository` after migrations when validating a production-like Postgres environment. The command forces `REPOSITORY_MODE=prisma`, uses the configured queue mode, creates real repository records for sign-in, workspace/project setup, encrypted provider keys, generation jobs, and project events, verifies the data through repository reads, and deletes the smoke records afterward. It requires `DATABASE_URL`, `ENCRYPTION_KEY`, and `STORAGE_ROOT`; production-mode runs also require Redis because production queue mode must be Redis-backed. It does not call any external provider API.

### Security rules

- Provider API keys are **never** included in: API responses to the client, generation logs, prompt metadata, export bundles, error messages, or browser-accessible storage.
- The decrypted key exists only in memory for the duration of a provider API call.
- The `ProviderKey` table is excluded from all export queries.
- Replacing a saved workspace provider key is an atomic database transaction, so a failed replacement does not delete the previously working credential.
- Runtime generation falls back to server environment keys only when no workspace provider key is saved. Workspace provider-key database, lookup, or decryption failures are surfaced as runtime errors instead of silently using fallback credentials.

## Local development setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- FFmpeg 6+ if you want to use host-managed media binaries. The app includes bundled `ffmpeg-static` and `ffprobe-static` binaries by default; set `FFMPEG_PATH` and `FFPROBE_PATH` to override them.
- pnpm (recommended) or npm

### Quick start

```bash
# Clone and install
git clone <repo-url>
cd ai-assemblyline
pnpm install

# Start local Postgres and Redis if you use Docker
pnpm services:up

# Set up environment
cp .env.example .env
# Edit .env with your database URL, Redis URL, and generate secrets

# Set up database
pnpm prisma migrate dev
pnpm prisma db seed    # optional: seed with sample project

# Start development
pnpm dev               # starts Next.js + workers in watch mode
```

If `pnpm` is not installed, use the equivalent npm commands:

```bash
npm install
npm run services:up
npm run prisma:generate
npm run dev
```

The checked-in `compose.yaml` starts PostgreSQL 16 on `localhost:5432` and Redis 7 on `localhost:6379`, matching `.env.example`. Stop those services with `npm run services:down`; inspect logs with `npm run services:logs`.

Run `NODE_ENV=production npm run preflight:production` before release. The preflight command loads `.env`, `.env.production`, `.env.local`, and `.env.production.local` from the project root, with already-exported shell variables taking priority, so operators can keep production release values in an ignored env file and override individual values in the shell. The preflight checks production runtime mode, required production environment variables, `NEXTAUTH_URL` format (origin only, HTTPS outside localhost), `NEXTAUTH_SECRET` length and non-development value, decoded `ENCRYPTION_KEY` length and non-development value, production queue mode (`QUEUE_MODE` unset or `redis`), production repository mode (`REPOSITORY_MODE` unset or `prisma`), dependency audit status, Prisma schema validity, Prisma migration-file presence, writable `STORAGE_ROOT`, live-shaped non-placeholder `OPENAI_API_KEY`, `STABILITY_API_KEY`, `RUNWAYML_API_SECRET`, and `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` values for live provider verification, optional Google/GitHub OAuth client/secret pair consistency, FFmpeg/ffprobe availability via `FFMPEG_PATH`/`FFPROBE_PATH`, bundled static binaries, or PATH fallback, Postgres/Redis URL schemes, and TCP reachability for the configured Postgres and Redis URLs. Use `npm run security:audit` to run the dependency audit by itself, `npm run prisma:validate` to run the Prisma schema gate by itself, and `npm run prisma:migrate:deploy` to apply checked-in migrations to a production database.

Run `npm run smoke:providers` with real provider keys before enabling providers in production. Like the production preflight, provider smoke commands load `.env`, `.env.production`, `.env.local`, and `.env.production.local` while preserving exported shell overrides. The combined command runs the OpenAI, Stability, Runway, and Google AI / Veo smoke checks in one release gate and prints only non-secret result metadata. You can also run `npm run smoke:openai`, `npm run smoke:stability`, `npm run smoke:runway`, or `npm run smoke:google-veo` individually while debugging a provider. These commands make small live API calls. The Runway and Google AI smoke commands submit short async video tasks, immediately read the provider task or operation status endpoint, and print the returned non-secret ids/statuses; they do not wait for final video output.

The repository also includes a manual GitHub Actions workflow named **Live Provider Smoke**. Configure `OPENAI_API_KEY`, `STABILITY_API_KEY`, `RUNWAYML_API_SECRET`, and either `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` as GitHub Actions secrets, then run that workflow from the Actions tab or with `gh workflow run live-provider-smoke.yml`. Optional model overrides can be set as Actions variables: `OPENAI_SMOKE_MODEL`, `STABILITY_SMOKE_MODEL`, `RUNWAY_SMOKE_MODEL`, and `GOOGLE_VEO_SMOKE_MODEL`.

Run `npm run release:readiness` before release handoff. It loads the same local env files as the provider smoke commands, verifies that local live-provider credentials are not missing/mock/placeholder/trivially short values, resolves the GitHub repository from `GITHUB_REPOSITORY` or the `origin` remote, checks `gh secret list` for the provider secret names needed by **Live Provider Smoke**, and verifies that the current commit has successful GitHub Actions **CI** and **Live Provider Smoke** runs. Inside the manual GitHub Actions workflow, the same command runs in workflow-env mode: it verifies the provider secrets after GitHub injects them into environment variables and requires a successful **CI** run for the current commit before live provider calls begin. It reports only secret names and readiness status, never secret values.

To exercise BullMQ locally, set `QUEUE_MODE=redis`, make sure Redis is reachable at `REDIS_URL`, and run the worker in a second terminal:

```bash
npm run worker
```

Run `npm run smoke:redis-queue` when Redis is reachable and you want a provider-free live queue check. The smoke submits a script-analysis job through BullMQ, reads the Redis-backed queue health snapshot, publishes a project event, confirms Redis pub/sub delivery through the same path used by the SSE endpoint, and removes its own queued smoke job afterward.

### Development mode

In development:

- Next.js runs with hot reload.
- `QUEUE_MODE=inline` runs script analysis synchronously without Redis so the local workflow remains usable on a bare machine.
- `QUEUE_MODE=redis` submits script analysis jobs to BullMQ. Run `npm run worker` as a separate process to consume queued jobs.
- Redis can be a local instance or Docker container.
- Provider adapters default to mock mode in local development and tests if no API keys are configured, returning placeholder outputs so the full workflow can be tested without spend. Production OpenAI generation requires an encrypted workspace OpenAI key or `OPENAI_API_KEY`; production Stability image generation requires an encrypted workspace Stability key or `STABILITY_API_KEY`; production Runway video submission requires an encrypted workspace Runway key or `RUNWAYML_API_SECRET`. Missing, mock, known placeholder, or trivially short production credentials fail with a provider-key configuration error instead of producing mock outputs, and production provider-key saves reject `mock`, placeholder, checked-in example, and low-shape values for every provider regardless of casing or surrounding whitespace.
- Mock-backed placeholder providers for Kling, Seedance, Pika, Luma, and ElevenLabs are development/test-only. Video generation accepts only live-wired video providers: Runway and Google AI / Veo. Other video provider slugs fail with `unsupported_provider` until a real provider client and credentials are configured. Other direct placeholder adapter calls fail with `provider_not_configured` in production.
- File storage uses `./storage` relative to the project root by default. Project media directories are created below `STORAGE_ROOT/projects/{projectIdWithoutDashes}` and reject IDs containing path separators or traversal characters. New project creation creates and verifies those media directories before writing the production Prisma project record.
- Phase 1 exposes a local credentials session path so the foundation UI can be exercised before a Postgres instance is available; production deployments should use the configured database-backed Auth.js sessions.

## Observability

### Structured logging

The app uses a structured logger (e.g. pino) with JSON output. Every log entry includes:

- `timestamp`, `level`, `message`
- `requestId` (for API routes)
- `jobId` (for worker logs)
- `userId` (when authenticated)
- `projectId` (when in project context)

### Error tracking

Unexpected API errors are passed through the structured `captureError` path before the route returns a `500` response. In production, `500` responses use a generic `Unexpected server error.` message while the captured log retains the real exception for operators. When `SENTRY_DSN` is configured, the captured log records include `sentryEnabled: true` so deployment monitoring can verify the error-tracking path is active. Expected application errors such as malformed JSON bodies, Zod request-validation failures, authorization, and not-found responses are returned without error capture; malformed JSON returns `400 invalid_json`, and validation failures return `400 validation_error` with issue paths.

- `GET /api/health` actively probes Postgres with `SELECT 1`, Redis with `PING`, and `STORAGE_ROOT` with a mkdir/write/delete probe. It returns `200` with `status: "ok"` only when all three dependencies are reachable or writable, and `503` with `status: "degraded"` when any check fails. The response also reports non-secret `providerEnv` readiness for the OpenAI, Stability, Runway, and Google AI server fallback keys without exposing key values; Google AI accepts either `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`. Production responses redact raw dependency exception text by default; set `HEALTH_VERBOSE_ERRORS=1` only in a private diagnostic environment if exact dependency error messages are needed.
- `GET /api/health/workers` returns queue status (active, waiting, delayed, completed, failed counts per queue), configured queue rate limits when present, recent failed BullMQ job summaries when Redis queue mode is active, and a per-queue `healthError` when BullMQ health reads fail. It returns `503` with `status: "degraded"` if any queue reports a health error.
- In Redis queue mode, project job events are written before they are published to the `project:{projectId}:events` Redis pub/sub channel. Redis publish failures are treated as runtime failures so operators can repair live SSE delivery instead of silently missing updates. SSE subscribers receive events from Redis pub/sub in this mode rather than from process-local listeners. Redis subscribe failures are sent to clients as `stream_error` SSE events.
- These endpoints are unauthenticated for use by load balancers and monitoring.
