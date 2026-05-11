# Storyboard and Video Workflow

AI AssemblyLine creates storyboards and video clips from script analysis, approved Asset Bible records, storyboard metadata, and user direction. For prompt composition details, see [prompt-engine.md](prompt-engine.md). For asset requirements and the dependency system, see [asset-bible.md](asset-bible.md).

## Storyboard generation

Each shot must support at least one storyboard frame. Complex shots can use up to nine keyframes to describe motion, camera movement, action beats, or emotional transitions.

Storyboard prompts should combine:

- locked project style
- script excerpt
- scene summary
- shot description
- approved character, wardrobe, location, creature, animal, and close-up prop references
- camera angle
- lens and framing notes
- lighting notes
- user direction
- continuity constraints

See [prompt-engine.md](prompt-engine.md) for the full composition, conflict resolution, and truncation strategy.

## Optional sketch storyboard input

Users can upload existing sketch storyboard images. The system should use these sketches as composition guidance and preserve layout, staging, and camera intent as closely as realistically possible while applying the locked visual style and approved Asset Bible references.

### Sketch ingestion failure handling

| Situation | Behavior |
|-----------|----------|
| Sketch is too rough or abstract to parse | The system generates the frame using only the text prompt and shot metadata, ignoring composition guidance. The user sees a warning: "Sketch could not be used as composition reference. The frame was generated from text only." |
| Sketch conflicts with approved asset references | Asset references take priority. The system preserves sketch composition (camera angle, staging, character positions) but overrides appearance with approved assets. The user sees a note explaining which elements were overridden. |
| Sketch depicts assets not in the Asset Bible | Unknown elements are treated as background or set dressing. The system does not create new Asset Bible records from sketches. The user sees a suggestion to add missing assets manually if they should be tracked for continuity. |
| Sketch image is corrupted or unsupported format | The system rejects the upload with a clear error message listing supported formats (PNG, JPEG, WebP, TIFF). |

## Storyboard editor

The storyboard editor should include:

- prompt refinement
- regenerate frame
- create variation
- compare versions
- approve frame
- reject frame
- drawing tools
- markup tools
- notes and threaded comments
- keyframe ordering
- shot metadata editing

### Drawing and markup tools

The storyboard editor includes an **annotation layer** for feedback and direction. Rather than building a full canvas drawing application from scratch, the implementation should integrate an existing open-source library:

**Recommended:** [tldraw](https://github.com/tldraw/tldraw) or [Fabric.js](http://fabricjs.com/).

The annotation layer should support:

- Freehand drawing (pen tool with adjustable size and color)
- Arrows and lines
- Rectangles and ellipses
- Text labels
- Color picker (at minimum 8 preset colors plus custom)
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Clear all annotations
- Toggle annotation visibility (show/hide overlay)
- Export annotated frame as a single flattened image for review sharing

Annotations are stored as vector data alongside the frame, not baked into the image. This allows annotations to be toggled on/off and edited independently of the frame image.

## Frame versioning lifecycle

Storyboard frames use a versioning model parallel to asset versioning:

| Status | Meaning |
|--------|---------|
| `draft` | Generated but not yet reviewed |
| `needs_review` | Submitted for team review |
| `approved` | Accepted for downstream video generation |
| `rejected` | Not usable; user may regenerate |
| `superseded` | Replaced by a newer approved version |
| `stale` | An upstream dependency (asset or style) changed after approval |

### Version behavior

- **Regenerating** a frame creates a new `FrameVersion` with status `draft`. The previous version is preserved.
- **Creating a variation** also creates a new `FrameVersion`. The prompt is pre-filled from the source version for easy modification.
- **Generated-frame persistence** commits the storyboard frame upsert, new frame version, shot storyboard status, and related generation-job completion in one Prisma transaction.
- **Approving** a new version automatically sets the previous approved version to `superseded`.
- **Staleness** is set automatically when upstream assets or the project style change (see [data-model.md](data-model.md) for cascading rules). Users see a warning banner and can dismiss it or regenerate.

## Video generation modes

### Shot-by-shot generation

Shot-by-shot generation is the primary control mode. It uses approved storyboard frames and shot metadata to create clips with strong continuity review between shots.

**Input requirements:**
- At least one approved FrameVersion for the shot.
- All shot-required assets in `approved` or `locked` status.

**Output:** One VideoClip with one or more ClipVersions.

### Scene-level generation

Scene-level generation is an optional mode for users who want to experiment with longer continuous motion or fewer cuts. It should still reference the same Asset Bible and storyboard metadata, but users should expect less granular control.

**Input requirements:**
- All shots in the scene must have at least one approved FrameVersion.
- All scene-required assets in `approved` or `locked` status.
- If some shots are not yet storyboarded, scene-level generation is blocked. The UI shows which shots are missing.

**Composition rules:**
- The prompt engine combines the scene summary with all shot descriptions and approved keyframes in order.
- The scene's approved storyboard frames are provided as a keyframe sequence (first frame of each shot) to guide visual continuity.
- Duration is the sum of estimated shot durations (user-configurable, default 3 seconds per shot, capped at the provider's maximum video duration).
- If total duration exceeds the provider's max, the system splits into multiple clips and logs a warning.

**Output:** One VideoClip linked to the Scene (not individual shots), with one or more ClipVersions.

## Clip versioning lifecycle

Video clips use the same status model as frames:

| Status | Meaning |
|--------|---------|
| `draft` | Generated but not yet reviewed |
| `needs_review` | Submitted for team review |
| `approved` | Accepted for export or scene reel assembly |
| `rejected` | Not usable; user may regenerate |
| `superseded` | Replaced by a newer approved version |
| `stale` | An upstream storyboard frame was re-approved or an asset changed |

Each ClipVersion records which FrameVersion IDs were used as input. When any of those FrameVersions are superseded or go stale, the ClipVersion is automatically marked `stale`.

Generated video clip persistence commits the video clip upsert, new clip version, and related generation-job completion in one Prisma transaction.

## Video prompt sources

Video generation should use:

- approved Asset Bible records
- storyboard frame or keyframe references
- script direction
- camera metadata
- user direction
- movement notes
- continuity constraints
- provider-specific generation settings

See [prompt-engine.md](prompt-engine.md) for the video-specific composition mode.

## Out-of-scope MVP features

Synchronized dialogue and lip sync are not required in the MVP. The architecture should leave room for future audio, voice, and lip-sync providers, but video clip generation should not depend on those capabilities initially.

