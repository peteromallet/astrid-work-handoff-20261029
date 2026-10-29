# Settings System

## Purpose

Single system for persisting and resolving tool/UI settings across shots, projects, and users. Covers both **cascade resolution** (which scope wins) and **storage layers** (where data lives).

## Source of Truth

| What | File |
|------|------|
| Priority resolution | `src/shared/lib/settingsResolution.ts` |
| Low-level settings hook | `src/shared/hooks/settings/useToolSettings.ts` |
| Auto-save hook (recommended) | `src/shared/settings/hooks/useAutoSaveSettings.ts` |
| Bind-to-useState adapter | `src/shared/hooks/usePersistentToolState.ts` |
| Generic persistent state | `src/shared/hooks/usePersistentState.ts` |
| User UI preferences | `src/shared/hooks/useUserUIState.ts` |

## Layering Policy

These hooks are intentionally layered, not interchangeable peers:

1. `useAutoSaveSettings` is the default feature-level API.
2. `usePersistentToolState` is an adapter for legacy components that already own local `useState`.
3. `useToolSettings` is the low-level read/write boundary for manual scope control and shared infrastructure.

Feature code should only bypass `useAutoSaveSettings` when the adapter or low-level boundary is genuinely required. When multiple layers appear in one area, that should reflect these responsibilities rather than ad hoc drift.

## Which Hook Should I Use?

```
Need to persist settings?
├─ User-scoped UI preference (theme, pane locks)? → useUserUIState
├─ Existing useState you want to persist with interaction guard? → usePersistentToolState
├─ Need manual save control or multi-scope writes? → useToolSettings
└─ Everything else (new feature default) → useAutoSaveSettings ✓
```

| Scenario | Hook | Why |
|----------|------|-----|
| New tool with shot-scoped settings | `useAutoSaveSettings` | Owns state, auto-saves, handles entity changes |
| Dark mode toggle, pane lock | `useUserUIState` | User-scoped UI preference, held for the session |
| Image gen form with `markAsInteracted` guard | `usePersistentToolState` | Binds to existing `useState`; only saves after explicit interaction |
| One-off write to a specific scope | `useToolSettings` | Low-level `update('shot', {...})` / `update('project', {...})` |

**Key differences:**
- `useAutoSaveSettings` vs `usePersistentToolState`: Auto-save owns its state; PersistentToolState is an adapter that binds to existing `useState` and requires `markAsInteracted()` before saving.
- `useAutoSaveSettings` vs `useToolSettings`: Auto-save adds debounce, dirty tracking, entity-change flushing. ToolSettings is the raw read/write layer.
- `useUserUIState` vs the rest: user-scoped UI state under the `ui` key, held in memory for the session; the others are keyed by tool ID and scoped to project/shot/user.

### Migration Direction

- New settings persistence should default to `useAutoSaveSettings`.
- `usePersistentToolState` should be used only for legacy components that already own many local `useState` fields and need an interaction guard.
- Tool-specific hooks should prefer `useAutoSaveSettings` operations (`updateField`, `updateFields`, `saveImmediate`) over direct low-level write helpers unless a boundary requires manual scope control.
- `useToolSettings` should stay concentrated in shared infrastructure, thin wrapper hooks, or feature code that truly needs manual scope selection or one-off writes.

## Cascade Resolution

Priority (highest wins): **shot > project > user > defaults**

```typescript
import { resolveSettingField } from '@/shared/lib/settingsResolution';

const value = resolveSettingField<string>('prompt', {
  defaults: { prompt: 'default' },
  user: {},
  project: { prompt: 'project default' },
  shot: { prompt: 'shot specific' }  // wins
});

// Generation mode normalization (undefined -> 'timeline', all other values preserved)
import { resolveGenerationMode } from '@/shared/lib/settingsResolution';
const mode = resolveGenerationMode(sources); // 'batch' | 'timeline' | 'by-pair'
```

`useToolSettings` performs this merge automatically via `deepMerge(defaults, user, project, shot)`.

## Storage Layers

