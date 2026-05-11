# Testing Strategy

AI AssemblyLine tests are organized by category. Every phase of implementation adds tests for its deliverables. Provider adapters use mock factories so tests run without API keys or network access.

## Test categories

### Unit tests

Test individual functions and modules in isolation. Focus areas:

- **Prompt engine:** Template composition, conflict resolution, truncation, provider translation.
- **Script analysis:** JSON parsing, schema validation, repair logic, deduplication.
- **Asset lifecycle:** Status transitions, staleness propagation, merge/split logic.
- **Permission checks:** Role-based access decisions for every action in the permission matrix.
- **Data validation:** Input sanitization, field constraints, enum validation.

Framework: **Vitest** with TypeScript support.

### Integration tests

Test API routes with a real database and mocked external services. Focus areas:

- **API routes:** Request validation, auth enforcement, correct database mutations, response shapes.
- **Job queue:** Job creation, status transitions, event publishing (with in-memory Redis via `ioredis-mock`).
- **File operations:** Upload handling, thumbnail generation, path construction, cleanup.
- **Provider adapters:** Adapter interface compliance with mocked HTTP responses.

Framework: **Vitest** with Prisma test utilities (isolated test database, transaction rollback per test).

### End-to-end tests

Test critical user flows through the full stack (browser → API → database → workers). Focus areas:

- Script upload and analysis completion.
- Asset Bible creation and approval flow.
- Storyboard generation and frame approval.
- Video clip generation.
- Export and re-import of a project bundle.
- Team invitation and role enforcement.
- Conditional Google/GitHub OAuth button visibility with fake OAuth clients.

Framework: **Playwright** with a dedicated test database and mocked provider adapters.

## Provider mock factory

All provider adapters implement a common interface. The mock factory creates fake adapters that:

1. Accept any valid prompt and return deterministic placeholder responses (a 1x1 pixel PNG for images, a 1-second silent MP4 for video, fixture JSON for text).
2. Simulate async provider behavior (configurable delay, polling steps).
3. Can be configured to return specific error classes (`content_policy`, `rate_limit`, `fatal`) for error-path testing.
4. Record all calls for assertion (prompt content, settings, reference images passed).

```typescript
// Example usage in tests
const mockOpenAI = createMockAdapter("openai", {
  latencyMs: 100,
  errorOnCall: 3, // third call returns an error
  errorClass: "rate_limit",
});
```

## Test database

Integration and E2E tests use a separate Postgres database (`assemblyline_test`). Each test suite:

1. Runs migrations before the suite starts.
2. Wraps each test in a transaction that rolls back on completion (integration tests) or uses isolated seed data (E2E tests).
3. Cleans up generated files in a temporary storage directory after each suite.

## CI expectations

- All unit and integration tests run on every pull request.
- E2E tests run on merge to `main` and on release branches.
- Test coverage is tracked but not gated (no minimum percentage). Coverage trends are monitored for regressions.
- Provider mock factory is the only way to test provider interactions in CI. Real API calls are never made in automated tests.

The checked-in GitHub Actions workflow at `.github/workflows/ci.yml` runs on pull requests and pushes to `main`. The main verification job installs with `npm ci`, generates and validates the Prisma client/schema, runs the dependency audit, runs Vitest, lint, the production build, installs Chromium, and runs the Playwright E2E workflow. The Playwright step uses inline queue mode, memory repository mode, mocked/local providers, disposable local storage, and a platform-aware npm command so browser coverage can run on both Windows development machines and Linux CI runners without real API keys or external production services.

The workflow also includes a production infrastructure preflight job with real GitHub Actions Postgres 16 and Redis 7 service containers. That job installs dependencies, generates the Prisma client, applies checked-in Prisma migrations with `npm run prisma:migrate:deploy`, runs `NODE_ENV=production npm run preflight:production` against the live service ports and writable CI storage, and then runs `npm run smoke:redis-queue`. The Redis smoke submits a script-analysis job through BullMQ, reads the Redis-backed queue health snapshot, publishes a project event, and confirms that the same Redis pub/sub path used by the SSE endpoint receives it. It uses synthetic non-secret provider-key strings only to exercise the production preflight key-shape gate; live OpenAI, Stability, Runway, and Google AI API calls remain restricted to the explicit smoke commands outside automated CI.

Live provider API verification is available as the manual GitHub Actions workflow `.github/workflows/live-provider-smoke.yml`. It is intentionally `workflow_dispatch` only, sources provider credentials from repository secrets, and runs `npm run smoke:providers`. The normal pull-request and `main` workflows remain keyless and never call provider APIs.

## What to test per phase

| Phase               | Test focus                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| 1 — Foundation      | Auth flows, RBAC middleware, provider adapter interface compliance, SSE connection, project CRUD |
| 2 — Script Pipeline | Analysis passes, chunking, validation, repair, user correction API routes                        |
| 3 — Asset Bible     | Asset CRUD, lifecycle transitions, staleness propagation, reference upload, generation job flow  |
| 4 — Storyboard      | Prompt composition, frame versioning, sketch ingestion, drawing tool state                       |
| 5 — Video           | Video prompt composition, async polling flow, clip versioning, staleness from frame changes      |
| 6 — Collaboration   | Invitation flow, role enforcement across all endpoints, activity feed, multi-user SSE            |
| 7 — Export/Import   | Bundle creation, re-import integrity, version compatibility                                      |
