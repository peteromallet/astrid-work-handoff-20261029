# Trust And Security Posture — Astrid Video Editor V1

**Status:** Active (M5)
**Last updated:** 2026-06-24
**Scope:** Honest description of the current trusted/unsandboxed execution posture. This document records what *is* — not what is planned or aspirational. The posture described here is the locked V1 posture.

---

## Current release scope

The current manifest release's security-boundary claim is limited to the
reviewed statically bundled trusted-local extensions shipped in this release.
Arbitrary third-party,
remote, marketplace, and dynamically installed extension execution remains
disabled and unclaimed. The release checklist covers manifest and contribution
validation, namespace and least-privilege host-mediated checks, rejection of
unsafe URLs/injection/traversal/oversized payloads, and host-selected
project/timeline access.

The current host-mediated tier binds `TimelineReader` and `TimelineOps` to the
host-selected document; the extension API exposes no provider handle or
project/timeline selector. This is a provider-scope boundary, not a claim of
runtime isolation. The scope does not change V1's unsandboxed execution model
or imply runtime permission enforcement, CSP subdivision, process isolation,
signing, or a capability broker for untrusted code.

---

## 1. Execution Model

Extensions execute as **trusted, unsandboxed code** in the host browser environment.

| Property | V1 Reality |
|---|---|
| Execution context | Same-thread, same-origin JavaScript as the Astrid editor |
| Process isolation | None — no Worker, no iframe, no ShadowRealm boundary |
| DOM access | Full same-origin DOM access |
| Network access | Full same-origin `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` |
| Browser APIs | Unrestricted access to all browser APIs available to the host origin |
| Storage | `localStorage` (scoped to `astrid.ext.<id>.*` keys), `sessionStorage`, IndexedDB |
| Package loading | Extensions are statically bundled with the host Vite/TypeScript build; no dynamic `import()`, no CDN fetches |

There is **no sandbox, no iframe isolation, no CSP subdivision, and no process boundary** between extensions and the host.

---

## 2. Permission Model

### 2.1 Manifest permissions are descriptive only

The `permissions` field in `astrid-extension.json` is validated and frozen by `defineExtension()`, but it is **purely descriptive metadata**. An extension that declares `network: false` can still call `fetch()`. The field exists so extension authors can document their intent today, and so the schema is stable when capability enforcement is introduced in a later milestone.

**There is no runtime permission enforcement, no permission broker, and no capability-based gating in V1.**

```typescript
// From src/sdk/index.ts — ExtensionPermissionDeclaration
interface ExtensionPermissionDeclaration {
  reason: string;
  posture?: {
    network?: boolean;
    filesystem?: boolean;
    env?: boolean;
    processes?: boolean;
  };
}
```

### 2.2 What permissions are NOT

- They are **not** enforced at runtime.
- They are **not** presented to users as a permission prompt.
- They are **not** used to gate browser API access.
- They are **not** a sandbox declaration.
- They are **not** a substitute for code review.

---

## 3. Trust Warning

The Extension Manager displays a persistent trust warning during loading, empty, populated, selected-package, and error states:

> ⚠️ Trusted-local extension: this extension executes with full browser-renderer privileges. Review the extension source before enabling it in a shared project.

This warning is a **product requirement**, not just documentation. It must remain visible in all manager states.

**Implementation:** `src/tools/video-editor/components/ExtensionManager/ExtensionManager.tsx` — trust warning rendered in the PackageCard component.

---

## 4. Error Containment

### 4.1 Contribution-level error boundaries

React-rendered extension contributions (slots, panels, inspector sections, dialogs, overlays) are wrapped in `HostContributionErrorBoundary` (`src/tools/video-editor/runtime/ContributionErrorBoundary.tsx`). When an extension-owned contribution crashes during render:

1. The boundary catches the error and renders a fallback UI (preserved from the original `ContributionErrorBoundary`).
2. A structured diagnostic is published with the extension ID and contribution ID.
3. A "View diagnostics" action links to the `DiagnosticPanel` filtered to the failing extension.
4. The boundary supports **bounded auto-retry** (max 3 retries, 5-second debounce) when recovery keys change.

### 4.2 What is NOT contained

