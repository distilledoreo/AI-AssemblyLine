# Production Readiness Audit

Objective: make AI AssemblyLine fully functional with real APIs and ready for production.

## Current status

This document tracks concrete production gaps and verified evidence. Passing unit tests or a successful build is not treated as production readiness unless it covers the specific requirement.

## Checklist

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Prisma-backed repository layer | Auth sessions, workspace/project ownership, project CRUD/dashboard reads, and provider-key storage now use Prisma when `REPOSITORY_MODE=prisma` or `NODE_ENV=production`. `repository.prisma.test.ts` forces Prisma mode with a mocked Prisma client, and `prisma validate` passes with a local Postgres URL. | Partially complete |
| Remove in-memory app state from runtime | `getStore()` is still used by script analysis, asset bible, storyboard, video, collaboration, export/import, and graph-heavy repository functions. The foundational repository entry points are Prisma-aware, but generated project data is not fully persisted through Prisma yet. | Not complete |
| BullMQ + Redis queues | `submitGenerationJob` submits to BullMQ when Redis mode is enabled; health checks report Redis-backed queue counts; tests avoid Redis sockets in test mode. | Partially complete |
| Redis-backed SSE | `emitProjectEvent` publishes to Redis and the SSE subscription listens on a Redis project channel when Redis mode is enabled. Local runtime verification is blocked until Redis is available. | Partially complete |
| Real OpenAI calls | OpenAI adapter no longer throws for live keys. It calls `/v1/responses` for text/structured output and `/v1/images/generations` for images. Mocked HTTP tests cover payload and error-class mapping. | Partially complete |
| Real OpenAI key smoke test | No real API key has been verified in this environment yet. | Blocked |
| Playwright E2E tests | `e2e/project-workflow.spec.ts` covers sign-in, project creation, script analysis, asset approval, storyboard frame approval, video generation, and export bundle UI. | Passing for current local workflow |
| Multi-page workflow UI | Dedicated routes now exist for overview, script, Asset Bible, storyboard, and video workflows. E2E checks storyboard and video route filtering. | Passing for local workflow |
| Storyboard drawing library | Fabric.js is installed and the storyboard page exposes a canvas with draw/select/rectangle/text/clear/save controls. E2E saves rectangle markup through the storyboard API. | Passing for local workflow |
| OAuth for OpenAI/ChatGPT and Google AI Pro | Official OpenAI docs support OAuth for GPT Actions where ChatGPT authenticates to this app's API, not as a general way for this app to spend a user's ChatGPT subscription quota. Google Vertex AI supports API keys and Application Default Credentials for production; AI Studio API keys are not supported in Vertex AI. | Feasibility documented |
| Production runtime verification | Postgres and Redis are not currently reachable on local default ports. | Blocked |

## Latest verification

- `npm test`: passing, 13 files and 34 tests.
- `npm run lint`: passing.
- `npm run build`: passing.
- `prisma validate`: passing when `DATABASE_URL` is set for schema validation.
- `npm run test:e2e`: passing, 1 Chromium workflow test.
- Local Postgres TCP check: failed on `127.0.0.1:5432`.
- Local Redis TCP check: failed on `127.0.0.1:6379`.
- Real OpenAI smoke-test preflight: `OPENAI_API_KEY` is not set in this environment.
