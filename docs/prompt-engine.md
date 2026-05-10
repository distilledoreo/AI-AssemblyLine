# Prompt Engine

The prompt engine composes generation prompts from multiple sources, resolves conflicts, handles token limits, and translates prompts into provider-specific formats.

## Architecture

The prompt engine is a pure function layer (no side effects) that sits between the production data and the provider adapters:

```
Production Data → Prompt Engine → Provider Adapter → API Call
```

The engine receives a `PromptContext` object containing all source material and returns a `ComposedPrompt` ready for the adapter.

## Prompt context sources

Each generation job collects sources from the database into a `PromptContext`:

| Source | Priority | Used for |
|--------|----------|----------|
| Project style | 1 (highest) | Every generation. Locked style overrides all other visual direction |
| Negative constraints | 2 | Style and asset negatives. Always included |
| Asset references | 3 | Approved reference images for characters, wardrobes, locations, etc. in the shot |
| Asset descriptions | 4 | Text descriptions from approved asset versions |
| Script excerpt | 5 | The relevant script text for the scene/shot |
| Shot metadata | 6 | Camera angle, movement, lens, lighting, action |
| Scene summary | 7 | Scene-level context |
| User direction | 8 | Per-job user input. Can override shot metadata but not style |
| Continuity constraints | 9 | Notes from the asset bible and previous frames |
| Provider prompt fragments | 10 (lowest) | Model-specific tuning phrases from style or asset records |

## Conflict resolution

When sources conflict, priority order applies:

1. **Style vs. user direction:** The locked project style always wins. If a user's direction contradicts the style (e.g. "make it photorealistic" when the style is "watercolor"), the engine drops the conflicting user direction and logs a warning shown in the UI.
2. **Asset descriptions vs. shot metadata:** Asset descriptions provide the "what" (character appearance), shot metadata provides the "how" (camera, lighting). These rarely conflict. When they do (e.g. lighting notes on a location asset vs. shot lighting), shot metadata wins for camera/lighting and asset descriptions win for appearance.
3. **Multiple assets in one frame:** All required assets for the shot are included. If the combined descriptions exceed the token budget, assets are prioritized by screen prominence: characters > wardrobe > locations > props > creatures (unless the shot specifically features a creature).

## Token budget and truncation

Different providers have different prompt length limits. The engine manages this with a budget system:

1. **Calculate the total token budget** from the provider/model's max prompt length (stored in the capability matrix).
2. **Reserve fixed budgets** for high-priority sections:
   - Style description: up to 15% of budget
   - Negative constraints: up to 10%
   - Provider prompt fragments: up to 5%
3. **Allocate remaining budget** proportionally across asset descriptions, script excerpt, shot metadata, and user direction.
4. **Truncation strategy:** If a section exceeds its allocation, truncate from the end of the text, preferring to keep the first sentence (which usually contains the most critical information). Never truncate asset names or negative constraints.

## Reference image handling

Reference images (approved AssetReferences) are attached differently depending on the provider:

| Provider capability | Handling |
|--------------------|----------|
| Supports reference images natively | Pass image file paths or URLs to the adapter. The adapter handles upload/attachment per provider API |
| Supports image-to-image but not reference images | Use the primary reference as the base image with the composed text prompt |
| Text-only prompt (no image input) | Embed detailed text descriptions from the asset version. Include a warning in the job log that reference images could not be used |

The prompt engine includes the reference image metadata (which images were attached and in what role) in the `ComposedPrompt` so the adapter knows how to handle them.

## Provider translation

The engine produces a provider-agnostic `ComposedPrompt`:

```typescript
interface ComposedPrompt {
  positivePrompt: string;
  negativePrompt: string;
  referenceImages: ReferenceAttachment[];
  generationSettings: {
    width: number;
    height: number;
    seed?: number;
    qualityMode?: string;
    duration?: number;        // video only
    aspectRatio?: string;
  };
  metadata: {
    sourceIds: string[];      // IDs of all assets, frames, etc. used
    truncationWarnings: string[];
    conflictWarnings: string[];
  };
}
```

Each provider adapter transforms this into its native API format:

- **OpenAI:** Maps `positivePrompt` to `prompt`, `negativePrompt` is appended as "Avoid: ..." suffix, references attached via the images API.
- **Stability:** Maps to `text_prompts` array with positive and negative weights.
- **Runway / Kling:** Maps to their respective `prompt` + `image` fields, with duration and aspect ratio parameters.

Adapters are responsible for any provider-specific quirks (e.g. prompt length limits stricter than the capability matrix suggests, special tokens, or formatting requirements).

## Prompt templates

The engine uses composable template sections rather than a single monolithic template. Each section is a function that takes relevant context and returns a string:

```
[STYLE BLOCK]
[NEGATIVE BLOCK]
[SCENE CONTEXT BLOCK]
[SHOT DESCRIPTION BLOCK]
[CHARACTER BLOCKS (one per character in shot)]
[ENVIRONMENT BLOCK]
[CAMERA BLOCK]
[USER DIRECTION BLOCK]
[CONTINUITY BLOCK]
[PROVIDER FRAGMENTS BLOCK]
```

Sections are concatenated with double newlines. Empty sections are omitted. This modular approach makes it easy to test individual sections and adjust ordering.

## Storyboard vs. video prompt differences

| Aspect | Storyboard (image) prompt | Video prompt |
|--------|--------------------------|--------------|
| Motion | Static composition description | Movement description, action verbs, camera motion |
| Duration | N/A | Included as a generation setting |
| Keyframes | Single frame description | May reference start and end keyframe descriptions |
| Temporal continuity | References previous frame if multi-keyframe shot | References the storyboard frame as the starting image |

The engine has separate composition modes (`image` and `video`) that adjust section content and emphasis accordingly.

## Debugging and transparency

Every `ComposedPrompt` is stored on the GenerationJob record in `inputPayload`. Users can inspect the exact prompt that was sent for any generation job. This supports the project's transparency principle and helps users understand why a generation produced specific results.
