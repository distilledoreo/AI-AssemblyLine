# Phase 1 Foundation

Phase 1 turns the documentation-only repository into a runnable Next.js application shell with authentication, workspace/project setup, provider key management, queue metadata, local storage helpers, and a project SSE stream.

## Implemented user flow

1. Open `/signin`.
2. Sign in with the credentials form. For local development, any valid email and password of at least four characters creates or reuses a local user session.
3. Open `/dashboard`.
4. Create a workspace.
5. Create a project in that workspace.
6. Save an OpenAI provider key from the dashboard provider-key panel.
7. Open the project dashboard and confirm the SSE status changes to live.

The Phase 1 dashboard intentionally starts with no scripts, assets, storyboard frames, or video clips. Those workflows begin in later roadmap phases.

## Runtime services

- `GET /api/health` reports environment configuration for Postgres, Redis, and local storage.
- `GET /api/health/workers` reports the BullMQ queue topology from `job-queue-design.md`, including Redis-backed queue counts when Redis is enabled.
- `GET /api/projects/{projectId}/events` streams project job events as Server-Sent Events and sends a heartbeat every 30 seconds. Production-like runtime publishes events through Redis pub/sub; tests and explicit inline mode avoid external Redis sockets.

## Auth and access

The app includes the Auth.js/NextAuth configuration required by `auth-and-access.md` with credentials support and conditional Google/GitHub OAuth providers when OAuth environment variables are present. The local Phase 1 UI uses a lightweight credentials session cookie so the app can be exercised without a live Postgres server.

If the local dev server restarts and an old session cookie no longer maps to an active local session, protected pages treat the user as signed out and redirect to `/signin` instead of surfacing a server error.

RBAC checks are enforced in the API service layer:

- workspace owner/admin/member hierarchy for workspace operations,
- project permission matrix for project dashboard, settings, deletion, generation, review, and export actions.

## Provider key security

Provider keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY`. API responses return only masked key values. Decryption is server-side only for adapter usage.

## Data model

`prisma/schema.prisma` defines the Postgres schema for the roadmap entities, including Auth.js session tables, workspaces, projects, provider keys, scripts, assets, storyboard frames, video clips, jobs, review notes, invitations, assignments, and export bundles.

The initial migration lives under `prisma/migrations/` and is generated from that schema.

## Local verification

Use npm on machines where pnpm is not installed:

```bash
npm install
npm run prisma:generate
npm test
npm run build
npm run dev
```

Then exercise the user flow above in the browser. Automated tests cover Phase 1 auth/service flows, RBAC decisions, provider adapter contract behavior, provider key encryption, storage directory creation, queue topology, and SSE formatting.