| Layer | Scope | Hook / API | Use Case |
|-------|-------|------------|----------|
| **Settings query cache** | Session | `useToolSettings`, `useAutoSaveSettings` | Tool settings, observed from the cache; there is no backend write (see Persistence) |
| **localStorage** | Device-only | `usePersistentState` (from `storageKeys.ts`) | Collapsed panels, active tabs, last-active-shot cache |
| **sessionStorage** | Tab-only | Direct access | Inheritance handoff (`apply-project-defaults-${shotId}`) |

### Settings Shape

Settings are keyed by tool ID, one key per persisted form:

```json
{
  "travel-between-images": { "batchVideoPrompt": "...", "generationMode": "timeline" },
  "join-segments": { "generateMode": "join", "contextFrameCount": 15 },
  "ui": { "paneLocks": { "shots": false }, "theme": { "darkMode": true } }
}
```

### localStorage Keys (Device-Specific)

| Key pattern | Purpose |
|-------------|---------|
| `last-active-shot-settings-${projectId}` | Recent shot settings (project-scoped) |
| `global-last-active-shot-settings` | Cross-project fallback (first shot in new project) |
| `last-active-ui-settings-${projectId}` | UI preferences (project-scoped) |

## Hook Quick Reference

See "Which Hook Should I Use?" above for decision guidance. Each hook has detailed JSDoc in its source file.

```typescript
// useAutoSaveSettings (recommended) — owns state, auto-saves
const s = useAutoSaveSettings({ toolId: 'my-tool', shotId, scope: 'shot', defaults: DEFAULTS });
if (s.status !== 'ready') return <Loading />;
s.updateField('prompt', 'new');

// usePersistentToolState — binds to existing useState, saves on interaction
const { ready, markAsInteracted } = usePersistentToolState('my-tool', { projectId }, {
  prompt: [prompt, setPrompt],
});

// useToolSettings (low-level) — manual save control
const { settings, update } = useToolSettings('my-tool', { projectId, shotId });
update('shot', { myField: 'value' });

// useUserUIState — user-scoped UI prefs
const { value, update } = useUserUIState('paneLocks', { shots: false, tasks: false, gens: false });
```

## Persistence (Runtime path)

There is no tool-settings backend on the Runtime path (the Supabase JSONB columns, settings RPCs and write queue were removed 2026-10-18, tag `pre-cloud-removal`). `useToolSettings` observes the settings query cache (seeded by other hooks via `setQueryData`) and its `update` is a deliberate no-op; there is no write queue, prefetch or atomic RPC. Anything that was persisted only through that backend (e.g. per-shot form values) does not survive a reload; localStorage-backed state (`usePersistentState`, `lastEditedLora`) is unchanged.

## Key Invariants

1. **Single priority order** -- `shot > project > user > defaults` everywhere; never implement manually.
2. **One tool ID per form** -- each `toolId` maps to one JSONB key; don't split a form across IDs.
3. **Multiple tool IDs per page are OK** when they represent distinct persisted forms (e.g., `travel-between-images` + `join-segments`).
4. **Wait for ready** -- always gate on `isLoading` / `status !== 'ready'` before reading settings.
5. **No backend writes** -- `useToolSettings.update` is inert on the Runtime path; do not add a second write path beside it.
6. **Scope explicitly** -- `update('shot', ...)` vs `update('project', ...)`.
7. **Don't duplicate storage** -- if a field is in `useAutoSaveSettings`, don't also persist it via `usePersistentToolState` with a different tool ID.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Settings not saving | Expected for backend-only settings (see Persistence); check `enabled: true` and scope for cache-backed ones |
| Settings reset on shot switch | Use project scope for cross-shot settings |
| Updates lost during loading | Use `useAutoSaveSettings` (has loading gates + pending-edit protection) |

## Migration Guide

```typescript
// From Map pattern -> useAutoSaveSettings
// OLD: const [map, setMap] = useState(new Map());
const settings = useAutoSaveSettings({ toolId: 'my-tool', shotId, scope: 'shot', defaults: DEFAULTS });

// From localStorage-only -> useToolSettings
// OLD: localStorage.setItem(key, JSON.stringify(value));
const { update } = useToolSettings('my-tool', { shotId });
update('shot', newValue);
```
