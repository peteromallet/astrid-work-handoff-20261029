# Per-Pair Data Persistence

> Source of truth for per-pair prompts, settings, and overrides in travel-between-images.

**Persistence status.** The App has no per-pair write path. `useSegmentSettings` keeps edits as local state for the open form (nothing is persisted), and no hook writes pair metadata back. The Supabase `shot_generations.metadata` column and the `update-shot-pair-prompts` edge function (VLM prompt enhancement) were removed 2026-10-18 (tag `pre-cloud-removal`); the prompt-enhancement button went with the AI prompt helpers. Generation still reads pair metadata if the shot rows it is given carry it.

---

## Data Model

Per-pair data lives on the **start image** of each pair, in the shot-generation row's `metadata` (shape: `PairMetadata` in `src/shared/components/SegmentSettingsForm/segmentSettingsMigration.ts`; `GenerationMetadata` in `src/domains/generation/types/generationMetadata.ts`):

```
Timeline:  [Image A] ----pair 0---- [Image B] ----pair 1---- [Image C]
Metadata:     ↑                         ↑
         metadata for pair 0      metadata for pair 1
```

| Field | Purpose | Used By |
|-------|---------|---------|
| `segmentOverrides` | Per-pair prompt, negative prompt, motion, phase config, LoRAs, model, guidance (read by `readSegmentOverrides`, `src/shared/lib/settingsMigration.ts`) | Overall generation + regen |
| `enhanced_prompt` | Pre-computed AI prompt for the pair | Fallback for generation (`enhancedPromptsArray`) |

---

## Key Invariants

### Pair Indexing

N positioned images = **N-1 pairs**. Pair index `i` = transition from image `i` to image `i+1`. The last image has no outgoing pair.

### Video-to-Pair Tethering

Videos are tethered to pairs via `start_image_generation_id` in the video's params (`segmentDataTransforms.ts`, `segmentImages.ts`), not a stored `segment_index`. Stored indexes go stale after deletions and reorderings; the start image ID auto-corrects when the timeline changes.

### Filtering + Ordering Must Match Everywhere

Code mapping a pair index to a shot-generation row must use the same filtering and ordering as `buildImagePayload` / `filterImageShotGenerations` in `ShotEditor/services/generateVideo/pairPayload.ts`:

| Rule | Reason |
|------|--------|
| Exclude rows without a `timeline_frame` (unpositioned) | Not on the timeline |
| Exclude videos (by `generation.type` / file extension) and rows without a valid location | Videos are not travel pairs |
| Sort by `timeline_frame` ascending | Prevents pair index shuffle |

**Code paths that must agree:** `generateVideoService.ts` and any timeline pair UI or lightbox lookup that maps a pair index to a row.

---

## Snapshot vs Source of Truth

| Data | Location | Trust |
|------|----------|-------|
| Per-pair overrides | `metadata.segmentOverrides` on the start image's row | Source of truth when present |
| `generations.params` / task params | Runtime task and generation records | Snapshot: can be stale vs the current timeline; useful for debugging "what was sent" |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Video shows wrong pair's data | Stale `segment_index` in params | Derive segment from `start_image_generation_id` |
| Pair edits gone after closing the form | Expected: edits are local to the open form (see Persistence status) | None; there is no pair write path |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/hooks/segments/useSegmentSettings.ts` | Local editing state for segment settings |
| `src/shared/components/SegmentSettingsForm/segmentSettingsUtils.ts` | Interfaces, utilities, presets |
| `src/shared/components/SegmentSettingsForm/segmentSettingsMigration.ts` | `PairMetadata` shape |
| `src/tools/travel-between-images/components/ShotEditor/services/generateVideo/pairPayload.ts` | Overall generation: extracts per-pair overrides and prompts |
