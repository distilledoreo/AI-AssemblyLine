# Setup Guide

## Local development

Install dependencies and start the app:

```bash
npm install
npm run services:up  # requires Docker; starts local Postgres and Redis
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000/signin`, sign in with any valid email and a password of at least four characters, then create a workspace and project.

If Docker is not available, run PostgreSQL 15+ and Redis 7+ yourself using the URLs from `.env.example`. Stop the checked-in Docker services with `npm run services:down`.

## Environment

The local MVP can run with default development values. Production-style deployments should set:

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY`
- `STORAGE_ROOT`
- `SENTRY_DSN` when error tracking should be enabled

Provider keys are entered in the app settings and encrypted server-side. The dashboard does not prefill mock keys; paste real OpenAI, Stability, and Runway API keys for production verification. In production, the server rejects a literal `mock` key for every provider, and saved provider keys are limited to those live-wired providers. Provider keys are never written to exports.

## OpenAI provider

The OpenAI adapter supports deterministic mock mode when the stored key is `mock`, and live API mode when a real OpenAI API key is configured for the workspace. Live text and structured output calls use the Responses API. Live image calls use the Image generation API with GPT Image-compatible sizes.

Recommended defaults:

- Text and structured output: `gpt-4.1-mini` for lower-cost production smoke tests, or a stronger approved model for final script analysis.
- Images: `gpt-image-1`.

Do not run live-provider tests in CI unless a dedicated test key and spend limit are configured.

To run the live OpenAI smoke test manually:

```bash
set OPENAI_API_KEY=sk-...
npm run smoke:openai
```

Optionally set `OPENAI_SMOKE_MODEL` to override the default `gpt-4.1-mini`. The smoke command performs a small Responses API structured-output request and prints the provider response id, model, short content preview, and token usage.

## Verification commands

Run these before committing substantive changes:

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

For browser verification, start the dev server and exercise the relevant dashboard workflow directly.

For production-style dependency verification, call `GET /api/health` after Postgres and Redis are configured. The endpoint returns `200` only when both dependencies are reachable; a `503` response identifies the failing dependency. In production, raw dependency exception text is redacted unless `HEALTH_VERBOSE_ERRORS=1` is set for a private diagnostic run.

Run `npm run preflight:production` before release. It verifies required production environment variables, secret/key lengths, real non-mock OpenAI, Stability, and Runway credentials, FFmpeg/ffprobe availability, and TCP reachability for Postgres and Redis.

## Export and import smoke test

1. Create or open a populated project.
2. Upload a script and run analysis.
3. Generate and approve at least one asset reference, storyboard frame, and video clip.
4. Click **Export bundle** in the project operations panel.
5. Click **Import latest** and confirm a new imported project is created.
6. Confirm the operations panel shows job metrics, storage usage, adapter capabilities, and Sentry status.
7. Use the workflow navigation to open `/script`, `/asset-bible`, `/storyboard`, and `/video` project pages for focused review.