- Errors thrown in `activate()` are captured as lifecycle diagnostics; the extension transitions to `failed` state.
- Errors thrown in event handlers, timers, or async callbacks are **not** caught by error boundaries.
- Errors thrown from `dispose()` are captured as diagnostics but never propagated — the `DisposeHandle` contract requires idempotent, non-throwing disposal.
- Non-React paths (e.g., direct DOM manipulation, canvas operations) are not wrapped.

**Authors must handle their own errors** in non-React execution paths and use `ctx.services.diagnostics.report()` to publish structured error information.

---

## 5. Diagnostic Provenance

Every diagnostic carries a `source` field that identifies its provenance:

| Source | Meaning | Set by |
|---|---|---|
| `extension` | Authored by a trusted local extension | `createExtensionDiagnosticsService.report()` (lifecycle host pins this) |
| `render` | Emitted by the host render pipeline | Host renderability checks (`runExportGuard()`, planner) |
| `provider` | Emitted by a host provider | Editor runtime, lifecycle host |

**Extensions cannot spoof diagnostic provenance.** In `src/tools/video-editor/runtime/extensionLifecycle.ts`, `createExtensionDiagnosticsService.report()` always pins `source: DIAGNOSTIC_SOURCE_EXTENSION` and overwrites any `extensionId` passed by the caller with the lifecycle-owned extension ID. The SDK contract (`src/sdk/index.ts`) declares that extensions MUST NOT set host-owned sources.

**Capacity:** Per-extension diagnostic capacity is bounded (default 100) with oldest-first eviction. Diagnostics from disposed extensions are cleaned up automatically during lifecycle disposal.

---

## 6. Recovery Key System

The `ExtensionLifecycleHost` (`src/tools/video-editor/runtime/extensionLifecycle.ts`) owns a monotonic recovery-key registry per extension. Recovery keys are:

- **Monotonic**: initialized to `"1"` on first activation, incremented on manifest change, re-add, or explicit retry.
- **Stable**: unchanged across no-op synchronize calls.
- **Lifecycle-owned**: the lifecycle host, not the extension or the UI, controls key increments.
- **Not user-controlled**: there is no public API for extensions to reset their own recovery key.

When `HostContributionErrorBoundary` detects a recovery key change for the owning extension, it resets the error state and re-renders the children — exactly once per key change. The bounded retry loop (max 3 retries with 5-second debounce) prevents infinite crash loops from persistent render errors.

---

## 7. Surface Audit: What Uses Recovery-Aware Boundaries

All production contribution boundaries that have a known owning extension are migrated to `HostContributionErrorBoundary`:

| Surface | File | Owner Resolution |
|---|---|---|
| Timeline slots (14 boundaries) | `TimelineEditorShellCore.tsx` | `slotOwnerMap` memo — resolves slot name → extensionId from manifest contributions |
| Inspector sections | `PropertiesPanel.tsx` | `extensionRuntime.contributionOwnerMap` via `useOptionalVideoEditorRuntime()` |
| Asset panel surface | `VideoEditorAssetPanelSurface.tsx` | `extensionRuntime.contributionOwnerMap` |
| Clip panel | `ClipPanel.tsx` | `clipTypeRegistryRecord.ownerExtensionId` |

When no extensionId is available or the runtime context is unavailable, the boundary falls back to legacy behavior (children-change reset, no recovery key).

---

## 8. Extension Manager Inventory Truthfulness

The Extension Manager (`src/tools/video-editor/components/ExtensionManager/ExtensionManager.tsx`) uses `PackageStateInventoryEntry[]` as the card source of truth:

- **Direct host-supplied extensions** appear as read-only entries with `stateReason: 'Direct host-supplied extension'`, a "Direct" badge, and no install/update/toggle affordances.
- **Managed (repository-backed) extensions** show load/enable/disable state from the loader.
- **Disabled/error packages** surface manifest-derived `PackageContributionSummary` (computed by `computePackageContributionSummary()` in `extensionSurface.ts`) so contribution counts and kind labels survive without active runtime descriptors.
- The inventory is **not** a marketplace, install surface, or update manager. Direct entries cannot be installed, updated, or toggled.

---

## 9. What V1 Does NOT Provide

V1 explicitly does **not** provide:

