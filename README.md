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
- [Job queue design](docs/job-queue-design.md) — BullMQ topology, retry policy, async polling, SSE event publishing.
- [Media processing](docs/media-processing.md) — FFmpeg integration, thumbnails, format conversion, clip assembly.
- [Data, collaboration, and export](docs/data-and-collaboration.md) — data objects, team roles, storage, export/import, script revisions.

### Operations

- [Deployment and configuration](docs/deployment-and-config.md) — environment variables, API key encryption, local dev setup, observability.
- [Testing strategy](docs/testing-strategy.md) — test categories, provider mock factory, CI expectations.
- [Implementation roadmap](docs/implementation-roadmap.md) — phased build order with deliverables and exit criteria.
- [Phase 1 foundation](docs/phase-1-foundation.md) — runnable app shell, setup flow, auth/RBAC, provider keys, storage, queues, and SSE verification.
- [Phase 2 script pipeline](docs/phase-2-script-pipeline.md) — upload, deterministic analysis, editable breakdown, re-analysis, and dependency graph verification.
- [Phase 3 Asset Bible](docs/phase-3-asset-bible.md) — asset details, references, generation, versioning, approval, locking, merge/split, and dependency unlocking.
- [Phase 4 storyboard](docs/phase-4-storyboard.md) — prompt composition, frame generation, markup, comments, approval, and staleness.

## MVP scope

See the [product plan](docs/product-plan.md#mvp-scope) for the full MVP feature set and explicit non-goals.

## Development status

Phase 4 storyboard implementation is underway. The repository now includes a Next.js App Router scaffold, TypeScript service layer, Prisma/Postgres schema, Auth.js/NextAuth configuration, RBAC checks, encrypted provider key storage, BullMQ queue metadata, local filesystem storage helpers, API routes, an SSE project event endpoint, deterministic script analysis, an Asset Bible workflow, and storyboard frame generation with prompt composition, markup, comments, and approval.

The [implementation roadmap](docs/implementation-roadmap.md) remains the build order across seven phases. Each phase must be implemented, documented, tested, run, verified, committed, and pushed before the next phase begins.

## Local development

```bash
npm install
npm run prisma:generate
npm test
npm run dev
```

Open `http://localhost:3000/signin`, sign in with any valid email and a password of at least four characters, create a workspace and project, save an OpenAI key, then open the project dashboard to verify the live SSE connection. Use the Script analysis panel to upload sample script text, review the generated breakdown, generate and approve Asset Bible references, and confirm required scenes/shots unlock as assets are approved.

