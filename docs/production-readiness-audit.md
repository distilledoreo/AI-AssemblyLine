# Production Readiness Audit

Objective: make AI AssemblyLine fully functional with real APIs and ready for production.

## Current status

This document tracks concrete production gaps and verified evidence. Passing unit tests or a successful build is not treated as production readiness unless it covers the specific requirement.

## Checklist

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Prisma-backed repository layer | Auth sessions, workspace/project ownership, project CRUD/dashboard reads, provider-key storage, project style updates, script upload/version metadata, generated script-analysis scenes/shots/assets/requirements, imported graph reconstruction, Asset Bible status/manual requirement mutations, typed Asset Bible detail writes and graph readback, Asset Bible version/reference writes and graph readback, Asset Bible merge/split corrections, storyboard frame/version/review-note writes and graph readback, video clip/version writes and graph readback, collaboration invitation/member/assignment/activity writes and graph readback, export bundle writes/listing, job metrics, Prisma graph reads for project/API surfaces, generation job creation/completion, job-event writes, and SSE event replay now use Prisma when `REPOSITORY_MODE=prisma` or `NODE_ENV=production`. `repository.prisma.test.ts` forces Prisma mode with a mocked Prisma client, and `prisma validate` passes with a local Postgres URL. | Partially complete |
| Remove in-memory app state from runtime | `getStore()` is still used by local storyboard workflow mirroring and local workflow mirroring for test/development mode. Project/API graph reads, foundational repository entry points, project style updates, script upload/version metadata, generated scene/shot/asset/requirement records, imported graph records, typed Asset Bible detail records, Asset Bible status/manual requirement mutations, Asset Bible version/reference records, Asset Bible merge/split corrections, storyboard frame/version/review-note records, video clip/version records, collaboration records, export bundle records, and job/event records are Prisma-aware. | Not complete |
| BullMQ + Redis queues | `submitGenerationJob` submits to BullMQ when Redis mode is enabled; script upload/re-analysis returns pending state in Redis mode and `npm run worker` starts an analysis worker that processes `script_analysis` jobs. Asset reference generation now returns queued state in Redis mode and the image worker processes `asset_reference` jobs. Health checks report Redis-backed queue counts; tests avoid Redis sockets in test mode. | Partially complete |
| Redis-backed SSE | `emitProjectEvent` publishes to Redis and the SSE subscription listens on a Redis project channel when Redis mode is enabled. SSE catch-up replay reads persisted Prisma events in Prisma mode. Local runtime verification is blocked until Redis is available. | Partially complete |
| Real OpenAI calls | OpenAI adapter no longer throws for live keys. It calls `/v1/responses` for text/structured output and `/v1/images/generations` for images. Mocked HTTP tests cover payload and error-class mapping. | Partially complete |
| Real OpenAI key smoke test | `npm run smoke:openai` performs a low-token live Responses API structured-output call when `OPENAI_API_KEY` is set. `openaiSmoke.test.ts` covers missing-key failure and the live-call payload shape with a mocked fetch. No real API key has been verified in this environment yet. | Blocked |
| Health checks | `GET /api/health` now actively checks Postgres with `SELECT 1` and Redis with `PING`, returning `503` and dependency error details when either dependency is unreachable. `health.test.ts` covers healthy and degraded dependency states. | Passing for mocked dependencies; blocked for local real services |
| Local dependency bring-up | `compose.yaml` defines PostgreSQL 16 and Redis 7 with health checks and persistent volumes. `npm run services:up`, `services:down`, and `services:logs` wrap Docker Compose for local production-like dependencies. Runtime verification is blocked because Docker is not installed in this environment. | Partially complete |
| Next.js production build conventions | The request guard uses `src/proxy.ts` with `export function proxy`, replacing the deprecated `src/middleware.ts` convention. `proxy.test.ts` covers protected-route redirects and authenticated pass-through. | Passing |
| Dependency security audit | `package.json` uses an npm override to pin `postcss` to `8.5.14`, replacing the vulnerable `8.4.31` nested under Next.js. `npm audit --audit-level=moderate` now reports zero vulnerabilities and `npm ls postcss` shows Next and Vite both using `8.5.14`. | Passing |
| Playwright E2E tests | `e2e/project-workflow.spec.ts` covers sign-in, project creation, script analysis, asset approval, storyboard frame approval, video generation, and export bundle UI. | Passing for current local workflow |
| Multi-page workflow UI | Dedicated routes now exist for overview, script, Asset Bible, storyboard, and video workflows. E2E checks storyboard and video route filtering. | Passing for local workflow |
| Storyboard drawing library | Fabric.js is installed and the storyboard page exposes a canvas with draw/select/rectangle/text/clear/save controls. E2E saves rectangle markup through the storyboard API. | Passing for local workflow |
| OAuth for OpenAI/ChatGPT and Google AI Pro | Official OpenAI docs support OAuth for GPT Actions where ChatGPT authenticates to this app's API, not as a general way for this app to spend a user's ChatGPT subscription quota. Google Vertex AI supports API keys and Application Default Credentials for production; AI Studio API keys are not supported in Vertex AI. | Feasibility documented |
| Production runtime verification | Postgres and Redis are not currently reachable on local default ports. | Blocked |

## Latest verification

- `npm test`: passing, 19 files and 59 tests.
- `npm run lint`: passing.
- `npm run build`: passing.
- `npm audit --audit-level=moderate`: passing, zero vulnerabilities.
- `npm ls postcss`: Next.js and Vite both resolve to `postcss@8.5.14`.
- `prisma validate`: passing when `DATABASE_URL` is set for schema validation.
- `npm run test:e2e`: passing, 1 Chromium workflow test.
- `QUEUE_MODE=inline npm run worker`: exits cleanly with Redis disabled message.
- `GET /api/health` against the live local dev server returns `503` with `status: "degraded"` and dependency error details.
- Docker preflight: `docker --version` and `docker compose version` fail because Docker is not installed in this environment.
- Local Postgres TCP check: failed on `127.0.0.1:5432`.
- Local Redis TCP check: failed on `127.0.0.1:6379`.
- Real OpenAI smoke-test preflight: `OPENAI_API_KEY` is not set in this environment.
