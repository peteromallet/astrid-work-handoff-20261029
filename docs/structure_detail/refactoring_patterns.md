# Refactoring & Compartmentalization Patterns

Principles and checklists for splitting monolithic components and hooks.

> **Complex editor?** See [Complex Editor Pattern](#complex-editor-pattern-shoteditor-reference) for the full architecture (context + sections + reducer + 20 hooks). Reference: `ShotEditor`.

---

## General Principles

1. **Single Responsibility** — Each file has one reason to change.

2. **Extract at 3+ Occurrences** — Don't abstract one-off logic.

3. **Preserve API Surface** — Barrel files re-export with same names. No import breakage.

4. **Types When Shared** — Extract to `types.ts` when multiple files need them. Keep inline otherwise.

5. **Backwards-Compat Wrappers** — Keep old names as thin wrappers during migration. Remove once consumers update.

6. **Structure Over Size** — 10 focused files beats 1 monolith, even if total lines increase.

---

## When to Split

**The real test:** Can you quickly answer "what does this hook/component own?" If yes, size doesn't matter. If no, it needs work — but maybe cleanup, not splitting.

| Signal | Hook Threshold | Component Threshold |
|--------|----------------|---------------------|
| Mixed concerns | Can't answer "what does this own?" | Multiple unrelated branches |
| Total lines | > 1000 (after dead code removal) | > 600 |
| Exports / Props | > 8 hooks | > 12 props |
| Repeated patterns | 3+ identical blocks | 3+ similar JSX |

**Important:** A 900-line hook doing one thing well is fine. A 500-line hook mixing concerns needs splitting. Line count alone is not the signal.

---

## Hook Refactoring

### Directory Structure

```
hooks/domain/
├── index.ts              # Barrel re-exports
├── cacheUtils.ts         # Query key helpers (if React Query)
├── debug.ts              # Logging utility (if needed)
├── mappers.ts            # Data transformers
├── useDomainQueries.ts   # useQuery hooks
├── useDomainMutations.ts # useMutation hooks
└── useDomainCreation.ts  # Complex workflows
```

### Checklist

#### 0. Clean First (before considering structural changes)
- [ ] Find unused exports: grep `hookName.exportName` — if no hits, it's dead
- [ ] Find orphaned refs: declared and assigned but `.current` never read
- [ ] Find unused mutations: hook called but result never used
- [ ] Find vestigial stubs: empty functions, hardcoded `false`, commented "REMOVED"
- [ ] Remove dead code, then reassess — you may not need to split

#### 1. Preparation
- [ ] Count lines, exports, repeated patterns
- [ ] Map internal dependencies (which hooks call which?)
- [ ] Group by domain: queries, mutations, utilities

#### 2. Extract Utilities
- [ ] Centralize cache keys in `cacheUtils.ts`
- [ ] Extract `updateCache()`, `rollbackCache()`, `cancelQueries()`
- [ ] Extract mappers/transformers

#### 3. Consolidate Similar Hooks
- [ ] Merge hooks differing only by a parameter
- [ ] Add discriminant param: `{ withPosition?: boolean }`
- [ ] Create thin wrapper for old name (temporary)

#### 4. Split & Barrel
- [ ] Move hooks to domain files by responsibility
- [ ] Write `index.ts` re-exporting everything
- [ ] Convert original file to re-export barrel
- [ ] Verify no import breakage

---

## Component Refactoring

### Directory Structure

```
ComponentName/
├── index.tsx             # Barrel exports
├── ComponentName.tsx     # Main logic
├── types.ts              # Shared interfaces (if needed)
├── components/           # Sub-components
│   ├── SubComponentA.tsx
│   └── index.ts
└── hooks/                # Component-specific hooks (large components only)
    ├── useComponentState.ts
    └── index.ts
```

Note: Only create `hooks/` subfolder for large, complex components. Most component hooks belong in `src/shared/hooks/`.

### Checklist

#### 1. Analysis
- [ ] Count lines, props, useState/useRef calls
- [ ] Identify major conditional branches (image vs video, etc.)
- [ ] Find repeated JSX patterns

#### 2. Extract Sub-Components
- [ ] Identify self-contained visual units
- [ ] One file per sub-component in `components/`
- [ ] Minimize props — pass only what's needed

#### 3. Split by Type (if applicable)
- [ ] Create specialized variants: `ImageLightbox`, `VideoLightbox`
- [ ] Extract shared chrome to shell component
- [ ] Main component becomes thin dispatcher

#### 4. Finalize
- [ ] Write barrel with all exports
- [ ] Update imports across codebase
- [ ] Delete or convert monolith to re-export

### Dispatcher Pattern

```tsx
// Main component routes to specialized version
export default function MediaLightbox(props: MediaLightboxProps) {
  return props.mediaType === 'video'
    ? <VideoLightbox {...props} />
    : <ImageLightbox {...props} />;
}
```

---

## Splitting Tradeoffs

Splitting adds complexity for whoever sets it up (wiring, types, imports) and removes complexity for everyone who reads it afterward. Consider:

| Splitting helps when... | Splitting hurts when... |
|-------------------------|-------------------------|
| Readers need to understand one piece in isolation | You need to see how pieces interact |
| Multiple people work on different parts | One person owns the whole thing |
| Handlers are truly independent | Handlers share setup/teardown logic |
| You're adding more handlers over time | The file is stable |

If a file is cohesive (one clear purpose) and stable (rarely changing), splitting just moves code around.

---

## Anti-Patterns

| Don't | Why | Do Instead |
|-------|-----|------------|
| Split before cleaning | Dead code inflates size artificially | Remove unused code first |
| Split < 500 line files | Unnecessary fragmentation | Wait until it hurts |
| Utilities with 1 call site | Over-abstraction | Keep inline |
| Rename exports in barrel | Breaks IDE go-to-definition | Keep original names |
| Permanent compat wrappers | Tech debt | Remove after migration |
| Component-local hooks everywhere | Scatters code | Use `src/shared/hooks/` unless component is very large |

---

## Complex Editor Pattern

For components with 1000+ lines, 15+ hooks, and heavy state coordination. Reference: **ShotEditor** (`src/tools/travel-between-images/components/ShotEditor/`).

### When to Use

- Multiple consumers of shared state (sections needing same data)
- Performance-sensitive (needs render optimization)
- Settings shared across tools

### Directory Structure

```
ComponentName/
├── index.tsx                 # Coordination (~600-1200 lines)
├── ComponentNameContext.tsx  # Context for component state
├── sections/                 # Visual sections consuming context
├── hooks/                    # 10-20 domain-specific hooks
└── state/types.ts            # Props, state, action types
```

### Key Patterns

| Pattern | When | Example |
|---------|------|---------|
| **Two-layer context** | UI state separate from reusable settings | `ShotSettingsContext` (UI) + `VideoTravelSettingsProvider` (settings) |
| **Reducer for UI state** | 5+ related useState calls | `useShotEditorState` with actions for modal, editing, pending states |
| **Sections pull from context** | Avoid prop drilling | `HeaderSection` gets `selectedShot` from context, not props |
| **Refs for stability** | Callbacks passed to memoized children | `mutationRef.current = mutation` then `useCallback(..., [])` |
| **Context value hook** | Large context object | `useShotSettingsValue()` returns memoized context value |

### When NOT to Use

- Display-only components (galleries) → minimal extraction
- Tool pages (orchestrators) → flat coordinators
- Under 600 lines → standard patterns

---

## Refactoring Discipline

Lessons from large refactors (see `useGenerationActions.ts`: 1,222 → 906 lines from dead code removal alone):

| Do | Why |
|----|-----|
| Run `tsc --noEmit` after each extraction | Catches type errors before they compound |
| Delete unused imports/variables immediately | Dead code obscures what's actually used |
| Grep before deleting | Verify nothing references the "unused" code |
| Call hooks before early returns | Rules of Hooks - can't conditionally call hooks |
| Comment `// Unused but kept for X` if intentional | Prevents re-adding during cleanup |

---

## Success Criteria

- [ ] No file over ~1000 lines
- [ ] Zero repeated code blocks (extracted to utilities)
- [ ] All imports still work (barrel preserves API)
- [ ] Build passes
