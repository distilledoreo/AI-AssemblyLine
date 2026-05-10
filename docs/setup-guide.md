# Setup Guide

## Local development

Install dependencies and start the app:

```bash
npm install
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000/signin`, sign in with any valid email and a password of at least four characters, then create a workspace and project.

## Environment

The local MVP can run with default development values. Production-style deployments should set:

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY`
- `STORAGE_ROOT`
- `SENTRY_DSN` when error tracking should be enabled

Provider keys are entered in the app settings and encrypted server-side. They are never written to exports.

## OpenAI provider

The OpenAI adapter supports deterministic mock mode when the stored key is `mock`, and live API mode when a real OpenAI API key is configured for the workspace. Live text and structured output calls use the Responses API. Live image calls use the Image generation API with GPT Image-compatible sizes.

Recommended defaults:

- Text and structured output: `gpt-4.1-mini` for lower-cost production smoke tests, or a stronger approved model for final script analysis.
- Images: `gpt-image-1`.

Do not run live-provider tests in CI unless a dedicated test key and spend limit are configured.

## Verification commands

Run these before committing substantive changes:

```bash
npm test
npm run lint
npm run build
```

For browser verification, start the dev server and exercise the relevant dashboard workflow directly.

## Export and import smoke test

1. Create or open a populated project.
2. Upload a script and run analysis.
3. Generate and approve at least one asset reference, storyboard frame, and video clip.
4. Click **Export bundle** in the project operations panel.
5. Click **Import latest** and confirm a new imported project is created.
6. Confirm the operations panel shows job metrics, storage usage, adapter capabilities, and Sentry status.
