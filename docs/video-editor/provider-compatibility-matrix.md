# Provider Compatibility Matrix — M3 TimelinePatch & Proposals

**Status:** Active (M15 hardening)
**Last updated:** 2026-10-18
**Scope:** Every DataProvider implementation that the video editor can run against, evaluated for M3 TimelinePatch, TimelineOps, ProposalRuntime, golden replay semantics, and environment-impossible provider checks.

---

## 1. Purpose

This matrix records the compatibility posture of each concrete `DataProvider` implementation against the M3 semantic layer contracts. Each row captures settings, extension requirements, proposal base-version behavior, diagnostics surface, missing-extension reference handling, patch replay fidelity, and any known limitations. Host code and extension authors can use this matrix to understand which provider guarantees hold in their deployment environment.

---

## 2. Provider implementations

| Provider | Class | Persistence | Environment | M3 support |
|---|---|---|---|---|
| **InMemory** | `InMemoryDataProvider` | Ephemeral (Map-backed) | Test / dev / demo | Full |
| **Runtime** | `RuntimeDataProvider` (`src/integrations/runtime/dataProvider.ts`) | Workspace Runtime (workspace.v1): canonical composition heads and managed objects | Local workspace; `dev:editor` and the e2e suite against the fake Runtime | Full, except the checkpoint API (history is Runtime composition revisions) |

The Supabase and Astrid Bridge providers were retired when the Runtime path became the only local data path (Supabase: 2026-10-18, tag `pre-cloud-removal`); this matrix no longer covers them.

---

## 3. Compatibility matrix

### 3.1 Settings

| Provider | Settings persistence | Per-extension localStorage scoping | Settings cleanup on dispose |
|---|---|---|---|
| **InMemory** | N/A — no persistent storage | Yes (`astrid.ext.<id>.*` prefix convention) | Yes (via `disposeHostServices`) |
| **Runtime** | N/A — no persistent settings table | Yes | Yes |

Settings are always scoped to browser `localStorage` under the `astrid.ext.<id>.` key prefix, regardless of provider. No provider currently offers a server-side settings store. Settings cleanup is provider-agnostic and handled by the extension lifecycle's `disposeHostServices()`.

### 3.2 Extension requirements

| Provider | `ProjectExtensionRequirement` read support | Missing-extension diagnostic severity | Referenced contribution ID validation |
|---|---|---|---|
| **InMemory** | Full — requirements are inlined in TimelineConfig and surfaced via `TimelineReader.snapshot().extensionRequirements` | `warning` (export guard) | Contribution IDs stored in `referencedContributionIds` are validated structurally but not resolved at runtime |
| **Runtime** | Full — same shape, loaded from the canonical composition config in the Workspace Runtime | `warning` | Same as InMemory |

Extension requirements are a property of the timeline config, not the provider. The `TimelineReader` extracts `extensionRequirements` from the config shape and returns them in every snapshot. When a project references an extension that is not currently active, the export guard emits `warning`-severity diagnostics (code: `export/missing-extension`) but does not block render.

### 3.3 Proposal base versions

| Provider | `configVersion` semantics | Strict CAS enforcement | Local monotonic invalidation | Stale proposal detection |
|---|---|---|---|---|
| **InMemory** | Monotonic integer, incremented on every `saveTimeline` | **Yes** — `TimelineVersionConflictError` thrown on mismatch | **Yes** — `useTimelineOps.apply()` compares `patch.version` against current `configVersion` before any mutation | **Yes** — `ProposalRuntime.accept()` revalidates `baseVersion` against `reader.snapshot().baseVersion` |
| **Runtime** | Monotonic integer the provider assigns itself (1 for the first head it sees, +1 per head change); Runtime itself authorizes writes by canonical head revision | **Yes** — a stale head is rejected by Runtime and mapped to `TimelineVersionConflictError`; numeric-only `saveTimeline` is refused outright | **Yes** — same local guard as InMemory (catches stale patches before network round-trip) | **Yes** — same revalidation path; stale snapshots fail server-side instead of silently overwriting |

