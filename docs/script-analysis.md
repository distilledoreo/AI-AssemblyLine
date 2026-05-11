# Script Analysis Pipeline

Script analysis is the first production step. The system ingests an uploaded script, breaks it into scenes and shots, detects required assets, and produces the initial dependency graph that drives the rest of the workflow.

## Pipeline overview

Script analysis runs as a multi-pass LLM pipeline when a real OpenAI provider key is configured for the project workspace or `OPENAI_API_KEY` is set. Each pass has a focused objective and a structured output schema. The passes run sequentially within a single `GenerationJob` of type `script_analysis`. Local development and automated tests without a provider key use the deterministic heuristic parser so the workflow remains runnable without API spend; production requires real provider credentials.

### Pass 1 — Scene extraction

**Input:** Raw script text (chunked if necessary).

**Objective:** Identify scene boundaries, scene headings (slug lines), and per-scene summaries.

**Output schema:**

```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "heading": "INT. COFFEE SHOP - MORNING",
      "summary": "Anna meets David for the first time.",
      "scriptStartLine": 1,
      "scriptEndLine": 42,
      "locationHint": "Coffee Shop"
    }
  ]
}
```

### Pass 2 — Shot breakdown

**Input:** Script text for a single scene plus the scene summary from Pass 1.

**Objective:** Break each scene into individual shots with action, camera, and lighting suggestions.

**Output schema:**

```json
{
  "sceneNumber": 1,
  "shots": [
    {
      "shotNumber": 1,
      "action": "Anna pushes through the door, scanning the room.",
      "cameraAngle": "medium wide",
      "cameraMovement": "slow push in",
      "lensNotes": "35mm equivalent, shallow depth of field on Anna",
      "lightingNotes": "warm morning light through windows, soft key"
    }
  ]
}
```

### Pass 3 — Asset detection

**Input:** Full scene and shot breakdown from Passes 1–2, plus original script text.

**Objective:** Identify every character, wardrobe, location, creature/animal, and close-up prop required across all scenes and shots. Deduplicate across scenes.

**Output schema:**

```json
{
  "assets": [
    {
      "canonicalName": "Anna",
      "type": "character",
      "aliases": ["ANNA", "Anna Chen"],
      "description": "Late 20s, dark curly hair, nervous energy.",
      "firstAppearance": { "sceneNumber": 1, "shotNumber": 1 }
    },
    {
      "canonicalName": "Anna - Casual Outfit",
      "type": "wardrobe",
      "description": "Oversized cardigan, jeans, canvas sneakers.",
      "attachedTo": ["Anna"],
      "firstAppearance": { "sceneNumber": 1, "shotNumber": 1 }
    }
  ],
  "sceneAssetLinks": [
    { "sceneNumber": 1, "assetName": "Anna" },
    { "sceneNumber": 1, "assetName": "Coffee Shop" }
  ],
  "shotAssetLinks": [
    { "sceneNumber": 1, "shotNumber": 1, "assetName": "Anna" },
    { "sceneNumber": 1, "shotNumber": 1, "assetName": "Anna - Casual Outfit" }
  ]
}
```

## Chunking strategy

Scripts can exceed LLM context windows. The system handles this as follows:

1. **Measure script length** in tokens using the provider's tokenizer (or a fast approximation like tiktoken).
2. **If the script fits** within 70% of the model's context window (leaving room for the system prompt, output, and safety margin), process it in a single pass.
3. **If the script is too long**, split at scene boundaries. Pass 1 processes the entire script in overlapping chunks (overlap of 500 tokens at chunk boundaries) to avoid splitting a scene across chunks. Passes 2 and 3 process one scene at a time.
4. **Deduplication** runs after Pass 3 completes for all scenes. A fuzzy-match step merges assets with similar names or descriptions (e.g. "ANNA" and "Anna Chen" both reference the same character).

## Validation and repair

LLM output is unreliable. Every pass output goes through validation:

1. **Schema validation:** Parse output as JSON. If parsing fails, attempt to extract JSON from markdown code fences or surrounding text. If that fails, retry the pass (up to 2 retries).
2. **Referential integrity:** Verify that shot scene numbers reference valid scenes. Verify that asset links reference detected assets. Log warnings for orphaned references.
3. **Completeness check:** Compare detected scenes against simple regex heuristics (e.g. lines matching `INT.` or `EXT.` patterns) to flag scenes the LLM may have missed.
4. **Repair prompt:** If validation finds issues (missing scenes, orphaned references, empty fields), a targeted repair prompt asks the LLM to fix specific problems rather than re-running the entire pass.

## User correction flow

After analysis completes, users see the full breakdown in an editable UI:

1. **Scene list:** Users can edit headings, summaries, boundaries, merge scenes, split scenes, or add missing scenes manually.
2. **Shot list:** Users can edit shot descriptions, camera notes, reorder shots, merge shots, split shots, or add new shots.
3. **Asset list:** Users can rename assets, merge duplicates (drag one onto another), delete false positives, add missing assets, change asset types, and edit descriptions.
4. **Requirement links:** Users can add or remove asset requirements from scenes and shots. The dependency graph updates in real time.
5. **Re-analysis:** Users can trigger re-analysis of a single scene or the entire script. Re-analysis preserves user edits by default and only adds newly detected items, unless the user explicitly chooses a full reset.

## Error handling

| Error | Behavior |
|-------|----------|
| LLM returns invalid JSON | Retry up to 2 times, then mark job as `failed` with the raw output saved for debugging |
| LLM hallucinates scenes not in the script | Completeness check flags them; user sees them marked as "AI-detected, unverified" |
| LLM misses scenes | Regex heuristic flags potential misses; user sees a warning banner |
| Provider rate limit | Job enters `rate_limit` error class and is re-queued with exponential back-off |
| Provider down | Job enters `retriable` error class and is re-queued after a delay |

## Provider requirements

Script analysis uses the **text and reasoning** adapter category. Recommended models:

- **Primary:** OpenAI GPT-4o or equivalent with large context window and structured output support.
- **Fallback:** Any text provider in the user's configured provider list that supports structured JSON output.

The system should use the provider's structured output / JSON mode when available to improve parse reliability.
