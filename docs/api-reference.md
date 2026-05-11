# API Reference

All project endpoints require an authenticated local session unless noted.

## Project operations

### `GET /api/projects/:projectId/operations`

Returns export bundles, storage usage, job metrics, queue health, Sentry status, and remaining adapter capabilities for a project. Job metrics include totals by type/status, average completed duration, total retry attempts, retried job count, and retry attempts by job type.

### `POST /api/projects/:projectId/operations`

Request bodies:

```json
{ "action": "export" }
```

Creates a versioned project bundle manifest and copies available media into the export folder.

```json
{ "action": "import", "manifestPath": "C:\\path\\to\\project.assemblyline-bundle.json" }
```

Restores the bundle into a new imported project in a new workspace for the current user.

```json
{ "action": "cleanup_orphans" }
```

Deletes files in project storage that are not referenced by project metadata.

```json
{ "action": "clear_thumbnails" }
```

Deletes cached thumbnail files. Thumbnails may be regenerated later.

## Core workflow endpoints

- `GET /api/projects/:projectId/events` opens the project SSE stream.
- `POST /api/projects/:projectId/scripts` uploads script text. In inline mode, the response includes the completed deterministic analysis. In Redis queue mode, the response includes the uploaded active script version with `analysisStatus: "pending"` and a queued `script_analysis` job; clients should follow the project SSE stream for progress and refresh the graph after completion.
- `PATCH /api/projects/:projectId/scripts` re-runs analysis while preserving user edits. It follows the same inline versus Redis queue behavior as upload.
- `POST /api/projects/:projectId/asset-bible` manages asset details, references, generation, lifecycle, merge, split, and style actions.
- `POST /api/projects/:projectId/storyboards` generates frames, ingests sketches, saves markup, comments, and frame approvals.
- `POST /api/projects/:projectId/videos` generates shot or scene clips and updates clip review status.
- `POST /api/projects/:projectId/collaboration` manages invitations, member roles, assignments, and invitation acceptance.

Error responses use:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable message."
  }
}
```