**Key invariant:** When `patch.version === 0`, the base-version check is bypassed (treated as "no expectation"). This is intended for initial state seeding.

### 3.4 Diagnostics

| Provider | `TimelinePatchDiagnostic` surface | Provider-level error mapping | Diagnostic panel integration |
|---|---|---|---|
| **InMemory** | Full — all `timeline-patch/*` diagnostic codes are produced by the pure compiler and surfaced identically | `TimelineVersionConflictError` → diagnostic code `timeline-patch/stale-base-version` via `useTimelineOps` | Diagnostic codes flow through `TimelinePatchValidationResult.diagnostics` → host `DiagnosticPanel` |
| **Runtime** | Full | Same as InMemory | Same |

Diagnostics are **provider-agnostic** — the pure `validateTimelinePatch` and `compileTimelinePatch` functions produce identical diagnostic shapes regardless of provider. The only provider-specific diagnostic path is `TimelineVersionConflictError` translation, which is handled by `useTimelineOps` before the provider is called.

### 3.5 Missing extension references

| Provider | Detection mechanism | Diagnostic shape | Runtime behavior |
|---|---|---|---|
| **InMemory** | `TimelineReader.snapshot().extensionRequirements` lists expected extensions; host compares against active extension registry | `warning` severity, code: `export/missing-extension` | Render proceeds; unknown clip types from missing extensions produce `export/unknown-clip-type` |
| **Runtime** | Same | Same | Same |

Missing extension references are detected at **export-guard time**, not at provider load time. This is intentional — a project that references an extension should remain openable even when the extension is not installed.

### 3.6 Patch replay behavior

| Provider | Golden replay determinism | Cross-provider consistency | Rollback safety | Serialization fidelity |
|---|---|---|---|---|
| **InMemory** | **Full** — 3× compile on identical input produces structurally equivalent output | **Reference** — InMemory is the canonical replay baseline | **Yes** — `useTimelineOps.rollback()` restores to checkpoint via existing history path | **Full** — `JSON.parse(JSON.stringify(nextData))` round-trips without loss |
| **Runtime** | **Identical compiler output** — the pure compiler returns the same `nextData`/`diff` shapes | **Consistent** — compiler is provider-agnostic; `nextData` is structurally identical to InMemory for the same input | **Yes** — local history works; Runtime saves are head-checked and Runtime-authoritative, and history is Runtime composition revisions | **Full**, except that `config.output` is host-derived: Runtime drops it on save and a load re-materialises defaults |

**Golden replay invariant:** For any valid `TimelinePatch` batch, `compileTimelinePatch(patch, data).nextData` produces structurally equivalent output on any provider. The pure compiler does not import or depend on any `DataProvider` implementation. Provider-specific behavior only enters at the serialization/deserialization boundary (`saveTimeline`/`loadTimeline`), and every provider uses the same `serializeTimelineConfigSnapshot` helper.

---

## 4. Provider-specific limitations

### 4.1 InMemoryDataProvider

- **No persistence across page refresh.** All timeline state is lost on reload. Suitable for tests, dev, and demo only.
- **No checkpoint persistence.** `saveCheckpoint` / `loadCheckpoints` methods are not implemented (the `DataProvider` interface marks them as optional).
- **No asset upload.** Assets are resolved via `memory://` prefix.

### 4.2 RuntimeDataProvider

- **Saves are authorized by head, not by number.** `saveTimeline(id, config, expectedVersion)` throws `TimelineVersionConflictError` on purpose; the editor saves through `saveTimelineAtHead`, passing the head it loaded. A stale head is rejected by Runtime and surfaces as `TimelineVersionConflictError`.
- **Provider-assigned versions.** `configVersion` is 1 for the first head the provider sees and increases by one per head change. It is a local convenience for the M3 version guard, not a Runtime field.
- **No checkpoint persistence.** The `DataProvider` checkpoint methods are not implemented; history is Runtime composition revisions, listed and restored through the project-scoped history calls.
- **`config.output` is host-derived.** Saves drop it and loads re-materialise defaults.
- **Assets resolve through managed objects only.** A registry entry must own a managed object id with a digest identity; `registerAsset` merges the registry and publishes through the same head-checked save. Uploads ingest bytes as managed objects.
- **Unknown timelines.** Runtime answers 404 `not_found`; the provider does not synthesize a default timeline.
- **Requires a connected Workspace Runtime.** Without one the editor shows the connect-the-local-workspace state instead of mounting a provider.

