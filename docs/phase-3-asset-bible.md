# Phase 3 Asset Bible

Phase 3 turns detected script assets into a reviewable Asset Bible with versioned references and dependency unlocking.

## Implemented user flow

1. Run Phase 2 script analysis from a project dashboard.
2. Review detected assets in the Assets and requirements panel.
3. Add continuity/detail notes per asset type.
4. Generate a missing reference sheet on request with the Stability image adapter.
5. Approve or lock assets.
6. Confirm dependent scenes and shots become ready when their required assets are approved or locked.

## Runtime endpoints

- `GET /api/projects/{projectId}/asset-bible` returns the project analysis graph including asset details, versions, references, requirements, jobs, and events.
- `POST /api/projects/{projectId}/asset-bible` accepts JSON lifecycle actions:
  - `detail` updates type-specific Asset Bible fields.
  - `generate` creates an on-request generated reference version.
  - `status` transitions assets through `missing`, `draft`, `needs_review`, `approved`, `locked`, `superseded`, or `rejected`.
  - `merge` redirects requirements from a duplicate asset to a canonical asset.
  - `split` creates a new asset from an incorrectly merged one.
  - `style` updates the project style and warns when changing a locked style.
- Asset detail, status, merge, and split actions require every referenced asset ID to belong to the route `projectId`; cross-project asset IDs return `not_found` and are not mutated.
- The same endpoint accepts multipart image upload and stores uploaded references under the project asset folder.

## Provider and media behavior

- OpenAI remains the first image adapter from Phase 1.
- Stability is available as the second image adapter for generated reference variety.
- Automated tests and local verification use deterministic mock image bytes when no real provider keys are configured.
- With a workspace Stability key or `STABILITY_API_KEY`, Asset Bible reference generation calls the live Stability image API. Run `npm run smoke:stability` before enabling live Stability generation in production.
- Uploaded image references accept non-empty PNG, JPEG, WebP, TIFF, and BMP files. Unsupported image formats fail with `unsupported_media_type`; empty uploads fail with `empty_media`.
- Multipart reference uploads that omit the file part fail with `missing_upload_file`; uploads without a valid `assetId` fail with `missing_upload_target`.
- Generated and uploaded references create `AssetVersion` and `AssetReference` records after media bytes are successfully written, so failed upload storage writes do not leave orphaned versions.

## Lifecycle and unlocking

- Missing script-detected assets start as `missing`.
- Adding details or references moves assets toward review.
- Approving or locking all required assets for a scene or shot marks that scene or shot as `ready`.
- Unlocking a locked asset records an acknowledgement note so operators can see the continuity risk.

## Local verification

Use:

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then run script analysis in the browser, generate a reference for a detected asset, approve or lock required assets, and confirm the Asset Bible lifecycle panel updates reference counts and scene/shot readiness.
