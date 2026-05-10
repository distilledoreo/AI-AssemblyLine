# Data, Collaboration, and Export Plan

AI AssemblyLine supports both individual creators and teams. Production data should be structured, versioned, and exportable.

## Core data objects

- `Workspace`: owner, members, billing/settings metadata, provider keys.
- `Project`: title, style, target format, storage path, permissions.
- `Script`: source file, parsed text, analysis status, versions.
- `Scene`: script range, location, required assets, status.
- `Shot`: scene link, action, camera notes, required assets, storyboard status, video status.
- `Asset`: canonical continuity entity.
- `AssetVersion`: versioned description, references, prompt fragments, approval status.
- `AssetReference`: uploaded or generated media file attached to an asset.
- `StoryboardFrame`: shot link, keyframe index, prompt, image file, status.
- `VideoClip`: shot or scene link, source frames, provider metadata, file path, status.
- `GenerationJob`: provider, model, inputs, outputs, logs, progress, errors.
- `ReviewNote`: comments, markup references, assignee, status, timestamps.
- `ExportBundle`: exported media, metadata, project manifest, and import instructions.

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
