# Media Processing

AI AssemblyLine uses FFmpeg for clip assembly, format conversion, thumbnail generation, and export packaging. This document specifies the integration approach, supported operations, and worker architecture.

## FFmpeg integration approach

FFmpeg runs as a **child process** spawned from Node.js BullMQ workers. The app does not use FFmpeg WASM (too slow for video operations) or Docker containers (adds deployment complexity for MVP).

**Prerequisite:** FFmpeg must be installed on the host system and available on `PATH`. The app checks for FFmpeg availability on startup and logs a clear error if it is missing.

## Supported operations

### Thumbnail extraction

- **Input:** Video file path, timestamp (default: 1 second in or 10% of duration, whichever is earlier).
- **Output:** JPEG thumbnail at 480px wide, aspect ratio preserved.
- **Job type:** `thumbnail`
- **Trigger:** Automatic after any video clip generation completes.

### Image thumbnail

- **Input:** Image file path (uploaded reference or generated storyboard frame).
- **Output:** JPEG thumbnail at 480px wide, aspect ratio preserved.
- **Job type:** `thumbnail`
- **Trigger:** Automatic after any image upload or generation completes.

### Format conversion

- **Input:** Media file in any FFmpeg-supported format.
- **Output:** Normalized format. Videos → MP4 (H.264 + AAC). Images → original format preserved (PNG, JPEG, WebP).
- **Job type:** `media_convert`
- **Trigger:** On upload if the file format is not in the supported list, or on export if the export settings specify a target format.

### Clip info extraction

- **Input:** Video file path.
- **Output:** Duration (ms), resolution, codec, frame rate, file size.
- **Use:** Populates `ClipVersion.durationMs` and metadata fields. Used by the UI to display clip details.

### Scene reel assembly

- **Input:** Ordered list of approved clip file paths for a scene.
- **Output:** Single concatenated MP4 with crossfade transitions (default 0.5s, configurable).
- **Job type:** `media_convert`
- **Trigger:** User-initiated from the scene review UI.

### Export packaging

- **Input:** List of media file paths for the export bundle.
- **Output:** ZIP archive at the project export path.
- **Job type:** Part of the `export` job pipeline.

## Worker architecture

Media processing jobs run on the `media` BullMQ queue with concurrency 4 (configurable).

Each job:

1. Validates that the input file exists and is readable.
2. Constructs the FFmpeg command with appropriate flags.
3. Spawns the FFmpeg child process.
4. Monitors stderr for progress (FFmpeg reports progress on stderr).
5. Parses progress lines to emit `JobEvent` records with `progressPct`.
6. On completion, validates the output file exists and has non-zero size.
7. Updates the relevant database record (thumbnail path, duration, etc.).
8. Cleans up temporary files.

### Error handling

| Error | Behavior |
|-------|----------|
| FFmpeg not found on PATH | Job fails immediately with `fatal` error class. Dashboard shows setup instructions |
| Input file missing | Job fails with `fatal`. Logged as orphan reference |
| FFmpeg process exits non-zero | Job fails with `retriable`. Stderr output saved to GenerationJob.errorMessage |
| Output file is zero bytes | Job fails with `retriable`. Likely indicates a corrupted input |
| Disk full | Job fails with `fatal`. Dashboard shows storage warning |

### Concurrency considerations

FFmpeg is CPU-intensive. The media queue concurrency should be set based on available CPU cores. A reasonable default is `max(1, cpuCores - 2)` to leave headroom for the app and other workers. This is configurable via the `MEDIA_WORKER_CONCURRENCY` environment variable.

## Supported input formats

| Category | Formats |
|----------|---------|
| Video | MP4, MOV, WebM, AVI, MKV |
| Image | PNG, JPEG, WebP, TIFF, BMP |

Unsupported formats are rejected at upload time with a user-friendly error message.
