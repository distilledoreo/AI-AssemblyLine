# AI AssemblyLine Product Plan

AI AssemblyLine is a full-stack production platform for turning a script and an asset Bible into storyboard images and video clips for short films. It supports both single-user creators and team production workflows, with local-first media storage, bring-your-own API keys, transparent model selection, and real-time generation updates.

## Product goals

- Convert uploaded scripts into structured scenes, shots, asset requirements, and generation plans.
- Maintain visual continuity through a locked project style and an evolving Asset Bible.
- Let users upload or generate reference material, then approve, reject, version, and reuse it throughout production.
- Generate storyboard frames and video clips from script direction, storyboard metadata, user notes, and approved asset references.
- Support both shot-by-shot and scene-level video generation paths.
- Keep all provider choices transparent rather than hiding model routing behind opaque automation.

## Primary users

### Single creator

A single user can upload a script, build an Asset Bible, generate storyboards, iterate on frames, produce clips, and export project files locally.

### Team production

A team can collaborate on the same project with role-aware access to script analysis, asset design, storyboard approval, clip generation, review notes, and exports.

## Recommended stack

The first full-stack implementation should use:

- **Next.js + React + TypeScript** for the web app, dashboard, editors, and API routes.
- **Postgres** for structured project, asset, scene, shot, review, and job metadata.
- **Prisma** for type-safe database access.
- **Local filesystem storage** for uploaded and generated media in the MVP.
- **BullMQ + Redis** for long-running AI jobs and real-time progress events.
- **WebSockets or Server-Sent Events** for live job updates.
- **FFmpeg workers** for clip assembly, format conversion, thumbnails, and exports.
- **Provider adapters** for OpenAI, ByteDance/Seedance, Runway, Pika, Kling, Luma, ElevenLabs, Stability, and Replicate.

## Project workflow

AI AssemblyLine uses staged production with flexible unlocking. The whole project does not block on a fully complete Asset Bible. Instead, each scene and shot unlocks when its required approved assets are available.

1. **Project setup**
   - Create a project.
   - Define title, target format, visual style, aspect ratio, estimated runtime, team access, and storage location.
   - Add provider API keys and default model preferences.

2. **Script upload and analysis**
   - Upload a script.
   - The system identifies scenes, shots, characters, wardrobe needs, locations, animals/creatures, close-up props, story beats, and visual continuity dependencies.
   - Users can override AI-detected assets, merge duplicates, delete false positives, and add missing requirements.

3. **Asset Bible creation**
   - Users provide or generate requested references.
   - The app supports reference uploads and on-request AI generation for missing sheets.
   - Asset records are versioned and can be approved, locked, superseded, or reopened.

4. **Partial scene unlocking**
   - A scene unlocks for storyboard generation when the assets required for that scene are approved.
   - A shot unlocks independently when its specific required assets are approved.
   - Missing assets only block dependent scenes or shots, not the entire project.

5. **Storyboard generation and editing**
   - Generate at least one storyboard frame per shot.
   - Support up to nine keyframes per shot for complex motion or multi-beat actions.
   - Users may upload sketch storyboards; the system attempts to preserve composition as closely as realistically possible while applying the locked visual style and approved asset references.
   - Users can refine frames with prompts, regenerate versions, or use drawing and markup tools.

6. **Video generation**
   - Users can generate video shot-by-shot for maximum control or scene-level clips for broader continuity experiments.
   - Video prompts are composed from the script, shot metadata, storyboard frames, approved asset references, user direction, and camera notes.
   - Dialogue/lip sync is out of MVP scope.

7. **Review and export**
   - Teams review assets, storyboard frames, and video clips with comments and approvals.
   - Users can export project bundles, media, metadata, storyboards, clips, and generation logs.

## MVP scope

The MVP should include:

- Script upload and AI-assisted scene/shot breakdown.
- Asset requirement detection with user override and merge controls.
- Asset Bible records for characters, wardrobes, locations, creatures/animals, and close-up continuity props.
- Manual reference upload and on-request image generation.
- Flexible scene/shot unlocking based on approved required assets.
- Storyboard generation with one to nine keyframes per shot.
- Sketch storyboard ingestion and style-consistent regeneration.
- Drawing and markup tools for storyboard feedback.
- Shot-by-shot and scene-level video generation options.
- Real-time generation job updates.
- Local filesystem media storage.
- Project export/import.
- BYO API keys and transparent model selectors.

## Explicit non-goals for MVP

- Automatic lip sync and dialogue performance generation.
- Fully automated final edited film assembly without human review.
- Strict requirement that the entire Asset Bible is complete before any storyboard work begins.
- Opaque automatic model routing that hides model/provider choices from the user.
- Age variants for characters.