---

## 5. Patch operation support by provider

All 13 active operation families (`clip.add`, `clip.update`, `clip.remove`, `clip.move`, `track.add`, `track.update`, `track.remove`, `asset.update`, `asset.remove`, `app.update`, `project-data.write`, `project-data.delete`, `extension.noop`) are supported identically across both providers. The pure compiler handles all operation families; providers only see the serialized config result.

Reserved operation families (`clip.split`, `clip.slice`) produce warning diagnostics with `{ reserved: true, deferred: true, nonPreviewable: true }` detail on every provider. They are never executed.

---

## 6. Proposal runtime behavior by provider

| Behavior | InMemory | Runtime |
|---|---|---|
| In-memory proposal storage | Yes | Yes |
| Proposals survive page refresh | No | No |
| `replaceForSource` atomicity | Yes | Yes |
| `accept()` base-version revalidation | Yes | Yes |
| `preview()` ghost-render safety | Yes | Yes |
| Proposal count/status in host UI | Yes | Yes |

Proposal storage is **provider-scoped and in-memory** for M3. Page refresh drops all unaccepted proposals. This is consistent across both providers — the `ProposalRuntime` implementation uses an in-memory `Map` and does not persist to any provider backend.

---

## 7. Extension project-data limits by provider

The extension project-data limits (`MAX_ENTRY_BYTES`: 64 KB, `MAX_EXTENSION_TOTAL_BYTES`: 1 MB, `MAX_ENTRIES_PER_EXTENSION`: 128 entries) are **enforced by the pure compiler**, not by the provider. Both providers observe the same limits because the compiler checks them before any provider interaction.

Overflow diagnostics include `ProjectDataLimitDetail` with `extensionId`, `limit`, `actual`, `unit`, and `code` fields. The diagnostic message points authors to assets, `RenderMaterial` refs, render artifacts, provider-backed extension repositories, or package resources as alternatives.

---

## 8. Source-map runtime behavior by provider

The `SourceMapRuntime` stores entries in extension project-data under `__sm__:<entryId>` keys. This means:

- **All providers** support source-map CRUD identically — the data lives in `TimelineConfig.app`, which is provider-agnostic.
- **Stale marking** persists across saves because it updates the project-data entry.
- **Rollback safety** applies because project-data writes go through the patch compiler, which participates in checkpoint/rollback.
- **Cross-provider portability** is guaranteed — source-map entries serialize into the same config shape on all providers.

---

## 9. Test coverage summary

| Test suite | InMemory | Runtime |
|---|---|---|
| `timeline-patch.test.ts` (241 tests) | ✓ All pass | N/A (pure compiler) |
| `timeline-reader.test.ts` (48 tests) | ✓ All pass | N/A (pure reader) |
| `timeline-golden-replay.test.ts` (81 tests) | ✓ All pass | N/A (pure compiler) |
| `InMemoryDataProvider.test.ts` (13 tests) | ✓ All pass | N/A |
| `src/integrations/runtime/dataProvider.test.ts` | N/A | ✓ Head-checked save, history, assets |
| `providerCompatibility.runtime.test.ts` (shared suite over `runtimeFixture`) | N/A | ✓ Shared suite; checkpoint cases read the capability from the provider |
| `proposal-runtime.test.ts` (39 tests) | ✓ All pass | N/A (in-memory runtime) |
| `source-map-runtime.test.ts` (31 tests) | ✓ All pass | N/A (project-data backed) |

