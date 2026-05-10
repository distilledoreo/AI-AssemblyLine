# Production Readiness Audit

Objective: make AI AssemblyLine fully functional with real APIs and ready for production.

## Current status

This document tracks concrete production gaps and verified evidence. Passing unit tests or a successful build is not treated as production readiness unless it covers the specific requirement.

## Checklist

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Prisma-backed repository layer | Prisma schema now includes the runtime fields used by repository services. Migration `0002_production_repository_fields` exists and `prisma validate` passes with a local Postgres URL. | In progress |
| Remove in-memory app state from runtime | `getStore()` is still used by service modules and repository functions. | Not complete |
| BullMQ + Redis queues | `submitGenerationJob` submits to BullMQ when Redis mode is enabled; health checks report Redis-backed queue counts; tests avoid Redis sockets in test mode. | Partially complete |
| Redis-backed SSE | `emitProjectEvent` publishes to Redis and the SSE subscription listens on a Redis project channel when Redis mode is enabled. Local runtime verification is blocked until Redis is available. | Partially complete |
| Real OpenAI calls | OpenAI adapter no longer throws for live keys. It calls `/v1/responses` for text/structured output and `/v1/images/generations` for images. Mocked HTTP tests cover payload and error-class mapping. | Partially complete |
| Real OpenAI key smoke test | No real API key has been verified in this environment yet. | Blocked |
| Playwright E2E tests | `e2e/project-workflow.spec.ts` covers sign-in, project creation, script analysis, asset approval, storyboard frame approval, video generation, and export bundle UI. | Passing for current local workflow |
| Multi-page workflow UI | Dedicated routes now exist for overview, script, Asset Bible, storyboard, and video workflows. E2E checks storyboard and video route filtering. | In progress |
| Storyboard drawing library | Fabric.js is installed and the storyboard page exposes a canvas with draw/select/rectangle/text/clear/save controls. E2E saves rectangle markup through the storyboard API. | Passing for local workflow |
| OAuth for OpenAI/ChatGPT and Google AI Pro | Feasibility and supported OAuth flows still need verification against current official docs. | Not complete |
| Production runtime verification | Postgres and Redis are not currently reachable on local default ports. | Blocked |

## Latest verification

- `npm test`: passing.
- `npm run lint`: passing.
- `npm run build`: passing.
- `prisma validate`: passing when `DATABASE_URL` is set for schema validation.
- `npm run test:e2e`: passing, 1 Chromium workflow test.
- Local Postgres TCP check: failed on `127.0.0.1:5432`.
- Local Redis TCP check: failed on `127.0.0.1:6379`.
