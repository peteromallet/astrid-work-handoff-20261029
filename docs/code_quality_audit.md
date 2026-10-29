# Code Quality Overview

Present-state reference. Describes how the codebase measures up against its quality principles, with every known exception and reasoning. Not a changelog — only current status matters.

Last verified: 2026-02-03 (932 source files).

---

## At a Glance

| Dimension | Status | Key metric |
|-----------|--------|------------|
| Dependency direction | ⚠️ Not enforced | 45 `shared/ → tools/` import lines in 33 non-test files, and 56 `shared/ → domains/features` violations in 51 files; ESLint checks `shared/ → domains/features` in only 27 `src/shared` files and `shared/ → tools/` in none |
| Data fetching | ✅ Clean | 3 query scopes; mutations separated. ~25 inline query keys |
| Type safety | ✅ Clean | 94 `any` (17 `: any`, 81 `as any`), all justified |
| File size | ⚠️ Acceptable | 11 files over 1,000 LOC; each documented |
| Explicit contracts | ✅ Clean | 7 patterns encoded as constants/helpers/types |
| Code duplication | ✅ Patterns exist | 4 shared patterns for repeated operations |
| Naming | ✅ Clean | ~20 single-letter vars (`w`/`h`, `x`/`y`, `i`/`j`), all conventional |
| Logging hygiene | ⚠️ Acceptable | 2,974 console statements / 342 files; tagged, stripped in prod |
| Dead code | ✅ Clean | 35 unused exports, 142 unused types (mostly intentional/false positives) |

---

## 1. Dependency Direction

**Principle:** `tools/` → `shared/`, never reverse.

**Status:** Not enforced. `src/shared` has 45 `from '@/tools/...'` import lines in 33 non-test files (measured with `git grep -E "from ['\"](@/tools/|(\.\./)+tools/)" -- 'src/shared/**'`, tests excluded), and 56 `@/domains/*` or `@/features/*` imports in 51 non-test files. Neither is a regression of the cloud removal: both were already unchecked before it.

**Known gap — what ESLint actually checks (owned debt):** `eslint.config.js` declares both rules for `src/shared`, but flat config replaces a rule's options per file, so only the last matching block counts.
- `shared/ → tools/`: the block that declares it is always followed by the `shared/ → domains|features` block for the same files, which replaces its options. The pattern never fires.
- `shared/ → domains|features`: live only in the 27 files listed in `sharedLayerEnforcedFiles` (`eslint.shared-layer-allowlist.js`), the files the removed Supabase facade allowlist had left uncovered. A block placed after it, with only the URL-helper paths, covers every other non-test `src/shared` file, exactly as the facade block did. The 56 violations sit under that block.
- Fix: merge the `tools/` and `domains|features` patterns into one block, delete the "Where the shared-layer rule is live" block, then move or allowlist the violating files. `eslint.shared-layer-allowlist.js` entries only shrink, so moving is the default.

---

## 2. Data Fetching

**Principle:** Three query scopes (project, shot, variant). Mutations in dedicated files, not mixed with queries.

**Status:** Clean. Shot placement mutations in `useShotGenerationMutations.ts`, invalidation centralized via `useGenerationInvalidation.ts`. Full details in `docs/structure_detail/data_fetching.md`.

**Known gap — inline query keys:** ~25 `useQuery`/`useInfiniteQuery` hooks define keys as inline string arrays instead of `queryKeys.*` (`src/shared/lib/queryKeys.ts`). These are mostly single-use keys in isolated hooks (e.g., `['lineage-chain', variantId]`, `['pending-segment-tasks', ...]`). Mutation invalidation keys use the registry.

---

## 3. Type Safety

**Principle:** No unjustified `any`.

**Status:** 94 total (17 `: any`, 81 `as any`). All in instrumentation/debug code — application logic is `any`-free.

| Category | Count | Justification |
|----------|-------|---------------|
| Debug/instrumentation/monitoring | ~55 | Intentionally generic — logs arbitrary runtime state |
| Browser API interop | ~16 | `navigator.connection`, `.standalone`, `performance.memory` — no `lib.dom.d.ts` types |
| Window debug globals | ~15 | Dev-only (`__DATA_FRESHNESS_MANAGER__`, etc.) |
| Tests | ~7 | `VisibilityManager.test.ts` — white-box access to private methods |
| Generic function types | ~4 | `errorHandler`, `queryKeys`, `useStableObject`, `logger` |

Heaviest files: `NetworkStatusManager` (8), `mobileProjectDebug` (7), `VisibilityManager.test` (7). Counts predate the cloud removal (2026-10-18, tag `pre-cloud-removal`), which deleted the `instrumentation/window` and `instrumentation/realtime` files that held ~24 of them; re-measure before relying on the totals.

---

## 4. File Size & Decomposition

**Principle:** Orchestrators under 300 LOC. Extract hooks/components into directory structure when files grow.

**Status:** 10 files over 1,000 LOC. Standard decomposition approach: directory with `components/` + `hooks/`, or extract focused modules. Reference pattern: `useRepositionMode` — 161-line orchestrator coordinating 5 focused hooks (`useRepositionCanvasSetup`, `useRepositionInteractions`, `useRepositionRendering`, `useRepositionState`, `useRepositionValidation`).