---

## 10. Environment-impossible provider checks

This section documents every provider compatibility test that **cannot run** in one or more environments (headless CI, local dev without credentials, Node.js without browser APIs). For each impossible or skipped case, the resolution (mock, skip flag, partial suite, or delegated coverage) is explicitly listed and linked to the relevant contract-recheck rows. No provider check is silently skipped — every gap is traceable to a documented reason.

### 10.1 RuntimeDataProvider — environment prerequisites

| Requirement | Why it's needed | Unavailable in |
|---|---|---|
| A Workspace Runtime (workspace.v1) reachable through the `/api/runtime` Vite proxy (`VITE_WORKSPACE_RUNTIME_URL`) | Serves the canonical composition heads, managed objects and history | CI and dev machines without a Runtime; `dev:editor` and the e2e suite start the fake Runtime (`tests/e2e/fake-runtime/`) instead |
| Runtime token (`WORKSPACE_RUNTIME_TOKEN_FILE`) | The proxy authenticates to the Runtime with it | Environments that have not connected a local workspace |

**How skipped tests are handled:**

The `providerCompatibility.runtime.test.ts` suite uses the shared `runProviderCompatibilitySuite` with the production `RuntimeDataProvider`, a `runtimeFixture` transport as the only fake, and these flags:

| Flag | Value | Reason |
|---|---|---|
| checkpoint cases | read from the provider | Runtime has no checkpoint API (asserted absent); history is composition revisions |
| `derivedOutputOnSave` | `true` | Runtime treats `config.output` as host-derived: saves drop it and loads re-materialise defaults |
| `skipRegisterAsset` | `false` | `registerAsset` merges the registry and publishes through the head-checked save |

The suite saves with numeric `expectedVersion`; `RuntimeDataProvider` refuses that entry point, so the test's `VersionedRuntimeProvider` re-expresses the numeric call as read-head, compare, then `saveTimelineAtHead`. Runtime's own CAS is exercised by `src/integrations/runtime/dataProvider.test.ts` and `dataProvider.parity.test.ts`.

**Skipped shared-suite sections (Runtime):**

| Shared suite section | Skipped? | Reason | Coverage delegated to |
|---|---|---|---|
| checkpoints | Yes (the shared suite asserts both methods are absent) | No checkpoint API; history is Runtime composition revisions | `dataProvider.test.ts` ("loads project-scoped canonical revisions and restores through a current-head CAS") |
| strict CAS version conflict | No | Stale head rejected by Runtime, mapped to `TimelineVersionConflictError` | `providerCompatibility.runtime.test.ts` through `VersionedRuntimeProvider`; `dataProvider.test.ts` |

**Contract-recheck row links:**