| Feature | Status |
|---|---|
| Sandbox / iframe isolation | **Not present.** Extensions run in the same JS context as the host. |
| Permission enforcement / broker | **Not present.** Permissions are descriptive metadata only. |
| Code signing / integrity verification at load time | **Not present.** Source vetting is human review only. |
| Marketplace / extension registry | **Not present.** Extensions are statically bundled or loaded from local source. |
| Remote extension installation or update | **Not present.** No remote fetch, no CDN, no dynamic `import()`. |
| CSP subdivision | **Not present.** |
| Process isolation (Worker, ShadowRealm) | **Not present.** |
| Capability-based security proxy | **Not present.** |
| User-facing permission prompts for extension capabilities | **Not present.** |
| Automated provenance chain / audit log for extension actions | **Not present.** |

---

## 10. When Will Enforcement Arrive?

Sandboxing, permission enforcement, integrity verification, and user-facing permission prompts are tracked as future work beyond M5. Before extensions can be safely loaded from untrusted sources, all four must exist:

1. Capability enforcement (the `permissions` field gates actual browser API access).
2. Process isolation (separate JavaScript realm with capability-based host proxy).
3. Integrity verification (content hashing and signature verification for remote sources).
4. User-facing permission prompts (host presents permission dialog before granting capabilities).

Until then, the posture is explicit: **every extension is trusted code with the same privileges as the Astrid editor itself.**

---

## 11. V1 Trust Envelope

Capability-by-capability detail behind the posture above. The execution model
is §1, the descriptive permission metadata is §2, and the enforcement
prerequisites are §10.

### 11.1 Capability visibility table

The table lists each capability surface, its V1 posture, how the host surfaces it (logs, diagnostics, console grouping), and the earliest milestone where enforcement or isolation is expected.

