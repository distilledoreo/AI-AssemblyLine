# Deployment and Configuration

This document covers environment configuration, secrets management, API key encryption, and local development setup for AI AssemblyLine.

## Environment variables

All configuration is driven by environment variables loaded from `.env` files (via `dotenv`) or the host environment. The app uses a validated config module that fails fast on startup if required variables are missing.

### Required variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection string | `postgresql://user:pass@localhost:5432/assemblyline` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `QUEUE_MODE` | Queue execution mode. Use `inline` for no-worker local development or `redis` for BullMQ-backed async jobs. Production defaults to Redis mode when unset. | `redis` |
| `NEXTAUTH_URL` | Canonical app URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth session signing secret (32+ chars) | Generated via `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | AES-256 key for provider API key encryption (32 bytes, base64) | Generated via `openssl rand -base64 32` |
| `STORAGE_ROOT` | Root directory for local media storage | `./storage` |

### Optional variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | App port | `3000` |
| `ANALYSIS_QUEUE_CONCURRENCY` | Workers for script analysis queue | `2` |
| `IMAGE_QUEUE_CONCURRENCY` | Workers for image generation queue | `3` |
| `VIDEO_QUEUE_CONCURRENCY` | Workers for video generation queue | `2` |
| `MEDIA_WORKER_CONCURRENCY` | Workers for FFmpeg media queue | `4` |
| `PROJECT_QUEUE_CONCURRENCY` | Workers for export/import queue | `1` |
| `MAX_UPLOAD_SIZE_MB` | Maximum file upload size | `100` |
| `SESSION_MAX_AGE_DAYS` | Session expiry | `30` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `SENTRY_DSN` | Sentry error tracking DSN | None (disabled) |

### OAuth sign-in variables

Google and GitHub sign-in are optional. Configure both a client ID and client secret to show the provider on `/signin`.

| Provider | Client ID variables | Client secret variables |
|----------|---------------------|-------------------------|
| Google | `AUTH_GOOGLE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_ID` | `AUTH_GOOGLE_SECRET`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SECRET` |
| GitHub | `AUTH_GITHUB_ID`, `GITHUB_CLIENT_ID`, `GITHUB_ID` | `AUTH_GITHUB_SECRET`, `GITHUB_CLIENT_SECRET`, `GITHUB_SECRET` |

## API key encryption

Provider API keys entered by users are encrypted before storage and decrypted only server-side when making provider API calls.

### Encryption scheme

- **Algorithm:** AES-256-GCM (authenticated encryption).
- **Key:** The `ENCRYPTION_KEY` environment variable (32 bytes, base64-encoded).
- **Nonce:** A unique 12-byte random nonce generated per key, stored alongside the ciphertext in the `ProviderKey` table (`keyNonce` column).
- **Auth tag:** 16 bytes, appended to the ciphertext.

### Key rotation

If `ENCRYPTION_KEY` needs to be rotated:

1. Set `ENCRYPTION_KEY_OLD` to the current key.
2. Set `ENCRYPTION_KEY` to the new key.
3. Run the `rotate-keys` CLI command, which re-encrypts all `ProviderKey` records.
4. Remove `ENCRYPTION_KEY_OLD` after successful rotation.

### Security rules

- Provider API keys are **never** included in: API responses to the client, generation logs, prompt metadata, export bundles, error messages, or browser-accessible storage.
- The decrypted key exists only in memory for the duration of a provider API call.
- The `ProviderKey` table is excluded from all export queries.

## Local development setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- FFmpeg 6+ (on PATH)
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

To exercise BullMQ locally, set `QUEUE_MODE=redis`, make sure Redis is reachable at `REDIS_URL`, and run the worker in a second terminal:

```bash
npm run worker
```

### Development mode

In development:

- Next.js runs with hot reload.
- `QUEUE_MODE=inline` runs script analysis synchronously without Redis so the local workflow remains usable on a bare machine.
- `QUEUE_MODE=redis` submits script analysis jobs to BullMQ. Run `npm run worker` as a separate process to consume queued jobs.
- Redis can be a local instance or Docker container.
- Provider adapters default to mock mode in local development and tests if no API keys are configured, returning placeholder outputs so the full workflow can be tested without spend. Production generation requires an encrypted workspace provider key or `OPENAI_API_KEY`; missing or literal `mock` OpenAI credentials fail with a provider-key configuration error instead of producing mock outputs.
- Mock-backed placeholder providers for Stability, Runway, Kling, Seedance, Pika, Luma, and ElevenLabs are development/test-only. Production calls fail with `provider_not_configured` until a live provider client and credentials are configured for that provider.
- File storage uses `./storage` relative to the project root.
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

Unexpected API errors are passed through the structured `captureError` path before the route returns a `500` response. When `SENTRY_DSN` is configured, the captured log records include `sentryEnabled: true` so deployment monitoring can verify the error-tracking path is active. Expected application errors such as validation, authorization, and not-found responses are returned without error capture.

- `GET /api/health` actively probes Postgres with `SELECT 1` and Redis with `PING`. It returns `200` with `status: "ok"` only when both dependencies are reachable, and `503` with `status: "degraded"` when either check fails. Production responses redact raw dependency exception text by default; set `HEALTH_VERBOSE_ERRORS=1` only in a private diagnostic environment if exact dependency error messages are needed.
- `GET /api/health/workers` returns queue status (active, waiting, failed counts per queue).
- These endpoints are unauthenticated for use by load balancers and monitoring.
