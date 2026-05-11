# Data, Collaboration, and Export Plan

AI AssemblyLine supports both individual creators and teams. Production data should be structured, versioned, and exportable. For the full entity schema and relationships, see [data-model.md](data-model.md). For authentication and roles, see [auth-and-access.md](auth-and-access.md).

## Core data objects

- `User`: authenticated user identity, email, display name.
- `Workspace`: owner, members, billing/settings metadata, provider keys.
- `WorkspaceMember`: join between User and Workspace with workspace role.
- `Project`: title, style, target format, storage path, permissions.
- `ProjectMember`: join between User and Project with project role.
- `ProjectStyle`: locked visual style for a project (one per project).
- `ProviderKey`: encrypted API key for a provider, scoped to a workspace.
- `Script`: source file, parsed text, analysis status.
- `ScriptVersion`: versioned script content with analysis status.
- `Scene`: script range, location, required assets, status.
- `Shot`: scene link, action, camera notes, required assets, storyboard status, video status.
- `Asset`: canonical continuity entity with type discriminator.
- `CharacterDetail`, `WardrobeDetail`, `LocationDetail`, `CreatureDetail`, `PropDetail`: type-specific extension tables.
- `AssetVersion`: versioned description, references, prompt fragments, approval status.
- `AssetReference`: uploaded or generated media file attached to an asset version.
- `SceneAssetReq`, `ShotAssetReq`: join tables linking scenes/shots to required assets.
- `StoryboardFrame`: shot link, keyframe index.
- `FrameVersion`: versioned generated image with prompt, status, and staleness tracking.
- `VideoClip`: shot or scene link for generated video.
- `ClipVersion`: versioned video clip with source frame references and staleness tracking.
- `GenerationJob`: provider, model, inputs, outputs, logs, progress, errors, cost tracking.
- `JobEvent`: real-time progress events emitted by generation jobs.
- `ReviewNote`: comments, markup references, assignee, status, timestamps.
- `ExportBundle`: exported media, metadata, project manifest, bundle schema version.
- `Invitation`: pending workspace or project invitation with signed token and expiry.

For full field definitions, cardinalities, and the ERD, see [data-model.md](data-model.md).

## Collaboration

Team mode should include:

- workspace membership
- project roles
- assignments
- review comments
- status filters
- approval history
- locked asset warnings
- activity feed

Suggested roles:

- `owner`: manages workspace, project settings, provider keys, exports, and deletion.
- `producer`: manages workflow, approvals, assignments, and generation settings.
- `artist`: uploads references, edits assets, storyboards, and markup.
- `reviewer`: comments and approves assigned work.
- `viewer`: read-only access.

## Real-time updates

The app should show live generation progress for script analysis, asset reference generation, storyboard generation, video generation, exports, and imports. Real-time updates should include:

- queued
- running
- provider submitted
- polling provider
- processing output
- complete
- failed
- canceled

## Local filesystem storage

The MVP stores media on the local filesystem. Project metadata in the database should reference local file paths rather than embedding large binary files.

Recommended folders:

- `projects/{projectIdWithoutDashes}/uploads`
- `projects/{projectIdWithoutDashes}/assets`
- `projects/{projectIdWithoutDashes}/storyboards`
- `projects/{projectIdWithoutDashes}/videos`
- `projects/{projectIdWithoutDashes}/exports`
- `projects/{projectIdWithoutDashes}/logs`
- `projects/{projectIdWithoutDashes}/thumbnails`

Project storage directory names remove UUID dashes and reject path separators or traversal characters. This keeps cleanup, thumbnail, export, and media-write operations inside the configured `STORAGE_ROOT`.

Project creation verifies that the project's storage folders can be created before the Prisma project row is written. A storage setup failure should abort creation instead of leaving a production project record with missing media directories.

### Storage management

- **Disk usage tracking:** The dashboard shows total storage used per project and per workspace. Configurable warning thresholds (default: 80% and 95% of available disk) trigger user-visible alerts.
- **Orphan cleanup:** When a generation job fails mid-write, any partially written output files are cleaned up by the job's error handler. A periodic background task (daily) scans for files in project directories that have no corresponding database record and flags them for review.
- **Thumbnail cache:** Thumbnails are generated on-demand by the `media` queue and stored in the `thumbnails` directory. Thumbnails can be safely deleted and regenerated.
- **Windows path considerations:** All path construction uses `path.join()` and avoids hardcoded separators. Total path length is kept under 260 characters by using short project IDs (UUIDs without dashes) and flat directory structures. The storage root should be as short as feasible (e.g. `C:\asmline` rather than deeply nested paths).

## Export and import

Users should be able to export a complete project bundle. A bundle should include:

- project manifest JSON
- script files
- Asset Bible metadata
- approved and rejected reference media
- storyboard frames and metadata
- video clips and metadata
- generation settings
- provider/model names used
- review notes and approvals
- import instructions

Provider API keys must never be included in exports.

Bundle imports persist their restored project graph in one database transaction. Historical generation jobs are restored before imported media/version rows that may reference them. If any imported record fails validation or persistence, the production database should not be left with a partially restored script, storyboard, video, or review graph.

Generated script analysis graph persistence also commits as a single database transaction. The write replaces generated scenes, shots, and requirements while preserving user-edited scenes and shots, and detected asset upserts are committed with the regenerated requirement links so a failed analysis write does not leave a partially replaced production dependency graph.

Asset Bible merge persistence commits requirement reassignment and both source/target asset lifecycle updates in one database transaction. A failed merge write should not leave production requirements reassigned without the corresponding superseded source and canonical target asset updates.

Generated storyboard frame persistence commits the storyboard frame upsert, frame version insert, shot status update, and related generation-job completion in one database transaction. A failed generated-frame write should not leave a production shot marked storyboarded without the frame version and completed generation job that justify that status.

Generated video clip persistence commits the video clip upsert, clip version insert, and related generation-job completion in one database transaction. A failed generated-clip write should not leave a production clip record without the version and completed generation job that justify it.

Frame and clip approval persistence commits the prior-version superseding write and the selected-version approval write in one database transaction. A failed approval should not leave prior approved media superseded unless the newly selected frame or clip version is also approved.

## Rights and safety controls

Projects should include a user-selectable rights and safety setting. Users can choose whether their project allows uploaded references involving copyrighted characters, real people, brand assets, client-owned material, or restricted likenesses. The app should record the setting and surface provider restrictions before generation jobs are submitted.

## Script revision behavior

When a user uploads a new script revision mid-production:

1. A new `ScriptVersion` is created and marked as the active version.
2. The system runs a fresh analysis on the new version, producing new Scene and Shot records.
3. Previous scenes and shots (from the old version) are marked `superseded` but preserved with their storyboards, clips, and review notes intact.
4. Asset records carry forward automatically — the same Asset Bible applies across script versions.
5. Scene/shot ↔ asset requirement links are regenerated by analysis but can reference existing assets by canonical name matching.
6. Users resolve conflicts through the asset-requirement editor: new assets detected in the revised script appear as `missing`, and assets no longer referenced appear as warnings.
7. Re-analysis of a single scene preserves user edits to that scene by default, only adding newly detected items unless the user explicitly chooses a full reset.

Script revision upload persistence commits any new script row, prior-version deactivation, and new active `ScriptVersion` creation in one database transaction. A failed upload write should not leave previous script versions inactive without the replacement version.

See [script-analysis.md](script-analysis.md) for the analysis pipeline details.