| Contract-recheck row | How Runtime satisfies it |
|---|---|
| [CR:M3-007](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) — Provider version behaviors tested | `providerCompatibility.runtime.test.ts` exercises strict CAS; `dataProvider.test.ts` covers the head-checked save path |
| [CR:M3-009](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) — Golden patch replay across providers | Listed as N/A in test coverage summary (§9); the pure compiler is provider-agnostic and the golden replay runs against InMemory |
| [CR:M3-010](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) — Provider compatibility matrix updated | This document §§2–4.2 document the Runtime limitations; this section (§10.1) provides the environment-impossible audit trail |
| [CR:M6-004](./extension-platform-contract-recheck.md#27-m6--asset-metadata-parser-contributions-astrid-loop) — Astrid local-first demo/test | `dataProvider.test.ts` and `providerCompatibility.runtime.test.ts` cover extension mutation and persistence over Runtime |
| [CR:X-007](./extension-platform-contract-recheck.md#216-cross-milestone--structural-claims) — Provider compatibility documented | This document + this section (§10) provide the complete environment-impossible audit trail |

### 10.2 InMemoryDataProvider — no environment restrictions

Both InMemory variants (**testing** and **browser-runtime**) have no environment prerequisites. They run identically in all environments:

| Variant | Test file | Shared suite flags | Environment notes |
|---|---|---|---|
| Testing (`src/tools/video-editor/testing/InMemoryDataProvider`) | `providerCompatibility.inmemory.test.ts` | `versionConflictIsSoft: false`, `skipRegisterAsset: false` | Pure Map-backed; no env dependencies; canonical shared-suite baseline |
| Browser-runtime (`src/tools/video-editor/lib/browser-runtime`) | `providerCompatibility.browserInMemory.test.ts` | `versionConflictIsSoft: false`, `skipRegisterAsset: false` | Uses `createLocalAssetResolver`; works in any JS environment (Node, browser, CI) |

**Contract-recheck row links:**

| Contract-recheck row | How InMemory satisfies it |
|---|---|
| [CR:M3-007](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) | Both variants pass the full shared suite; InMemory is the canonical CAS-semantics reference |
| [CR:M3-009](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) | InMemory is the **Reference** for golden replay determinism (81 tests, 3× compile consistency) |
| [CR:M3-010](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals) | This document §2 defines InMemory as "Full" M3 support |
| [CR:X-007](./extension-platform-contract-recheck.md#216-cross-milestone--structural-claims) | This document + all sections cover InMemory as the canonical baseline |

### 10.3 Cross-provider impossibility summary

| Provider | Environment-impossible scenario | Resolution | Skipped suite sections | Contract-recheck rows |
|---|---|---|---|---|
| **Runtime** | No Workspace Runtime process | `runtimeFixture` transport under the production provider; numeric saves re-expressed as head-checked saves | checkpoints | CR:M3-007, CR:M3-009, CR:M3-010, CR:M6-004, CR:X-007 |
| **InMemory (both)** | None | Full shared suite, no skips | None | CR:M3-007, CR:M3-009, CR:M3-010, CR:X-007 |

### 10.4 Gate semantics for environment-impossible checks

Per the shared matrix helper (SD1), the `providerCompatibility` shared suite is a **contract gate**, not a release gate. The following status semantics apply:

| Status | Definition | Example |
|---|---|---|
| **pass** | The shared suite passes with all applicable flags in the provider's documented environment | InMemory (both): full pass, no skips |
| **deferred** | The shared suite section was skipped via a documented flag (`skipMissingTimelineTests`, `versionConflictIsSoft`) and the skip reason is linked to a contract-recheck row or blocker entry | Runtime: checkpoints deferred (history is composition revisions) |
| **gap** | The shared suite section was not exercised and no alternative coverage exists | N/A — all current gaps have alternative coverage or documented deferral |
| **blocked** | The shared suite cannot exercise a section and no alternative coverage or deferral exists | None currently — all environment-impossible cases have documented resolutions |
| **release-blocking** | A gap without documented resolution that affects V1 supported claims | None — see [contract-recheck blocker section](./extension-platform-contract-recheck.md#3-blocker-section) for M14/M12/M11 blockers that are independent of provider compatibility |

**Cross-validation rule:** Every `skip*` flag or `versionConflictIsSoft` usage in a provider compatibility test file must have a corresponding row in this section (§10) linking to contract-recheck rows. The deferred-claims checker (SD2) enforces this: a deferred classification is valid only when backed by an absence check or explicit blocker entry. This section serves as the absence-check evidence for environment-impossible provider skips.

---

## 11. Version History

| Date | Change |
|---|---|
| 2026-06-19 | Initial provider compatibility matrix. Coverage: M3 TimelinePatch, Proposals, golden replay across InMemory, the cloud provider, Astrid. |
| 2026-06-20 | Added §10: environment-impossible provider checks with contract-recheck row links. Documents every skip flag, mock strategy, and delegated coverage path for the cloud provider and Astrid Bridge. InMemory (both variants) confirmed as environment-unrestricted canonical baseline. Added §11: version history.
| 2026-10-18 | Retired the Supabase (tag `pre-cloud-removal`) and Astrid Bridge providers from every table; added `RuntimeDataProvider` (§4.2, §10.1). |
