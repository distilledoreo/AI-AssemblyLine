# Phase 5 Video Generation

Phase 5 adds video clip generation from approved storyboard frames.

## Implemented user flow

1. Approve at least one storyboard frame for a shot.
2. Generate a shot-by-shot clip with the Runway video adapter.
3. Generate a scene-level clip with the Kling video adapter when a scene has approved frames.
4. Review and approve clip versions.
5. See clip versions and approved clip counts in the project dashboard.

## Runtime endpoints

- `GET /api/projects/{projectId}/videos` returns the project graph with video clips and clip versions.
- `POST /api/projects/{projectId}/videos` accepts:
  - `generate` for shot or scene video generation with `runway` or `kling`.
  - `clip` for clip version status transitions.

## Provider, polling, and media behavior

- Runway and Kling adapters implement the video provider contract and declare async polling capability.
- Local verification uses deterministic mock video bytes when no real provider keys are configured.
- With a workspace Runway key or `RUNWAYML_API_SECRET`, shot and scene video generation can submit live Runway async video tasks, persist the returned provider task id, and finalize completed output through the Runway polling processor. Run `npm run smoke:runway` before enabling live Runway generation in production.
- Kling remains development/test-only until a live Kling client and credentials are implemented; production use fails through the mock-provider guard instead of silently producing placeholder video.
- Generation jobs store polling metadata matching `job-queue-design.md` defaults: 15 second interval and 120 max attempts.
- Media inspection checks FFmpeg availability and falls back to placeholder metadata when FFmpeg is unavailable in local development.
- Clip versions record source frame version IDs so downstream staleness can be tracked when storyboard frames are superseded.

## Local verification

Use:

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then approve a storyboard frame, generate a shot clip, approve it, and verify the Video clips panel reports the generated and approved clip version.
