# Phase 2 Script Pipeline

Phase 2 adds a runnable script-analysis workflow on top of the Phase 1 foundation.

## Implemented user flow

1. Sign in and open a project dashboard.
2. Paste or edit script text in the Script analysis panel.
3. Select **Upload and analyze**.
4. Review generated scenes, shots, detected assets, and the dependency-link summary.
5. Edit scene summaries and shot user direction inline.
6. Select **Re-analyze** to run analysis again while preserving user-edited scene metadata.

The local development pipeline uses a deterministic analyzer that follows the three-pass shape from `script-analysis.md`: scene extraction, shot breakdown, and asset detection/deduplication. When a workspace OpenAI key or `OPENAI_API_KEY` is configured, queued analysis jobs are labeled as OpenAI work and the worker runs the provider-backed three-pass analysis path. Without live credentials, deterministic local fallback remains available only for development and tests.

## Runtime endpoints

- `POST /api/projects/{projectId}/scripts` accepts JSON script text or multipart file upload, creates a `ScriptVersion`, stores the file under project uploads, runs analysis, and returns the analysis graph.
- `PATCH /api/projects/{projectId}/scripts` re-runs analysis for the active script version and preserves user-edited scene records.
- `GET /api/projects/{projectId}/analysis` returns scripts, active version, scenes, shots, assets, requirement links, jobs, and events.
- `PATCH /api/projects/{projectId}/scenes/{sceneId}` updates editable scene metadata.
- `PATCH /api/projects/{projectId}/shots/{shotId}` updates editable shot metadata and user direction.
- `PATCH /api/projects/{projectId}/assets/{assetId}` updates detected asset metadata/status.
- `POST` and `DELETE /api/projects/{projectId}/requirements` add or remove scene-to-asset requirement links.
- Scene, shot, asset, and requirement IDs must belong to the route `projectId`; cross-project IDs return `not_found` and are not mutated.

## Analysis behavior

- Scene headings are detected from `INT.`, `EXT.`, `INT/EXT.`, and `I/E.` slug lines.
- Scripts without slug lines produce one review-warning scene so the user can correct the analysis.
- Shots are generated from scene action blocks with camera and lighting suggestions.
- Assets are deduplicated by canonical name and include detected locations, character cues, and close-up or interaction props.
- Each analysis creates a `script_analysis` job and emits progress events at scene extraction, shot breakdown, asset detection, and completion.
- Uploading a newer script version marks previous scenes and shots as `superseded` while preserving their records.

## Local verification

Use:

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then open a project dashboard, run the script-analysis panel, save at least one scene or shot edit, re-analyze, and confirm the analysis counts, editable breakdown, requirement graph summary, and SSE connection remain visible.