### Remaining large files

| File | Lines | Why it stays |
|------|-------|-------------|
| `ImageLightbox.tsx` | 1,296 | State aggregation — splitting requires a new context for no benefit |
| `Timeline.tsx` | 1,226 | Hooks/components/utils already extracted; this is the orchestrator |
| `ShotEditor/index.tsx` | 1,200 | Already sectioned (Header/Timeline/Generation/Modals) |
| `VideoGallery/index.tsx` | 1,181 | Video gallery orchestrator with segment output integration |
| `ImageGenerationToolPage.tsx` | 1,170 | Uses extracted components; page-level orchestration |
| `ImageGenerationForm.tsx` | 1,133 | Multi-model form with conditional sections; shared across tools |
| `PhilosophyPane.tsx` | 1,113 | Marketing/content component; low churn |
| `VideoLightbox.tsx` | 1,064 | Same pattern as ImageLightbox |
| `MediaGallery/index.tsx` | 1,027 | Gallery orchestrator with filters, pagination, drag-and-drop |
| `SegmentOutputStrip.tsx` | 1,003 | Timeline segment rendering with progress tracking |


---

## 5. Explicit Over Implicit

**Principle:** No magic strings, no head-knowledge contracts. Encode rules in constants, helpers, or types.

**Status:** Clean. 7 patterns encoded explicitly.

| Domain rule | How it's encoded |
|-------------|-----------------|
| Shot filter "no shot" value | `SHOT_FILTER.NO_SHOT` constant |
| Dynamic column layout | `columnsPerRow='auto'` literal type |
| Variant type discrimination | `VARIANT_TYPE.ORIGINAL`, `.INPAINT`, etc. |
| Generation ID resolution (variants, metadata, null) | `getGenerationId()` helper |
| Task params parsing (string or object) | `taskParamsUtils.ts` |
| Settings merge order (project → shot → segment) | Documented in code + `settings_system.md` |
| Variant source task lookup | `getSourceTaskId()` helper |

---

## 6. Code Duplication

**Principle:** Shared patterns for operations that appear 3+ times.

| Repeated operation | Pattern | Location | Notes |
|--------------------|---------|----------|-------|
| Loading state | `useAsyncOperation` hook | `shared/hooks/useAsyncOperation.ts` | RQ mutations use `mutation.isPending` + `LoadingButton` instead |
| Query cache keys | `queryKeys.*` registry | `shared/lib/queryKeys.ts` | ~25 inline keys in isolated hooks (§2) |
| Loading spinner button | `LoadingButton` | `shared/components/ui/loading-button.tsx` | |
| Confirmation dialogs | `useConfirmDialog()` + `ConfirmDialog` | `shared/components/ConfirmDialog.tsx` | Promise-based `await confirm()` or declarative. Presets: `confirmPresets.delete()`, etc. |

---

## 7. Logging Hygiene

**Principle:** Tagged debug logs, stripped in production, no sensitive data.

**Status:** 2,974 console statements across 342 files. Production builds strip `console.log` via Vite. No sensitive data leaks (API keys masked, auth tokens never logged).

Logs use bracket-prefix tags for filtering via `debug.py logs --tag <Tag>`. Top tags: `[ApplySettings]` (126), `[EDIT_DEBUG]` (82), `[VideoGalleryPreload]` (41), `[BasedOnNav]` (39), `[DataTrace]` (35), `[RealtimeConnection]`, `[RealtimeEventProcessor]`, `[RealtimeInvalidation]`, `[DataFreshness]` (realtime system), `[AddWithoutPosDebug]` (31), `[VariantRelationship]` (30).

Top files: `applySettingsService.ts` (79), `PromptEditorModal.tsx` (53), `MediaGallery/index.tsx` (35), `ShotListDisplay.tsx` (29).

---

## 8. Dead Code & Backward Compatibility

**Principle:** Delete, don't deprecate-and-keep.

**Status:** Clean. Components use named exports only (no duplicate `export default`). Knip reports 35 unused exports and 142 unused types — these are intentional (shadcn UI variants) or false positives from dynamic imports.

---

## Anti-Patterns

| Don't do this | Why |
|---------------|-----|
| Registry/capability pattern for tools | Over-engineering for ~5 tools |
| `useSafeQuery` wrapper | Fights React Query's design |
| Facade hooks with deprecation layers | Delete old code instead |
| Multi-week architecture overhauls | Adds abstractions instead of removing them |

**Core principle:** Every change should make the codebase smaller or more explicit.

---

## Definition of Beautiful

1. **Types encode domain rules** — `'no-shot' | 'all' | ShotId`, not `string`
2. **One way to do each thing** — 2 generation hooks, not 5
3. **Dependencies point one direction** — tools → shared, never reverse
4. **Components do one thing** — orchestrators coordinate; leaves render
5. **Names communicate intent** — `matchedAssociation`, not `m`
6. **Implicit rules are explicit** — constants, helpers, types
