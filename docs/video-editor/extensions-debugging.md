# Extension Debugging — Astrid Video Editor V1

**Status:** Active (M15)
**Last updated:** 2026-06-20
**Audience:** Extension authors diagnosing activation failures, disposal errors, export guard warnings, and provider-specific behaviour.
**Prerequisite:** [Extension Author Contract](./extension-author-contract.md) (start at its §11 Getting started).

---

## 1. Purpose

This document is a practical debugging reference for Astrid extension authors. Every workflow or limitation is linked to concrete repository evidence — tests, examples, matrix rows, absence checks, or blocker entries. No advice relies on aspirational prose.

---

## 2. Console visibility

### 2.1 Lifecycle console grouping

Every extension activation and deactivation is wrapped in `console.groupCollapsed` / `console.groupEnd` with the extension ID as the label. Open your browser DevTools Console and filter for `[Extension lifecycle]`:

```
▼ [Extension lifecycle] haus.astrid.examples.flagship-local
    Activating extension "haus.astrid.examples.flagship-local" (v1.0.0)
    ... activation work ...
    Extension "haus.astrid.examples.flagship-local" activated successfully
```

**Evidence:** [Trust and Security §11.2](../extensions/trust-and-security.md#112-activation-lifecycle-visible-boundaries) (S-016). The trust envelope documents the exact console group format and lifecycle state transitions.

### 2.2 Diagnostic console echo

`ctx.chrome.toast()` calls are echoed to `console.log`/`console.warn`/`console.error` in dev. If a toast isn't appearing in the host UI, check the console for payload details.

**Evidence:** [Trust and Security §11.1](../extensions/trust-and-security.md#111-capability-visibility-table) (Chrome toasts / progress row).

### 2.3 Non-React error paths

Extensions can throw in non-React paths (event handlers, timers, `setTimeout` callbacks). These errors are **not caught** by `ContributionErrorBoundary`. Check the console for unhandled errors.

**Evidence:** [Trust and Security §11.3](../extensions/trust-and-security.md#113-what-trusted-local-does-not-mean) (S-017); [Author Contract §5.3](./extension-author-contract.md#53-error-boundaries).

---

## 3. Diagnostic system

### 3.1 The diagnostic shape

Every diagnostic published by an extension (or by the host on its behalf) conforms to:

```typescript
interface ExtensionDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;          // Dot-separated, extension-scoped
  message: string;       // Human-readable, no newlines
  extensionId?: string;  // Populated automatically
  contributionId?: string;
  milestone?: string;
  detail?: Record<string, unknown>;
}
```

**Evidence:** [Author Contract §3.1](./extension-author-contract.md#31-diagnostic-shape); `Diagnostic` types in `src/sdk/index.ts` (S-006).

### 3.2 Publishing diagnostics from your extension

```typescript
ctx.services.diagnostics.report({
  severity: 'warning',
  code: 'myExtension/validation-failed',
  message: 'Clip exceeds recommended duration.',
  contributionId: 'my-inspector-section',
  detail: { clipId: 'clip-0042', duration: 3600 },
});
```

**Example reference:** [code-panel-diagnostics-example.ts](../../src/examples/code-panel-diagnostics-example.ts) (docs-safe, EX) — publishes 3 structured diagnostics with source ranges and an export-blocker diagnostic.

### 3.3 Reading diagnostics at runtime

```typescript
const allDiagnostics = ctx.services.diagnostics.diagnostics;
// Returns all diagnostics for the current extension, frozen.
```

**Evidence:** [Author Contract §11.4.4](./extension-author-contract.md#1144-diagnostics-ctxservicesdiagnostics); `DiagnosticCollection` in `src/sdk/index.ts` (S-006).

### 3.4 Diagnostic surface locations

Diagnostics are surfaced in three host locations:

| Surface | What it shows | Debugging use |
|---|---|---|
| **DiagnosticPanel** (code panel slot) | All diagnostics, filterable by extension and severity | Check if your extension's diagnostics are being collected |
| **Status bar surface** | Summary count of active diagnostics per extension | Quick health check |
| **Export guard result** | `export/`-prefixed diagnostics from pre-render scan | Understand why export is blocked |

**Evidence:** [Frontend Closure Checklist](./frontend-closure-checklist.md) § 2.3; [Contract-Recheck CR:M2-008](./extension-platform-contract-recheck.md#23-m2--surfaces-inspectors-overlays-subscriptions).

### 3.5 Diagnostic fallback links

When a contribution fails to render, `ContributionErrorBoundary` renders a fallback UI with a "View diagnostics" action that opens the `DiagnosticPanel` filtered to the failing extension.

**Evidence:** [Frontend Closure Checklist §3](./frontend-closure-checklist.md#3-application-code-panel-canary); `ContributionErrorBoundary` in `TimelineEditorShellCore.tsx` (S-011, S-023).

---

## 4. Activation and disposal failures

### 4.1 Activation failure

If `activate()` throws:

1. The extension transitions to `failed` state.
2. The error is captured as an `error`-severity diagnostic (code: `lifecycle/activation-error`).
3. The console group shows:
   ```
   ▼ [Extension lifecycle] com.example.myExtension
       console.error('Extension "com.example.myExtension" failed during activation')
   ```

**Evidence:** [Trust and Security §11.2](../extensions/trust-and-security.md#112-activation-lifecycle-visible-boundaries) (S-016, S-017); [Contract-Recheck CR:M1-002](./extension-platform-contract-recheck.md#22-m1--sdk-kernel-and-trusted-local-extension-runtime).

**Common causes:**
- Importing from an internal path (`src/tools/video-editor/`) instead of `@astrid/editor-sdk`. Run `node scripts/quality/check-extension-example-readiness.mjs --audit` to verify.
- Returning a `DisposeHandle` that throws from `dispose()`.
- Registering duplicate contribution IDs.
- Invalid extension or contribution IDs (must match `/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)*$/i`).

### 4.2 Disposal failure

The lifecycle host calls `dispose()` on every `DisposeHandle` returned by `activate()`. Disposal failures are captured as `error`-severity diagnostics (code: `lifecycle/teardown-error`) but **never thrown** — the lifecycle continues.

**Evidence:** [Trust and Security §11.1](../extensions/trust-and-security.md#111-capability-visibility-table) (Shutdown / dispose row); [Author Contract §2.2](./extension-author-contract.md#22-extension-lifecycle) (S-017).

**Debugging checklist:**
1. Ensure `dispose()` is **idempotent** — safe to call multiple times.
2. Ensure `dispose()` **does not throw** — wrap in try/catch if needed.
3. Verify all service handles (`ctx.commands.registerCommand()`, `ctx.effects.registerComponent()`, etc.) are disposed.
4. Check that host service cleanup (`disposeHostServices()`) is not depended on for ordering.

### 4.3 Disabling an extension

When an extension is disabled (provider props change or user toggle), the runtime calls `dispose()` on all records owned by that extension and removes stale registry diagnostics/status. Dedicated disable-dispose tests are deferred (D-073).

**Evidence:** [Supported/Deferred Matrix D-073](./extension-platform-supported-deferred.md#37-provider-registry--edge-cases-m5); [Contract-Recheck CR:M5-012](./extension-platform-contract-recheck.md#26-m5--provider-scoped-registry-foundation-and-trusted-loader-lifecycle).

---

## 5. Export guard diagnostics

### 5.1 Pre-render scan

Before render, `runExportGuard()` scans the timeline config for:

| Condition | Severity | Code | Blocks export? |
|---|---|---|---|
| Unknown clip type (no declaring extension) | `error` | `export/unknown-clip-type` | Yes |
| Unknown effect (no declaring extension) | `error` | `export/unknown-effect` | Yes |
| Unknown transition (no declaring extension) | `error` | `export/unknown-transition` | Yes |
| Extension-declared ID from **inactive** contribution | `warning` | `export/missing-extension` | No (render proceeds) |
| Missing render materializer for shader | `error` | `export/shader-no-materializer` | Yes |

**Evidence:** [Author Contract §6.2](./extension-author-contract.md#62-export-guard-integration) (S-062); `runExportGuard()` in `src/tools/video-editor/runtime/renderability.ts` (CR:M5-005).

### 5.2 Missing extension references

When a project references an extension that is not currently active, the export guard emits `warning`-severity diagnostics (code: `export/missing-extension`) but does **not** block render. Unknown clip types from missing extensions produce `export/unknown-clip-type` separately.

**Evidence:** [Provider Compatibility Matrix §3.5](./provider-compatibility-matrix.md#35-missing-extension-references) — all three providers handle this identically.

### 5.3 Debugging export blockages

1. Check the export guard diagnostics in the DiagnosticPanel.
2. Verify that all clip types, effects, and transitions used in the timeline are declared in an active extension's manifest `contributions`.
3. If a contribution is declared but the extension is inactive, you'll see `export/missing-extension` (warning). Activate the extension to clear it.
4. For shader exports, verify that a materializer route exists (deferred in V1 — see D-100).

---

## 6. Provider-specific limitations

### 6.1 InMemoryDataProvider

**Environment:** Any JS runtime. No persistence.

**Debugging notes:**
- All state is lost on page refresh — check if you reloaded.
- No checkpoint persistence — `saveCheckpoint` / `loadCheckpoints` are not implemented.
- Asset URLs use `memory://` prefix — network fetches won't resolve them.

**Evidence:** [Provider Compatibility Matrix §4.1](./provider-compatibility-matrix.md#41-inmemorydataprovider); TEST:`InMemoryDataProvider.test.ts` (13 tests, S-140).

### 6.2 RuntimeDataProvider

**Environment:** Requires a connected Workspace Runtime (workspace.v1) reachable through the `/api/runtime` proxy. `dev:editor` and the e2e suite use the fake Runtime in `tests/e2e/fake-runtime/`.

**Debugging notes:**
- If no Runtime is connected the editor shows the connect-the-local-workspace state and builds no provider.
- `saveTimeline(id, config, expectedVersion)` always throws `TimelineVersionConflictError`: Runtime authorizes writes by head revision, so saves go through `saveTimelineAtHead` with the head that was loaded.
- `TimelineVersionConflictError` from a head-checked save means another writer moved the canonical head between your read and write. Re-read the snapshot and retry.
- `saveCheckpoint` / `loadCheckpoints` are not implemented; history is Runtime composition revisions.
- `config.output` is host-derived: saves drop it and loads re-materialise defaults.
- `createExtensionPersistenceService` is not provided, so extension settings, state and proposals report the corresponding unsupported-capability diagnostics.
- Asset URLs resolve only through managed objects; a registry entry without a managed object id fails to resolve.

**Evidence:** [Provider Compatibility Matrix §4.2, §10.1](./provider-compatibility-matrix.md#42-runtimedataprovider); TEST:`providerCompatibility.runtime.test.ts` and `src/integrations/runtime/dataProvider.test.ts` (S-141).

### 6.4 Provider-agnostic debugging

Diagnostics are **provider-agnostic** — the pure `validateTimelinePatch` and `compileTimelinePatch` functions produce identical diagnostic shapes regardless of provider. The only provider-specific diagnostic path is `TimelineVersionConflictError` translation.

**Evidence:** [Provider Compatibility Matrix §3.4](./provider-compatibility-matrix.md#34-diagnostics).

---

## 7. TimelinePatch debugging

### 7.1 Stale base version errors

If `ctx.creative.timeline.apply(patch)` fails with a version conflict:

1. The patch's `version` field must match the current timeline's `configVersion`.
2. Re-read the snapshot: `const snapshot = ctx.creative.reader.snapshot()`.
3. Update the patch's `version` to `snapshot.baseVersion`.
4. When `patch.version === 0`, the check is bypassed (treated as "no expectation").

**Evidence:** [Provider Compatibility Matrix §3.3](./provider-compatibility-matrix.md#33-proposal-base-versions) — version conflict behavior across all providers.

### 7.2 Oversized project-data payloads

Extension project-data is limited to:
- **Per entry:** 64 KB (`MAX_ENTRY_BYTES`)
- **Per extension total:** 1 MB (`MAX_EXTENSION_TOTAL_BYTES`)
- **Per extension entries:** 128 (`MAX_ENTRIES_PER_EXTENSION`)

Overflow produces `ProjectDataLimitDetail` diagnostics with `extensionId`, `limit`, `actual`, `unit`, and `code` fields.

**Evidence:** [Provider Compatibility Matrix §7](./provider-compatibility-matrix.md#7-extension-project-data-limits-by-provider); [TimelinePatch Operations §3.11](./timeline-patch-operations.md).

### 7.3 Reserved operations

`clip.split` and `clip.slice` produce `warning` diagnostics with `{ reserved: true, deferred: true }` — they are never executed. If you see unexpected warnings, check that your patch isn't using these reserved families.

**Evidence:** [Supported/Deferred Matrix D-110](./extension-platform-supported-deferred.md#311-timelinepatch--reserved-operations); [Contract-Recheck CR:M3-016](./extension-platform-contract-recheck.md#24-m3--timelinepatch-atomic-ops-proposals).

---

## 8. Common failure modes reference

| Symptom | Likely cause | Debugging step | Evidence link |
|---|---|---|---|
| Extension doesn't appear in toolbar | Slot contribution not declared or `kind` mismatch | Check manifest `contributions` array; verify `slot` field matches `VideoEditorSlotName` | [Author Contract §11.3.1](./extension-author-contract.md#1131-slot-contributions-toolbar-statusbar-codepanel-etc) |
| Activation throws; extension in `failed` state | `activate()` threw or invalid import path | Check console for `[Extension lifecycle]` group; verify `@astrid/editor-sdk` imports | [§4.1](#41-activation-failure) |
| Diagnostic not appearing in panel | Diagnostic code not namespaced or contributionId missing | Add `contributionId`; use extension-scoped code (e.g. `myExt/validation-failed`) | [Author Contract §3.3](./extension-author-contract.md#33-diagnostic-conventions) |
| Export blocked with `export/unknown-clip-type` | Clip type not declared in any active extension's manifest | Add `kind: 'clipType'` contribution to your manifest; ensure extension is active | [§5.1](#51-pre-render-scan) |
| `TimelineVersionConflictError` on apply | Patch version doesn't match timeline | Re-read snapshot, update `patch.version` | [§7.1](#71-stale-base-version-errors) |
| Extension state not persisting across reloads | InMemory is ephemeral; `RuntimeDataProvider` provides no extension persistence service and reports the capability as unsupported | Check for the unsupported-capability diagnostic; keep durable extension data in timeline project data (patch `project-data.write`) | [§6.1](#61-inmemorydataprovider), [§6.2](#62-runtimedataprovider) |
| `TimelineVersionConflictError` from a numeric `saveTimeline` | Runtime authorizes writes by head revision and refuses numeric-only saves | Save through `saveTimelineAtHead` with the head that was loaded | [Provider Compatibility §4.2](./provider-compatibility-matrix.md#42-runtimedataprovider) |
| Editor shows the connect-the-local-workspace state | No Workspace Runtime is connected, so no provider is built | Connect the Runtime, or follow the fake Runtime preview in the [repository README](../../README.md) | [Provider Compatibility §10.1](./provider-compatibility-matrix.md#101-runtimedataprovider--environment-prerequisites) |
| Extension doesn't clean up on disable | `dispose()` not returning handles from service registrations | Return a `DisposeHandle` that calls `.dispose()` on all service handles | [Author Contract §5.4](./extension-author-contract.md#54-service-cleanup) |

---

## 9. Automated quality checks

### 9.1 Import boundary check

```bash
node scripts/quality/check-extension-example-readiness.mjs --audit
```

Verifies that every example imports exclusively from `@astrid/editor-sdk`. Run this before debugging — an internal import is the most common activation failure cause.

**Evidence:** [Author Contract §10](./extension-author-contract.md#10-pre-doc-example-readiness-gate); [Contract-Recheck CR:X-001, CR:X-002](./extension-platform-contract-recheck.md#216-cross-milestone--structural-claims).

### 9.2 Contract recheck

```bash
node scripts/quality/check-extension-contract-recheck.mjs --audit
```

Checks that all contract-recheck rows have valid evidence references. Useful for verifying that the debugging workflows you're following are backed by current evidence.

**Evidence:** [Contract-Recheck Matrix](./extension-platform-contract-recheck.md).

### 9.3 Deferred claims check

```bash
node scripts/quality/check-extension-deferred-claims.mjs --audit
```

Verifies that every deferred classification is backed by an absence check or blocker entry (SD2). If you're debugging a deferred feature, this confirms the deferral is documented.

**Evidence:** [Supported/Deferred Matrix §1.1](./extension-platform-supported-deferred.md#11-classification-definitions).

---

## 10. When to escalate

The following behaviours are **deferred** or **unsupported** in V1. If you encounter them, they are known gaps — do not spend time debugging them:

| Behaviour | Classification | Reference |
|---|---|---|
| Extension manager UI (install, enable/disable, settings edit) | Deferred (M14) | D-001–D-010, B-001 |
| Render planner / export UI | Deferred (M12) | D-020–D-027, B-002 |
| Live data bridge frontend states | Deferred (M11) | D-030–D-037, B-003 |
| Agent tool workflow validation / frontend | Deferred (M10) | D-040–D-047 |
| Permission enforcement | Deferred (M4–M5) | D-120–D-122 |
| Sandboxed execution | Deferred (M4–M5) | D-121 |
| Marketplace / cloud extension loading | Unsupported | D-123, CR:X-006 |
| Dynamic package loading from npm/CDN | Deferred | D-122 |
| Theme contributions | Unsupported | Absence check: `grep -r 'theme.*contribution' src/sdk/index.ts` |

**Evidence:** [Supported/Deferred Matrix §3–4](./extension-platform-supported-deferred.md); [Contract-Recheck Blocker Section §3.1](./extension-platform-contract-recheck.md#31-release-blocking-gaps).

---

## 11. Cross-reference

| Document | Relevance |
|---|---|
| [trust-and-security.md](../extensions/trust-and-security.md) | V1 execution context, lifecycle visibility, error containment |
| [extension-author-contract.md](./extension-author-contract.md) | Diagnostic contract, dispose obligations, renderability |
| [extension-platform-supported-deferred.md](./extension-platform-supported-deferred.md) | Full supported/deferred classification (84 supported, 69 deferred) |
| [extension-platform-contract-recheck.md](./extension-platform-contract-recheck.md) | Complete M0–M14 Done Criteria evidence |
| [provider-compatibility-matrix.md](./provider-compatibility-matrix.md) | Provider-specific limitations and environment prerequisites |
| [frontend-closure-checklist.md](./frontend-closure-checklist.md) | Diagnostic fallback links, frontend state coverage |
| [timeline-patch-operations.md](./timeline-patch-operations.md) | Complete TimelinePatch operation reference |

---

## 12. Version history

| Date | Change |
|---|---|
| 2026-06-20 | Initial debugging guide for M15. Covers console visibility, diagnostic system, activation/disposal failures, export guard, provider-specific limitations, TimelinePatch debugging, common failure modes, automated quality checks, and deferred/unsupported escalation paths. All workflows linked to tests, examples, matrix rows, and blockers. |
