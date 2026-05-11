# Asset Bible Specification

The Asset Bible is the continuity system for AI AssemblyLine. Every image and video generation should reference approved Asset Bible records whenever those assets appear in a scene or shot. For the underlying data model and type-extension tables, see [data-model.md](data-model.md). For the versioning lifecycle of storyboard frames and video clips that depend on these assets, see [storyboard-and-video.md](storyboard-and-video.md).

## Global visual style

Each project has one locked visual style. The style record includes:

- style name
- canonical style description
- approved style references
- color palette
- lighting rules
- rendering medium
- lens/camera language
- negative style constraints
- model-specific prompt fragments
- approval status

Changing the locked style should warn users that existing storyboards and clips may need regeneration.

## Supported MVP asset types

### Characters

Character records include:

- canonical name and aliases
- role and narrative description
- physical description
- personality and performance notes
- approved wardrobe records
- front, side, and back turnaround references
- expression sheet
- pose sheet
- scale reference
- approved close-up face references
- negative prompts and forbidden changes
- continuity notes

Age variants are intentionally excluded from the MVP.

### Wardrobes

Wardrobe records can be attached to one or more characters and include:

- outfit name
- story context
- front, side, and back references
- material and texture notes
- accessories
- approved color palette
- continuity rules

### Locations

Location records include full 360-degree coverage when the location recurs or needs multi-shot consistency. They include:

- canonical name
- scene usage
- floor plan or spatial notes
- north/east/south/west orientation references
- entrance and exit positions
- major set dressing
- lighting states
- camera-safe zones
- continuity constraints

### Creatures and animals

Creature and animal records include:

- species/type
- anatomy notes
- scale reference
- front, side, and back references
- expression or behavior sheet when relevant
- movement notes
- texture/fur/skin details
- continuity constraints

### Close-up props

Only props that appear close up or require multi-shot consistency need full Asset Bible records. Prop records include:

- prop name
- owner or scene association
- front, side, and back references when needed
- material and wear details
- scale reference
- interaction notes
- continuity constraints

## Asset lifecycle

Assets use the following statuses:

- `missing`: required by the script but no usable reference exists.
- `draft`: references or descriptions exist but have not been reviewed.
- `needs_review`: ready for user or team review.
- `approved`: usable for downstream storyboard or video generation.
- `locked`: approved and protected from accidental edits.
- `superseded`: replaced by a newer approved version.
- `rejected`: intentionally not used.

## User controls

Users can:

- upload reference images
- request AI-generated reference sheets
- iterate generated references
- compare versions
- approve references
- reject variants
- merge duplicate assets
- split incorrectly merged assets
- mark detected assets as unnecessary
- add missing assets manually
- lock or unlock assets with warnings

Merge persistence is atomic in Prisma mode: scene and shot requirement reassignment, the superseded source asset update, and the canonical target asset update commit in one database transaction. If any merge write fails, production must reject the whole merge instead of leaving requirements pointed at a different asset than the saved asset lifecycle state.

Reference upload/generation persistence is also atomic in Prisma mode: the `AssetVersion` row and its attached `AssetReference` row commit in one database transaction. If either write fails, production must reject the whole reference save so downstream storyboard and video prompts cannot see an orphaned version or a reference pointing at a missing version.

Typed detail persistence is atomic in Prisma mode as well: the base `Asset` update and the matching character, wardrobe, location, creature, or prop detail upsert commit together. If a detail write fails, production must reject the whole save instead of leaving canonical asset metadata out of sync with its type-specific continuity fields.

## Reference generation policy

The system should ask for reference images for required assets, but it should only generate missing reference images when the user explicitly requests generation. On-request generation keeps creative control with the user and prevents unnecessary API spending.

## Scene and shot dependency logic

Each scene and shot tracks the assets it requires. A scene or shot is storyboard-ready when all required assets for that specific unit are approved or locked. This enables partial progression through production without waiting for the entire Asset Bible to reach 100% completion.

Readiness refresh persistence is atomic in Prisma mode: all recalculated scene and shot statuses commit in one database transaction. If any status write fails, production must reject the whole refresh instead of leaving scene readiness updated separately from shot readiness.

See [data-model.md](data-model.md) for the cascading staleness rules that apply when approved assets are superseded or the project style changes after storyboard frames or video clips have already been generated.
