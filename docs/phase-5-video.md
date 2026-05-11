# Phase 5 Video Generation

Phase 5 adds video clip generation from approved storyboard frames.

## Implemented user flow

1. Approve at least one storyboard frame for a shot.
2. Generate a shot-by-shot clip with the Runway or Google AI Veo video adapter.
3. Generate a scene-level clip with the Runway or Google AI Veo video adapter when a scene has approved frames.
4. Review and approve clip versions.
5. See clip versions and approved clip counts in the project dashboard.

## Runtime endpoints

- `GET /api/projects/{projectId}/videos` returns the project graph with video clips and clip versions.
- `POST /api/projects/{projectId}/videos` accepts:
  - `generate` for shot or scene video generation with `runway` or `google-ai`.
  - `clip` for clip version status transitions.
- Shot generation requires exactly one `shotId`; scene generation requires exactly one `sceneId`. Extra, missing, or cross-project target IDs are rejected before provider jobs are created.

## Provider, polling, and media behavior

- Runway and Google AI Veo implement live video generation paths. Kling still advertises placeholder capabilities for planning/export metadata, but generation workers and server-side generation calls reject provider slugs that are not live-wired with `unsupported_provider`.
- Local verification uses deterministic mock video bytes when no real provider keys are configured.
- The production UI can route shot and scene video generation through either Runway or Google AI Veo.
- With a workspace Runway key or `RUNWAYML_API_SECRET`, shot and scene video generation can submit live Runway async video tasks, persist the returned provider task id, and finalize completed output through the Runway polling processor. Run `npm run smoke:runway` before enabling live Runway generation in production.
- With a workspace Google AI key, `GEMINI_API_KEY`, or `GOOGLE_AI_API_KEY`, shot and scene video generation can submit live Gemini API / Veo async operations, persist the returned operation name, poll completion, and download completed output using the Google API key header. Run `npm run smoke:google-veo` before enabling live Veo generation in production.
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