| Capability | V1 posture | Host visibility | Earliest enforcement milestone |
|---|---|---|---|
| **Parser code** (contribution kind `parser`) | **Supported in V1.** Extensions can declare `parser` contributions that enrich uploaded assets (e.g. integrity hashes). The runtime validates the manifest and the host can route matching assets to declared parsers at ingest time. Custom parser execution is still trusted-local code. | Info diagnostic: `runtime/contribution-kind-not-yet-bridged` for unimplemented kinds; parser contributions emit `runtime/parser-registered` and validation diagnostics. | M4 (for sandboxed/isolated parser execution) |
| **Package loading** (`npm` / CDN / dynamic import) | Extensions are statically bundled with the host app. No dynamic package loading, no CDN fetches, no `import()` for extension code. The extension module graph is part of the host Vite/TypeScript build. | Not surfaced — there is no package-loading API. | M4+ (if ever) |
| **Edge-tool / agent-tool declarations** (contribution kind `agentTool`) | **Supported in V1.** Extensions can declare `agentTool` contributions that appear in the editor's agent tool palette. The runtime validates the manifest, registers tool metadata, and surfaces the tool in the UI. Actual tool invocation is dispatched through host agent services; extensions do not run agent inference themselves. | Info diagnostic: `runtime/contribution-kind-not-yet-bridged` for unimplemented kinds; agent tools emit registration diagnostics and, on invocation, structured proposal/accept/reject flows. | M5 (for untrusted-agent sandboxing) |
| **Browser permission helpers** (`navigator.permissions`, clipboard, notifications, etc.) | Extensions have **unrestricted access** to all browser APIs available to the host origin — same as any script on the page. No permission gating, no user-prompt mediation. | Not mediated by the extension runtime. Standard browser permission prompts (e.g. clipboard) fire as usual — the host does not intercept them. | M4+ (if a permission model is introduced) |
| **Local processes** (`ProcessManifestEntry`) | **Declared and schema-supported in V1; actual execution deferred.** The `processes` field is validated, frozen, and surfaced in the extension manifest. `ProcessSpawnConfig` / `ProcessRuntime` shapes exist in the SDK and the runtime can register process metadata. `ctx.services.invokeProcess()` returns a structured `not-available` diagnostic — no subprocess is spawned, no JSON-RPC/correlation layer is active. | Diagnostics: `runtime/process-not-implemented` on any invocation attempt. Process declarations appear in the extension runtime summary. | M5+ (if local process support is introduced) |
| **Filesystem** | Extensions have **same-origin access** to `localStorage` (scoped per-extension via the `astrid.ext.<id>.` key prefix), `sessionStorage`, and IndexedDB. No direct filesystem API (`showOpenFilePicker`, File System Access API) is mediated or restricted by the extension runtime. | Settings reads/writes/deletes are scoped to `astrid.ext.<id>.*` localStorage keys. All keys written during an activation are cleaned up on dispose by `disposeHostServices()`. Not logged to diagnostics by default (internal to the settings service). | M4+ |
| **Environment variables** | No access to server-side environment variables. The browser has no `process.env`. Build-time env vars (`VITE_*`) are inlined by Vite and available to all code equally — no per-extension gating. | Not surfaced. | N/A (browser constraint) |
| **Network** | Extensions can use `fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` with the same origin/CORS rules as the host page. The runtime does **not** intercept, throttle, or log network requests. | Not surfaced by the extension runtime. Standard browser dev-tools network tab applies. | M4+ |
| **Dev-console grouping** | Activation and deactivation are wrapped in `console.groupCollapsed` / `console.groupEnd` with the extension ID as the label. This makes extension lifecycle boundaries visible in the browser console. | Console groups: `[Extension lifecycle] haus.astrid.examples.flagship-local` at activation time. Activation start, success, and failure are logged with `console.log`/`console.error`. | N/A (already visible) |
| **Diagnostics (structured)** | Extension code can emit structured `ExtensionDiagnostic` records (severity + code + message) via `ctx.services.diagnostics.report()`. The host collects and surfaces these in the `ExtensionRuntime.diagnostics` array. Export guard diagnostics use the same shape but with export-prefixed codes. | Diagnostics are frozen, collected per-extension, and readable via `ctx.services.diagnostics.diagnostics`. Lifecycle errors (activation/teardown throws) are captured as diagnostics automatically. | N/A (already visible) |
| **Chrome toasts / progress** | `ctx.chrome.toast()` and `ctx.chrome.progress()` call into the host chrome service. In dev, toasts are echoed to `console.log`/`console.warn`/`console.error`. Progress updates are dispatched to chrome subscribers. | Console echo of toast messages. Subscribers receive typed payloads (`ChromeToastPayload`, `ChromeProgressPayload`). | N/A (already visible) |
| **Shutdown / dispose** | The lifecycle host calls `dispose()` on every `DisposeHandle` returned by `activate()`. Host-owned services (settings localStorage keys, chrome event subscribers) are cleaned up via `disposeHostServices()` attached to the context via `CONTEXT_DISPOSE_SYMBOL`. Provider unmount calls `disposeAll()` idempotently. | Disposal success is silent. Disposal failures are captured as `error`-severity diagnostics (code: `lifecycle/teardown-error`) — the lifecycle never throws from dispose. | N/A (already visible via diagnostics) |
| **Export guard diagnostics** | **Supported in V1.** `runExportGuard()` scans the timeline before render/export for unknown clip types, effects, and transitions, missing transition IDs, and active live sources. Active extension-declared IDs are recognized. Errors block export; warnings are surfaced but non-blocking. | Diagnostics are emitted into `ExportGuardResult.diagnostics` / `ExportGuardResult.findings` and surfaced via the render log/status. The empty-extension-runtime fast path skips the guard entirely. | M3 (originally); fully wired in M7/M11 |
| **Shader contributions** (clip-local & postprocess) | **Supported in V1.** Extensions can declare `clip-local-shader` and `postprocess-shader` contributions with GLSL source, compile diagnostics, uniform schemas, and picker registration. The runtime validates the shader, registers it in the editor shader catalog, and surfaces compile errors as diagnostics. V1 composition limits apply: one shader per clip/postprocess, no multi-shader stacks. | Diagnostics: shader compile errors, unsupported-feature warnings, and registration confirmations. Uniform editing and A/B/bypass preview wiring exist in the frontend. | M13 |

### 11.2 Activation lifecycle (visible boundaries)

Every extension activation is wrapped in visible console grouping:

```
console.groupCollapsed('[Extension lifecycle] haus.astrid.examples.flagship-local')
  console.log('Activating extension "haus.astrid.examples.flagship-local" (v1.0.0)')
  // ... extension activate() runs ...
  console.log('Extension "haus.astrid.examples.flagship-local" activated successfully')
console.groupEnd()
```

If activation throws:
```
console.error('Extension "haus.astrid.examples.flagship-local" failed during activation')
// Error details are included in the console group and captured as a lifecycle diagnostic.
```

