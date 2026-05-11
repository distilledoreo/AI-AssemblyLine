# Phase 4 Storyboard

Phase 4 adds storyboard generation for shots whose required assets are approved or locked.

## Implemented user flow

1. Run script analysis.
2. Generate/approve Asset Bible references until shots are ready.
3. Generate a storyboard frame for a ready shot.
4. Mark up the frame with stored Fabric-compatible annotation JSON.
5. Add a frame-level review comment.
6. Approve the frame version.
7. See approved frame counts and stale warnings when upstream asset status changes.

## Runtime endpoints

- `GET /api/projects/{projectId}/storyboards` returns the project graph with storyboard frames, frame versions, and review notes.
- `POST /api/projects/{projectId}/storyboards` accepts JSON actions:
  - `generate` creates a frame/version for a shot keyframe index from 0-8.
  - `frame` updates frame version status or annotation data.
  - `comment` adds a threaded frame review note.
- Inline and queued storyboard generation both reject keyframe indexes outside 0-8 with `bad_keyframe` before creating frame records.
- The same endpoint accepts multipart sketch upload and validates non-empty PNG, JPEG, WebP, and TIFF inputs; empty uploads fail with `empty_media`.

## Prompt and frame behavior

- Prompt composition combines project style, negative constraints, scene summary, shot metadata, approved required assets, and user direction.
- Locked style conflicts override user direction and create prompt warnings.
- Provider prompt budgets trigger truncation warnings.
- Frame regeneration creates a new preserved version.
- Approving a frame supersedes previously approved versions for the same frame.
- Annotation data is stored as Fabric-compatible vector JSON so it can back a richer drawing layer without baking markup into the image.

## Local verification

Use:

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then run the project flow through Asset Bible approval, generate a frame, apply markup, add a comment, approve the frame, and confirm the storyboard panel reports the approved frame.
