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

- `projects/{projectId}/uploads`
- `projects/{projectId}/assets`
- `projects/{projectId}/storyboards`
- `projects/{projectId}/videos`
- `projects/{projectId}/exports`
- `projects/{projectId}/logs`
- `projects/{projectId}/thumbnails`

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

See [script-analysis.md](script-analysis.md) for the analysis pipeline details.