Deactivation/disposal is similarly grouped. All lifecycle state transitions (inactive → activating → active → deactivating → disposed) emit structured diagnostics via the per-extension diagnostics service.

### 11.3 What "trusted-local" does NOT mean

| Assertion | Reality in V1 |
|---|---|
| "The extension is sandboxed." | **False.** No sandbox exists. |
| "The extension can only access declared permissions." | **False.** Permissions are descriptive metadata only. |
| "The extension's network access is limited." | **False.** Full same-origin `fetch` access; no runtime mediation. |
| "The extension runs in a Web Worker." | **False.** Extensions run on the main thread, same as the host. |
| "The extension can't access the DOM." | **False.** Extensions have full DOM access (same origin). |
| "The extension's errors can't break the editor." | **Mostly false.** Contribution-level error boundaries (`ContributionErrorBoundary`) catch React render errors within extension-contributed slots/dialogs/panels/inspector sections, but an extension can still throw in `activate()` or in non-React paths (event handlers, timers) and those errors are **not** caught by an error boundary. Activation-time throws are captured as diagnostics and the extension transitions to `failed` state. |

### 11.4 Where the trusted-local model is appropriate

The current trust model is appropriate for:

- **Personal projects** where the developer authors or vets all extensions.
- **Internal team workflows** where extensions are shared as source code and reviewed.
- **Open-source extensions** where the source is publicly auditable.

The prerequisites for loading extensions from untrusted sources are listed in §10.

### 11.5 Summary

| Concern | V1 answer |
|---|---|
| Execution context | Same-thread, same-origin JavaScript in the browser |
| Isolation | None |
| Permission enforcement | Descriptive only (no runtime gating) |
| Lifecycle visibility | Console groups + structured diagnostics + export guard |
| Service cleanup | Idempotent dispose (settings localStorage, chrome subscribers, DisposeHandle) |
| Error containment | Contribution-level error boundaries for React slots; activation-time throws → `failed` state + diagnostics |
| Export safety | Pre-render scan errors/warns on unknown clip types, effects, transitions, missing transition IDs, and active live sources; active extension-declared IDs are recognized |
| Parser / asset metadata | Supported (M6): parser contributions enrich uploaded assets at ingest time |
| Agent tools | Supported (M10): manifest-declared, host-dispatched, proposal/accept/reject flow |
| Processes | Schema + registration supported; actual spawn/correlation/cancellation deferred (M12/D-004) |
| Shaders | Supported (M13): clip-local and postprocess GLSL contributions with compile diagnostics and uniform editing |
| Dynamic package loading | Deferred: extensions are statically bundled with the host build |
| Source vetting | Human review required; no automated integrity checks in V1 |

---

## 12. Cross-Reference

| Document | Relevance |
|---|---|
| `docs/video-editor/extension-author-contract.md` | Author-facing contract including trust obligations |
| `docs/video-editor/extension-platform-contract-recheck.md` | M0–M14 Done Criteria evidence matrix |
| `src/sdk/index.ts` | Public SDK types including `ExtensionPermissionDeclaration`, `DiagnosticSource`, `DisposeHandle` |
| `src/tools/video-editor/runtime/extensionLifecycle.ts` | Lifecycle host with recovery-key registry and diagnostic provenance pinning |
| `src/tools/video-editor/runtime/ContributionErrorBoundary.tsx` | `HostContributionErrorBoundary` and `ContributionErrorBoundary` |
| `src/tools/video-editor/runtime/extensionSurface.ts` | Runtime normalization, `PackageContributionSummary`, `PackageStateInventoryEntry` |
| `src/tools/video-editor/components/ExtensionManager/ExtensionManager.tsx` | Extension manager UI with trust warning and direct-entry read-only rendering |

---

## 13. Version History

| Date | Change |
|---|---|
| 2026-06-24 | Initial trust and security posture document for M5. Covers execution model, permission posture, error containment, diagnostic provenance, recovery keys, boundary audit, inventory truthfulness, and explicit non-provision of sandbox/marketplace/install/update. |
| 2026-08-25 | Recorded the release claim as limited to reviewed statically bundled trusted-local extensions; arbitrary third-party, remote, marketplace, and dynamically installed execution remains disabled and unclaimed. |
