# Provider and Model Strategy

AI AssemblyLine uses provider adapters so models and APIs can change without rewriting the production workflow.

## Provider principles

- Users bring their own API keys.
- Model selectors are transparent and visible in the UI.
- The app should not hide model routing behind opaque automation.
- Provider capabilities should be stored and displayed so users understand tradeoffs.
- Provider-specific prompts and settings should be generated from a common internal production plan.

## Initial provider targets

The architecture should support adapters for:

- OpenAI
- ByteDance/Seedance
- Runway
- Pika
- Kling
- Luma
- ElevenLabs
- Stability
- Replicate

## Adapter categories

### Text and reasoning

Used for script analysis, scene breakdown, asset detection, shot planning, prompt generation, continuity checks, review summaries, and metadata repair.

### Image generation and editing

Used for asset reference sheets, style exploration, storyboard frames, variations, and image edits based on markup or prompt changes.

### Video generation and editing

Used for text-to-video, image-to-video, storyboard-to-video, clip extension, and video edits when supported by a provider.

### Audio and voice

Not required for MVP lip sync, but the provider layer should allow future voice, music, sound effects, and dialogue timing integrations.

## Capability matrix fields

Each provider/model entry should track:

- provider name
- model ID
- media type
- supports text-to-image
- supports image editing
- supports reference images
- supports character consistency
- supports text-to-video
- supports image-to-video
- supports video extension
- supports seeds
- supports transparent background
- supports 1080p or higher
- maximum image count
- maximum video duration
- aspect ratios
- average latency
- requires asynchronous polling
- supports webhooks
- safety restrictions
- cost notes entered by the user or admin

## API key handling

Users should add provider API keys through project or workspace settings. Keys should be encrypted at rest and never exposed in generation logs, prompts, exports, or client-side code.

## Model selector behavior

For every generation job, users should be able to see and choose:

- provider
- model
- quality mode
- resolution
- duration
- aspect ratio
- reference inputs
- seed or reproducibility setting when supported
- provider-specific options

The app may recommend models, but final selection should remain transparent and user-controlled.
