# Phase 7 Export, Import, and Polish

Phase 7 completes project portability and operational visibility for the local MVP.

## User flow

1. Open a project dashboard with script, Asset Bible, storyboard, video, and collaboration data.
2. Use **Export bundle** in the Export and operations panel.
3. The app writes a versioned `.assemblyline-bundle.json` manifest under the project's `exports` folder and copies referenced media into the export media folder when the source files are available.
4. Use **Import latest** to parse the most recent bundle and restore it into a new imported project.
5. Review storage usage, orphan file counts, job metrics, Sentry status, and the remaining provider adapter capability list from the same panel.

## Bundle contents

Each bundle includes:

- `bundleVersion`
- exported project metadata
- project style
- script, scene, shot, asset, storyboard, video, review, collaboration, job, and event metadata
- media inventory with source paths, bundled paths, media type, and existence status
- import instructions

Provider API keys are excluded from the manifest and must be reconfigured in the destination workspace.

## Operations API

`GET /api/projects/:projectId/operations` returns:

- export bundles for the project
- storage usage and warnings
- job metrics and queue health
- remaining adapter capabilities

`POST /api/projects/:projectId/operations` supports:

- `{ "action": "export" }`
- `{ "action": "import", "manifestPath": "..." }`
- `{ "action": "cleanup_orphans" }`
- `{ "action": "clear_thumbnails" }`

Export and import require the `export_project` permission. Storage cleanup requires project settings permission.

## Remaining adapters

The provider layer now exposes local mock-backed capability adapters for:

- ByteDance/Seedance
- Pika
- Luma
- ElevenLabs

These adapters use the shared provider contracts and deterministic mock factory so tests and local verification do not call real external APIs.

## Observability and storage management

The app reports structured JSON logs through `pino`, tracks whether `SENTRY_DSN` is configured, summarizes jobs by type/status/retry attempts, surfaces queue health, scans project storage for orphan files, and clears generated thumbnail cache files.

## Verification

Phase 7 is verified by unit/integration tests that:

- export a populated project bundle,
- confirm the bundle has schema version `1`,
- confirm provider keys are not exported,
- import the bundle after resetting the in-memory store,
- compare restored scenes, shots, assets, storyboard frames, and video clips,
- check job metrics,
- detect and clean an orphan file,
- verify the remaining adapter capability matrix.
