# AI AssemblyLine

AI AssemblyLine is a planned full-stack production platform for transforming scripts and Asset Bibles into storyboard images and AI-generated video clips for short films.

The app is designed for both single creators and production teams. It will analyze uploaded scripts, identify required assets, help users complete a continuity-focused Asset Bible, unlock scenes as their required assets become available, generate storyboard frames, and produce video clips through transparent user-selected AI provider APIs.

## Product direction

- **Output target:** storyboard frames and video clips for short films.
- **Users:** single-user creators and team production workspaces.
- **Workflow:** script analysis, Asset Bible creation, partial scene unlocking, storyboard generation, video generation, review, export/import.
- **Visual continuity:** one locked project style plus approved character, wardrobe, location, creature/animal, and close-up prop references.
- **Generation control:** bring-your-own API keys and fully transparent provider/model selectors.
- **Storage:** local filesystem media storage for the MVP.
- **Updates:** real-time job progress for analysis, image generation, video generation, and exports.

## Documentation

### Product and workflow

- [Product plan](docs/product-plan.md) — goals, users, workflow, MVP scope, and non-goals.
- [Asset Bible specification](docs/asset-bible.md) — visual style, asset types, lifecycle, and dependency logic.
- [Storyboard and video workflow](docs/storyboard-and-video.md) — frame generation, sketch ingestion, drawing tools, versioning, and video modes.

### Architecture and engineering

- [Data model](docs/data-model.md) — ERD, entity definitions, relationships, and cascading staleness rules.
- [Authentication and access control](docs/auth-and-access.md) — auth provider, session model, RBAC, permission matrix.
- [Script analysis pipeline](docs/script-analysis.md) — multi-pass LLM pipeline, chunking, validation, and user correction.
- [Prompt engine](docs/prompt-engine.md) — prompt composition, conflict resolution, token budget, and provider translation.
- [Provider and model strategy](docs/provider-strategy.md) — adapter interfaces, capability matrix, error classification.
- [Provider OAuth notes](docs/provider-oauth-notes.md) — feasibility notes for ChatGPT/OpenAI and Google AI/Gemini OAuth-style access.
- [Job queue design](docs/job-queue-design.md) — BullMQ topology, retry policy, async polling, SSE event publishing.
- [Media processing](docs/media-processing.md) — FFmpeg integration, thumbnails, format conversion, clip assembly.
- [Data, collaboration, and export](docs/data-and-collaboration.md) — data objects, team roles, storage, export/import, script revisions.

### Operations

- [Deployment and configuration](docs/deployment-and-config.md) — environment variables, API key encryption, local dev setup, observability.
- [Testing strategy](docs/testing-strategy.md) — test categories, provider mock factory, CI expectations.
- [API reference](docs/api-reference.md) — project workflow and operations endpoints.
- [Setup guide](docs/setup-guide.md) — local setup, verification commands, and export/import smoke test.
- [Production readiness audit](docs/production-readiness-audit.md) — current evidence, blockers, and remaining production gaps.
- [Implementation roadmap](docs/implementation-roadmap.md) — phased build order with deliverables and exit criteria.
- [Phase 1 foundation](docs/phase-1-foundation.md) — runnable app shell, setup flow, auth/RBAC, provider keys, storage, queues, and SSE verification.
- [Phase 2 script pipeline](docs/phase-2-script-pipeline.md) — upload, deterministic analysis, editable breakdown, re-analysis, and dependency graph verification.
- [Phase 3 Asset Bible](docs/phase-3-asset-bible.md) — asset details, references, generation, versioning, approval, locking, merge/split, and dependency unlocking.
- [Phase 4 storyboard](docs/phase-4-storyboard.md) — prompt composition, frame generation, markup, comments, approval, and staleness.
- [Phase 5 video](docs/phase-5-video.md) — shot and scene clip generation, video adapters, polling metadata, media inspection, and clip approval.
- [Phase 6 collaboration](docs/phase-6-collaboration.md) — invitations, member roles, assignments, activity feed, and locked asset warnings.
- [Phase 7 export/import/polish](docs/phase-7-export-import-polish.md) — portable bundles, import, remaining adapters, observability, storage management, and accessibility polish.

## MVP scope

See the [product plan](docs/product-plan.md#mvp-scope) for the full MVP feature set and explicit non-goals.

## Development status

Phase 7 export/import and polish implementation is underway. The repository now includes a Next.js App Router scaffold, TypeScript service layer, Prisma/Postgres schema, Auth.js/NextAuth configuration, RBAC checks, encrypted provider key storage, BullMQ queue metadata, local filesystem storage helpers, API routes, an SSE project event endpoint, deterministic script analysis, Asset Bible, storyboard/video workflows, collaboration controls, versioned project export/import, remaining provider adapter capability snapshots, job metrics, structured logging, and storage management helpers.

The [implementation roadmap](docs/implementation-roadmap.md) remains the build order across seven phases. Each phase must be implemented, documented, tested, run, verified, committed, and pushed before the next phase begins.

GitHub Actions runs the non-secret verification gates on pull requests and pushes to `main`: dependency installation, Prisma generation and schema validation, dependency audit, Vitest, lint, production build, Playwright E2E, production infrastructure preflight, a real Postgres-backed Prisma repository smoke, and Redis queue/pub-sub smoke. The manual **Live Provider Smoke** workflow runs `npm run smoke:providers` with `OPENAI_API_KEY`, `STABILITY_API_KEY`, `RUNWAYML_API_SECRET`, and `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` from GitHub secrets. Production preflight still requires real deployment secrets and external services.

## Local development

```bash
npm install
npm run services:up
npm run prisma:generate
npm run prisma:migrate
npm test
npm run dev
```

Open `http://localhost:3000/signin`, sign in with any valid email and a password of at least four characters, create a workspace and project, save an OpenAI key, then open the project dashboard to verify the live SSE connection. Use the Script analysis panel to upload sample script text, review the generated breakdown, generate and approve Asset Bible references, approve storyboard frames and video clips, invite or assign collaborators, then export and import a project bundle from the operations panel.

The `services:up` script requires Docker Compose and starts the local Postgres and Redis services defined in `compose.yaml`. If Docker is unavailable, install or start equivalent Postgres and Redis services yourself and point `DATABASE_URL` and `REDIS_URL` at them.

For Redis-backed script analysis in a production-like setup, set `QUEUE_MODE=redis`, start the web app with `npm run dev` or `npm run build && npm start`, and run `npm run worker` in a separate process. In the default local `.env.example`, `QUEUE_MODE=inline` keeps jobs synchronous so the app can be exercised without a Redis worker.

To validate the real Prisma repository layer against a migrated Postgres database, run `npm run smoke:prisma-repository`. It requires `DATABASE_URL`, `ENCRYPTION_KEY`, and `STORAGE_ROOT`, plus Redis for production-mode queue submission, exercises auth/session, workspace/project, encrypted provider-key, job/event persistence, script-analysis graph records, storyboard/video records, collaboration records, and export bundle listing, and does not call provider APIs. In Prisma mode, generation jobs and job events are persisted through Prisma and are not copied into the process-local job/event store.

Google and GitHub sign-in appear on `/signin` when the corresponding `AUTH_GOOGLE_*` or `AUTH_GITHUB_*` variables are configured. Live provider verification uses `npm run smoke:openai`, `npm run smoke:stability`, `npm run smoke:runway`, `npm run smoke:google-veo`, or `npm run smoke:providers` with the matching provider keys set. Before a production release, run `npm run release:readiness` to check both local live-provider credentials and the GitHub Actions secrets required by the manual **Live Provider Smoke** workflow.
