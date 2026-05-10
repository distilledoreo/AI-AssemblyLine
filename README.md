# AI AssemblyLine

AI AssemblyLine is a planned full-stack production platform for transforming scripts and Asset Bibles into storyboard images and AI-generated video clips for short films.

The app is designed for both single creators and production teams. It will analyze uploaded scripts, identify required assets, help users complete a continuity-focused Asset Bible, unlock scenes as their required assets become available, generate storyboard frames, and produce video clips through transparent user-selected AI provider APIs.

## Product direction

- **Output target:** storyboard frames and video clips for short films.
- **Users:** single-user creators and team production workspaces.
- **Workflow:** script analysis, Asset Bible creation, partial scene unlocking, storyboard generation, video generation, review, export/import.
- **Visual continuity:** one locked project style plus approved character, wardrobe, location, creature/animal, and close-up prop references.
- **Generation control:** bring-your-own API keys and fully transparent provider/model selectors.
- **Storage:** local filesystem media storage for the MVP.
- **Updates:** real-time job progress for analysis, image generation, video generation, and exports.

## Documentation

- [Product plan](docs/product-plan.md)
- [Asset Bible specification](docs/asset-bible.md)
- [Storyboard and video workflow](docs/storyboard-and-video.md)
- [Provider and model strategy](docs/provider-strategy.md)
- [Data, collaboration, and export plan](docs/data-and-collaboration.md)

## MVP feature set

The MVP should include script upload, AI-assisted scene and shot breakdown, user-editable asset detection, Asset Bible records, optional on-request reference generation, sketch storyboard ingestion, storyboard editing with drawing and markup tools, shot-by-shot and scene-level video generation, real-time job updates, local media storage, and project export/import.

## Development status

This repository currently contains the initial product and architecture documentation. Implementation should proceed documentation-first: user-facing behavior, API settings, configuration options, and workflow changes must be documented as part of the same change that implements them.
