# Storyboard and Video Workflow

AI AssemblyLine creates storyboards and video clips from script analysis, approved Asset Bible records, storyboard metadata, and user direction.

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

## Optional sketch storyboard input

Users can upload existing sketch storyboard images. The system should use these sketches as composition guidance and preserve layout, staging, and camera intent as closely as realistically possible while applying the locked visual style and approved Asset Bible references.

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

## Video generation modes

### Shot-by-shot generation

Shot-by-shot generation is the primary control mode. It uses approved storyboard frames and shot metadata to create clips with strong continuity review between shots.

### Scene-level generation

Scene-level generation is an optional mode for users who want to experiment with longer continuous motion or fewer cuts. It should still reference the same Asset Bible and storyboard metadata, but users should expect less granular control.

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

## Out-of-scope MVP features

Synchronized dialogue and lip sync are not required in the MVP. The architecture should leave room for future audio, voice, and lip-sync providers, but video clip generation should not depend on those capabilities initially.
