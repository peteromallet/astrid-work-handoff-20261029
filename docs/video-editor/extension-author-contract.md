# Extension Author Contract — Astrid App Video Editor V1

**Status:** Active (M15)
**Last updated:** 2026-06-20
**Audience:** Extension authors who need to understand the exact contractual guarantees, obligations, and limitations of the V1 extension platform.
**Prerequisite gate:** [Example readiness](./extension-platform-supported-deferred.md) (M15 pre-doc gate, passed 2026-06-20).

---

## 1. Purpose

This document defines the **developer contract** between extension authors and the Astrid App V1 extension platform. It specifies:

1. What the platform **guarantees** to extension authors (invariants, lifecycle, services).
2. What extension authors **must** do (import boundary, dispose contract, diagnostic conventions).
3. What is **explicitly deferred** or **unsupported** in V1.

This contract is backed by the [supported/deferred matrix](./extension-platform-supported-deferred.md) (103 supported rows, 70 deferred rows) and the [trust and security posture](../extensions/trust-and-security.md). Every supported claim is traceable to concrete evidence — tests, examples, absence checks, or contract-recheck rows.

---

## 2. Platform guarantees

### 2.1 Public SDK boundary

| Guarantee | Evidence |
|---|---|
| `@astrid/editor-sdk` is the **only** public import path for extensions | S-001, S-154 |
| Package aliases resolve `@astrid/editor-sdk` → `src/sdk/index.ts` | S-002 |
| The SDK boundary test runs without importing editor internals | S-003, S-154 |
| No internal `DataProvider`, `applyEdit`, or mutation escape hatches leak from SDK entrypoints | S-014, S-152 |
| SDK exports are governed by a public-export allowlist (`config/governance/sdk-public-export-allowlist.json`) | S-152 |

**Author obligation:** Import exclusively from `@astrid/editor-sdk`. Internal imports (`src/tools/video-editor/`, `@/tools/`, etc.) are violations. The pre-doc example readiness gate enforces this mechanically.

### 2.2 Extension lifecycle

| Guarantee | Evidence |
|---|---|
| Extensions are imported, registered, and rendered by the host provider | S-010 |
| Provider-scoped lifecycle: activate → deactivate → dispose per provider instance | S-012 |
| Removing an extension from provider props unregisters its contributions | S-013 |
| Activation/deactivation wrapped in visible `console.groupCollapsed`/`console.groupEnd` | S-016 |
| Lifecycle teardown failures captured as diagnostics, never thrown | S-017 |
| HMR-safe re-registration and stale component cleanup | S-015 |
| `DisposeHandle` contract: idempotent, must not throw | S-005 |

**Author obligation:** The `dispose()` function returned from `activate()` must be **idempotent** (safe to call multiple times) and **must not throw**. The platform guarantees disposal failures are captured as diagnostics; the author must not rely on dispose exceptions for error signalling.

### 2.3 Contribution surfaces

| Guarantee | Evidence |
|---|---|
| Host slots: header, toolbar, leftPanel, rightPanel, codePanel, writingPanel, stagePanel, timelineFooter, statusBar, dialogs, assetPanel, inspectorPanel | S-020 |
| Inspector and overlay contributions update on host state changes | S-021 |
| Timeline overlay contributions are host-rendered through a required `render` id bound via `ctx.ui.registerRenderer()`; overlays without a registered renderer are omitted (no callable placeholder) | S-165 |
| Timeline overlay renderers receive geometry, viewport/playhead stores, selection, a boolean pointer-claim API, and the host-owned ruler-only `markerLayer` primitive | S-166, S-167 |
| Overlay gesture arbitration is passive: unclaimed wrappers are click-through, `claimPointer()` declines for foreign owners/claimants, and all existing timeline gestures behave identically when no overlay has an active claim | S-168 |
| `SchemaForm` renders and validates common schema subset | S-022 |
| `ExtensionManager` settings editing uses `SchemaForm` when a `settingsSchema` is declared in the manifest; falls back to raw key-value editing only for schemaless or legacy packages (intentional, not a missing implementation) | T10 |
| Diagnostic fallback links open `DiagnosticPanel` filtered to failing extension | S-023 |
| Reserved frontend component slots compile as inert placeholders | S-025 |
| Frontend closure checklist documented and applied | S-027 |

**Author obligation:** Contributions declared in the manifest are validated at definition time. Contribution IDs must be unique within the extension. Unknown contribution kinds produce `contribution_kind_not_yet_bridged` diagnostics rather than silent failures.

### 2.4 Timeline patch system

| Guarantee | Evidence |
|---|---|
| Safe insert/update/delete/reorder clips via `TimelineOps` | S-030 |
| Proposal preview without mutating real timeline | S-031 |
| Accept/reject with stale base version detection | S-032 |
| Undo/rollback for patch batches | S-033 |
| Relative/fractional ordering for clip positioning | S-034 |
| Provider version behaviours tested (InMemory, Runtime) | S-035 |
| Patch extension mechanism with validation, serialization, previewability | S-038 |
| Extension project-data persistence, oversized payload rejection with diagnostics | S-039 |
| Source-to-timeline and timeline-to-source navigation metadata | S-040 |

**Author obligation:** Patches must include a `source` field identifying the extension, a `version` matching the base snapshot, and valid operations. Oversized project-data payloads are rejected with diagnostics.

### 2.5 Commands, keybindings, and context menus

| Guarantee | Evidence |
|---|---|
| Command, keybinding, palette, and context menu contributions supported | S-050 |
| Deterministic shortcut conflict resolution (first-registered-wins) | S-051 |

**Author obligation:** Command IDs should be namespaced under the extension ID (e.g. `com.example.myExt.myCommand`). Shortcut conflicts are resolved at registration time — later registrations for the same key sequence produce diagnostics.

### 2.6 Services available during activation

| Service | Path | Guarantee |
|---|---|---|
| Chrome (toast, progress, focus, announce, subscribe) | `ctx.chrome` | S-010, S-016 |
| Settings (localStorage-backed, scoped, defaults) | `ctx.services.settings` | S-001 |
| Internationalisation (message bundle, placeholder substitution) | `ctx.services.i18n` | S-010 |
| Diagnostics (structured severity+code+message reporting) | `ctx.services.diagnostics` | S-006, S-024 |
| Commands (imperative handler registration) | `ctx.commands` | S-050 |
| Effects (trusted component registration) | `ctx.effects` | S-080, S-081 |
| Transitions (renderer registration) | `ctx.transitions` | S-090 |
| Clip types (renderer + inspector registration) | `ctx.clipTypes` | S-100–S-105 |
| Shaders (WebGL source + uniform registration) | `ctx.shaders` | S-130–S-135 |
| Agent tools (tool handler + process stubs) | `ctx.agentTools` | S-110–S-112 |
| UI renderer registration (bind renderers for render-backed contributions) | `ctx.ui` | S-165 |
| Creative context (timeline reader/patch, source map, proposal runtime) | `ctx.creative` | S-030–S-040 |
| Timeline view store (playback, selection, viewport, geometry — renderer-independent) | `ctx.creative.timelineView` | S-171 |

Project documents use `ctx.creative.documents.list(kind, { cursor?, limit? })`,
`get(id)`, `create(kind, content, documentId?)`, and
`update(id, content, expectedVersion)`. `onChange(listener)` returns an
unsubscribe function and fires after writes by this editor client. There is no
remote document event feed; extensions can poll for other clients' writes.
`ctx.creative.assets.get(assetKey)` reads live registry identity (`media_id`,
`content_sha256`), file label and kind. `loadProfile(assetKey)` reads legacy
profile data. `ctx.creative.reader.subscribe(listener)` fires on timeline data
replacement, including edit, undo and reload. `ctx.creative.pendingWork.report({
writing, unsaved })` blocks navigation during writes and requests confirmation
for drafts or conflicts.

For a declared data kind, `ctx.dataKinds.readPersisted(kindId)` returns the
kind's saved source items. `replacePersisted(kindId, items)` commits a
replacement through normal timeline save and undo. `replaceTransient(kindId,
items)` replaces memory-only source projections without save or history. Every
item must use the kind's declared `schemaRef`. The SDK helpers
`sourceToTimelineTime(clip, sourceTime)` and
`timelineToSourceTime(clip, timelineTime)` provide only trim and speed
arithmetic; each kind chooses its own clipping and interpretation rules.

### 2.7 Render-backed contributions (timeline overlays)

`timelineOverlay` is the platform's render-backed contribution: the manifest declares a **required non-empty `render` id** (no `when` clause is accepted), and the extension binds the renderer imperatively through `ctx.ui.registerRenderer(renderId, renderer)` during `activate()`.

| Guarantee | Evidence |
|---|---|
| Host renders resolved overlays into the timeline surface (`TimelineExtensionOverlayHost`); overlays whose renderer was never registered are omitted, never stubbed | S-165 |
| Renderer registration is scoped to the owning extension by `(extensionId, renderId)`; an undeclared render id produces a diagnostic | S-165 |
| Renderers receive `TimelineOverlayRenderProps`: memoized geometry, stable viewport/playhead stores, selection, boolean `pointerClaimed`/`claimPointer()`/`releasePointer()`, and `primitives` | S-166 |
| V1 marker primitive is ruler-only: `primitives.markerLayer()` accepts `placement: 'ruler'` only, with preview/commit intents, frame-grid snapping at commit, and accessible marker buttons | S-167 |
| Gesture arbitration is passive and claim-based; the release criterion is that all existing timeline gestures behave identically when no overlay has an active claim | S-168 |
| The host is gated by `timelineOverlaysEnabled` (default false); the DEV-only `?timelineOverlayCanary=1` query parameter flips the flag in DEV builds (`npm run dev:editor` appends it) and production never honors it; maturity promotion to `public-supported` is deferred until the release criterion passes | S-171 |
| Marker/project data persists through the standard storage-neutral `project-data.write` path; **generic disposal never deletes project data** — extensions expose explicit Clear/Delete Data actions instead | S-169 |

**Author obligations:**

1. Declare a non-empty `render` id on every `timelineOverlay` contribution and bind the renderer via `ctx.ui.registerRenderer()` in `activate()`; dispose the returned handle in your dispose function.
2. Treat overlay state as controlled: the extension owns the marker array and persists on `'commit'` intents only. Preview intents must never be written.
3. Do not call `releasePointer()` for a claim you do not own — it is a no-op unless this overlay still holds the claim. There is no public `setGestureOwner`; ownership is host-assigned.
4. Do not delete project data from generic `DisposeHandle.dispose()` — dispose also runs on provider unmount, HMR, and reload. Provide explicit Clear/Delete Data behavior; automatic deletion is wired only when a reason-aware uninstall lifecycle exists.

### 2.8 Panels that can go full screen

The host may re-parent a panel's DOM node into a frame covering the whole
browser window (not the browser Fullscreen API). The React instance,
`instanceId`, and panel state are kept. Where `Element.moveBefore` exists,
iframes inside the panel keep running; elsewhere an iframe reloads once after
the move. At most one panel is full screen at a time. Editor shortcuts are off
while it is open. The manifest does not change.

`PanelRenderProps.fullscreen?: { active: boolean; enter(): void; exit(): void }`
is present only where the host offers full screen. Panels hide their own
full-screen control when it is absent.

**Author obligations:**

1. Measure with a `ResizeObserver` or container queries against the panel
   wrapper (`@container/panel`), not once at mount. Lay out from measured size,
   never from `fullscreen.active`.
2. Call `preventDefault` on keys the panel owns (e.g. Escape) so the frame's
   Esc-to-exit does not also act.
3. Mark the first focus target with `data-autofocus`. On open, focus goes to it,
   otherwise to the first tabbable element.

### 2.9 Selecting clips from a panel

`PanelVideoAdapter` (`props.video`) has an optional `select(clipIds)`. It replaces
the timeline selection with those clips, through the editor's own selection ops.
Unknown ids are ignored, and an empty list clears the selection. Call it as
`props.video?.select?.([clipId])`, for example to select a clip the panel just added.
for examples.

---

## 3. Diagnostic contract

### 3.1 Diagnostic shape

Every diagnostic published by an extension must conform to:

```typescript
interface ExtensionDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;          // Dot-separated, extension-scoped (e.g. 'myExt/validation-failed')
  message: string;       // Human-readable, no newlines
  extensionId?: string;  // Populated automatically by the diagnostics service
  contributionId?: string;
  milestone?: string;    // Earliest milestone that activates this feature
  detail?: Record<string, unknown>; // Structured data (clip references, effect IDs, etc.)
}
```

### 3.2 Export diagnostics

Export-scoped diagnostics use `export/`-prefixed codes and carry timeline-specific detail:

```typescript
interface ExportDiagnostic extends ExtensionDiagnostic {
  code: `export/${string}`;
  detail?: Record<string, unknown> & {
    clipId?: string;
    clipType?: string;
    effectType?: string;
    transitionType?: string;
    shaderId?: string;
  };
}
```

### 3.3 Diagnostic conventions

- **Error** severity: the extension cannot proceed in its current state (e.g. required data missing, incompatible API version).
- **Warning** severity: something is unexpected but the extension can continue (e.g. unknown clip type from an inactive contribution).
- **Info** severity: lifecycle events, configuration summaries, analysis results.

**Author obligation:** Use diagnostic codes that are namespaced under the extension (e.g. `myExtension/validation-failed`). Avoid generic codes like `error` or `failed`.

---

## 4. Manifest contract

### 4.1 Required fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique extension ID (validated by `validateExtensionId()`) |
| `version` | `string` | Semver (e.g. `1.0.0`) |
| `label` | `string` | Human-readable display name |
| `apiVersion` | `number` | Must be `1` in V1 |

### 4.2 Optional fields

| Field | Type | Description |
|---|---|---|
| `description` | `string` | Human-readable description |
| `contributions` | `ExtensionContribution[]` | One or more contribution declarations |
| `settingsDefaults` | `Record<string, unknown>` | Default values for extension settings |
| `settingsSchema` | `SettingsSchema` | Schema definition for settings validation (deferred, M14) |
| `messages` | `Record<string, string>` | I18n message bundle with `{{placeholder}}` syntax |
| `permissions` | `ExtensionPermissionDeclaration[]` | **Descriptive only** in V1 (no enforcement) |
| `processes` | `ProcessManifestEntry[]` | Reserved — validated and frozen, but no subprocess spawning |
| `dependsOn` | `ExtensionDependency[]` | Reserved — validated and frozen, no runtime resolution |
| `migrations` | `SettingsMigration[]` | Reserved — validates shape, migration execution deferred (M14) |

### 4.3 Manifest immutability

`defineExtension()` deep-freezes the manifest. Extension IDs, contribution IDs, and all literal values are preserved through the frozen object. Authors must not mutate the manifest after definition.

### 4.4 Source-pack contract

Extension packages share a common manifest format (`astrid-extension.json`) with 8 consistent examples in the repository. The format is frozen for V1 (S-153). See any extension directory (e.g. `flagship-local/astrid-extension.json`) for the canonical shape.

---

## 5. Trust envelope obligations

### 5.1 Trusted-local warning

Extensions that execute with full browser privileges must emit the trusted-local warning. The flagship-local extension demonstrates this pattern (docs-safe, EXT). The warning text is standardised in the trust and security posture (`trust-and-security.md` §3):

> ⚠️ Trusted-local extension: this extension executes with full browser-renderer privileges. Review the extension source before enabling it in a shared project.

### 5.2 Permission posture

The `permissions` field in the manifest is **descriptive only** in V1. An extension that declares `network: false` can still call `fetch()`. Authors must:

1. Declare permissions honestly — they document intent for future enforcement milestones (M4–M5).
2. Not rely on permission gating for security — there is no runtime enforcement.

### 5.3 Error boundaries

The platform provides `ContributionErrorBoundary` for React-rendered slots, dialogs, panels, and inspector sections. Authors must:

1. Handle errors in non-React paths (event handlers, timers, async callbacks) themselves — these are not caught by error boundaries. (A timeline-overlay render error releases any active pointer claim before the fallback is shown.)
2. Use `ctx.services.diagnostics.report()` to publish structured error information.
3. Not throw from `dispose()` — the platform captures teardown failures as diagnostics.

### 5.4 Service cleanup

The platform cleans up host-owned services (settings localStorage keys, chrome event subscribers, registered renderers) on dispose via `CONTEXT_DISPOSE_SYMBOL`. Authors must:

1. Return a `DisposeHandle` from `activate()` that cleans up extension-owned resources.
2. Call `.dispose()` on any handles received from service registrations (`ctx.commands.registerCommand()`, `ctx.clipTypes.registerClipType()`, `ctx.ui.registerRenderer()`, etc.).
3. Not rely on host service cleanup order — dispose handles are called before host services.
4. **Never delete project data from dispose.** Generic disposal also runs on provider unmount, HMR, and reload; deleting extension project data there would destroy user content on a reload. Project data (e.g. `project-data.write` payloads such as scene markers) is deleted only through an explicit user-triggered Clear/Delete Data action until a reason-aware uninstall lifecycle exists.

---

## 6. Renderability contract

### 6.1 Render capability metadata

The platform exports renderability metadata available to export guards:

```typescript
interface RenderCapability {
  // ... (see src/sdk/index.ts for full shape)
}

interface ContributionRenderability {
  // ... 
}

interface RenderBlocker {
  // ...
}
```

### 6.2 Export guard integration

Before render, `runExportGuard()` (S-062) scans the timeline for unknown clip types, effects, and transitions:

- Extension-declared IDs from **inactive** contributions → `warning` diagnostics
- **Unknown** IDs (no declaring extension) → `error` diagnostics → export blocked

### 6.3 Author obligations

1. Declare all clip type, effect, and transition IDs in the manifest contributions.
2. Set `allowBrowserExport` and `allowWorkerExport` honestly for effects and transitions.
3. Check renderability metadata before attempting export workflows.
4. Do not rely on the render planner (deferred, M12) — V1 export uses the ad hoc guard.

---

## 7. Packaging and distribution

### 7.1 V1: Source-local and repository-loaded packages

In V1, extensions are **statically bundled** with the host application. There is no dynamic package loading, no CDN fetching, no `import()` for extension code, and no marketplace. Packages are either direct host-supplied modules (DEV-local or first-party) or repository-loaded installed packages; both flow through the provider-scoped extension runtime.

**Installed-package management is shipped.** The Extension Manager already provides enable/disable toggles with immediate contribution visibility, schema-backed settings editing, and repository-backed persistence of enablement and settings (S-160–S-164). What remains absent is **packaging and install tooling**: there is no pack builder/bundler, no install command or install UI, no package discovery channel, no update mechanism, and no marketplace or registry (D-001, D-004, D-123). Distinguish these two facts in any documentation: *managing* an installed package (enable/disable, settings) works today; *producing, installing, discovering, or updating* packages does not exist yet.

### 7.2 What is deferred

The M14 packaging milestone — everything that creates, installs, verifies, migrates, and updates packs — is deferred:

| Deferred capability | Deferral ref |
|---|---|
| Extension install, update, and deletion from manager UI (enable/disable and settings editing are shipped — S-160–S-164) | D-001 |
| Failed-load recovery and automated diagnostic triage | D-002 |
| Integrity verification prevents installation/activation | D-003 |
| Workspace pack load and bundle pack validation | D-004 |
| Migration diagnostics for older metadata shapes | D-005 |
| Local-source-to-installed-pack migration | D-006 |
| Manager trust warnings and requirements/lock metadata for installed packs | D-007 |
| Provider-backed extension state repository | D-008 |
| Extension dependency diagnostics | D-009 |
| Conflict override UI, dependency tree badges | D-010 |

**Author obligation:** Do not document install, bundler, marketplace, discovery, or update workflows as available. Installed packages are managed (enable/disable, settings, persistence) but are not yet installable, bundleable, discoverable, or updatable through any tooling.

### 7.3 What is unsupported

- Marketplace / extension registry (unsupported, D-123)
- Cloud extension loading
- Dynamic package loading from npm/CDN/`import()`
- Third-party extension hosting

---

## 8. Compatibility promises

### 8.1 SDK stability

The `@astrid/editor-sdk` entrypoint is the stable public boundary. Types and functions exported from `src/sdk/index.ts` follow semantic versioning:

- **Patch**: bug fixes, no breaking changes
- **Minor**: new types/functions, backward-compatible
- **Major**: breaking changes to public types or functions

### 8.2 Manifest format stability

The `astrid-extension.json` format is frozen for V1 (S-153). New optional fields may be added in minor versions; required fields will not change without a major version bump.

### 8.3 Provider compatibility

Two data providers are supported (S-140, S-141):

| Provider | Support level | Evidence |
|---|---|---|
| InMemory | Full M3 support, ephemeral Map-backed | S-140 |
| Runtime | Full M3 support except the checkpoint API (history is Runtime composition revisions) | S-141 |

Extension authors must not assume a specific provider. Use the public `TimelineReader.snapshot()` and `TimelineOps.apply()` interfaces — they abstract over provider differences.

Editor extensions can access active-project Runtime documents through
`ctx.creative.documents`. `list(kind, { cursor, limit })` returns one page,
`get(id)` reads one document, `create(kind, content, documentId?)` creates a document, and
`update(id, content, expectedVersion)` performs a version-checked update. The
`onChange(listener)` subscription fires after successful writes made through
that client; Runtime does not publish document-change events from other clients,
so consumers that need cross-client freshness must poll. Documents are filtered
by kind only; filter document content in the extension when needed.

`ctx.creative.assets` is a live read surface over the current timeline registry.
Its `get(key)` result includes registry identity fields (`media_id`,
`content_sha256`, `file`, and `kind`) alongside asset metadata. `keys()`, `has()`,
and `search()` read the current registry, and `loadProfile(key)` reads the
provider's legacy asset profile when supported.

`ctx.creative.reader.subscribe(listener)` can observe replacement of the timeline
data document, including edits, undo, reload, and adopted updates. It returns an
unsubscribe function. A save acknowledgement that only advances the version does
not count as a data replacement. The method is optional on static reader mocks.

Extensions with drafts or writes that affect project switching can report
`ctx.creative.pendingWork.report({ writing, unsaved })`. `writing` blocks
navigation while work is being persisted; `unsaved` asks for confirmation before
navigation. Report the current state when it changes, including clearing both
flags when the work is settled.

---

## 9. Deferred and unsupported classification (author-facing)

### 9.1 Deferred (planned, not yet implemented)

These behaviours are documented as deferred in the supported/deferred matrix. Authors must not document them as available, and the pre-doc example readiness gate flags examples that demonstrate deferred behaviour as unsupported docs candidates.

| Area | Deferral IDs | Blocked by | Earliest |
|---|---|---|---|
| Extension manager & packaging | D-001–D-010 | B-001 | M14 |
| Render planner & export infrastructure | D-020–D-027 | B-002 | M12 |
| Live data bridge frontend | D-030–D-037 | B-003 | M11 |
| Agent tool frontend & edge cases | D-040–D-047 | — | M10 |
| Command test coverage | D-050–D-052 | — | M4 |
| Asset metadata frontend | D-060–D-064 | — | M6 |
| Provider registry edge cases | D-070–D-073 | — | M5 |
| Effect/transition test coverage | D-080–D-085 | — | M7–M8 |
| Clip-type UI integration | D-090–D-091 | — | M9 |
| Shader frontend & materializer | D-100–D-102 | — | M13 |
| TimelinePatch reserved ops | D-110–D-111 | — | Future |
| Permissions & sandboxing | D-120–D-122 | — | M4–M5 |
| Structural deferrals | D-130–D-135 | — | Various |

### 9.2 Unsupported (out of scope)

These behaviours are unsupported across all milestones:

| Behaviour | Classification | Evidence |
|---|---|---|
| Marketplace / extension registry | Unsupported | D-123, CR:X-006 |
| Cloud extension loading | Unsupported | Absence check |
| Sandboxed execution | Unsupported | Trust and Security §11.3 |
| Theme contributions | Unsupported | Absence check |
| Public CRDT collaboration primitives | Unsupported | Absence check |

---

## 10. Pre-doc example readiness gate

Before referencing examples in documentation, the following gate must pass:

```bash
node scripts/quality/check-extension-example-readiness.mjs --audit
```

This gate enforces:

1. Every `EX:` and `EXT:` evidence reference in a **supported** matrix row resolves to an existing file.
2. Example files demonstrating deferred/unsupported behaviour are flagged as unsupported docs candidates.
3. Every example file under `src/examples/` imports exclusively from `@astrid/editor-sdk`.
4. On-disk examples without a corresponding supported matrix row are reported as unclassified.

The gate outputs a JSON record of docs-safe example IDs. At the time of this document's writing, the gate passed with **22 docs-safe examples**, **0 failures**, and **8 unclassified warnings** (examples on disk not yet classified in the matrix).

### 10.1 Docs-safe examples (M15 gate pass)

| Category | Docs-safe IDs |
|---|---|
| SDK examples (`src/examples/`) | `toolbar-example`, `inspector-example`, `overlay-example`, `status-surface-example`, `code-panel-diagnostics-example`, `surface-coverage`, `command-extension`, `integrity-hash-parser-example`, `metadata-json-output-example`, `clip-type-keyframed-example`, `automation-recording-canary`, `writing-canary-example`, `stage-canary-example` |
| Extension examples (`src/tools/video-editor/examples/extensions/`) | `flagship-local`, `flagship-local-transition`, `agent-tools-canary`, `agent-tools-copilot`, `agent-tools-export`, `live-webcam-canary`, `live-generated-frame-canary`, `clip-local-shader-canary`, `postprocess-shader-canary` |

---

## 11. Getting started

Orientation for authors beginning a first extension, ahead of the contract detail above.

### 11.1 What is an Astrid App extension?

An Astrid App extension is a TypeScript module that uses **only** the public `@astrid/editor-sdk` entrypoint. Extensions declare their identity, contributions, and lifecycle in a single frozen manifest, then register behaviour imperatively during `activate()`.

In V1, every extension is a **trusted-local extension**: it runs in the same browser JavaScript context as the Astrid App editor with full renderer privileges. There is no sandbox, no process isolation, and no capability enforcement. **Review extension source before enabling it in a shared project.** See [Trust and Security](../extensions/trust-and-security.md) for full details.

For the admitted Astrid Video Editor Tool, its existing host route, scoped
provider services, catalog binding, and source/reopen workflow, see
[Tool authoring](./tool-authoring.md). This editor-specific host contract is
separate from the extension APIs described below.

### 11.2 Your first extension

Every extension starts with `defineExtension()` from `@astrid/editor-sdk`. The minimal valid extension is a manifest-only declaration:

```typescript
import { defineExtension } from '@astrid/editor-sdk';
import type { AstridExtension } from '@astrid/editor-sdk';

export const myExtension: AstridExtension = defineExtension({
  manifest: {
    id: 'com.example.my-extension',
    version: '1.0.0',
    label: 'My Extension',
    description: 'What my extension does.',
    apiVersion: 1,
  },
});
```

#### 11.2.1 Extension ID rules

Extension IDs must match `/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)*$/i` — lowercase start, dot-separated segments of letters, digits, hyphens, and underscores. Contribution IDs follow the same rules and must be unique within the extension.

`defineExtension()` validates IDs at definition time and throws on invalid or duplicate IDs.

#### 11.2.2 Adding an activate function

Extensions that need to do work at activation supply an `activate(ctx)` function:

```typescript
import { defineExtension } from '@astrid/editor-sdk';
import type { AstridExtension, ExtensionContext, DisposeHandle } from '@astrid/editor-sdk';

export const myExtension: AstridExtension = defineExtension({
  manifest: {
    id: 'com.example.my-extension',
    version: '1.0.0',
    label: 'My Extension',
    description: 'Does work on activation.',
    apiVersion: 1,
  },
  activate(ctx: ExtensionContext): DisposeHandle {
    ctx.chrome.toast('My extension activated!', 'info');

    return {
      dispose(): void {
        ctx.chrome.toast('My extension disposed.', 'info');
      },
    };
  },
});
```

The `activate()` function receives an `ExtensionContext` and must return a `DisposeHandle` (or `void`). The dispose function is called when the extension is deactivated — it must be **idempotent** and **must not throw**.

#### 11.2.3 Running your extension

Writing the file is not enough — the host has to be told your extension exists.
The dev entry point for that is:

```
src/tools/video-editor/dev/localExtensions.ts
```

```typescript
import { myExtension } from '../../../path/to/my-extension';
import type { AstridExtension } from '@astrid/editor-sdk';

export const devLocalExtensions: AstridExtension[] = [myExtension];
```

`VideoEditorPage` concatenates that array into the editor's direct extensions
under `import.meta.env.DEV`. Refresh the browser and your contributions appear.
**Keep the array empty on `main`** — entries there are a local scratchpad, not
something to commit.

Use the deterministic editor preview described in the [repository README](../../README.md),
then open the URL it prints.

**Scaffold.** Copy `src/examples/hello-world-extension.ts` and rename the
manifest id — that is the whole scaffold; there is no generator.

**Did it activate?** Every activation and disposal is wrapped in a
`console.groupCollapsed` labelled with the extension id. Open DevTools Console
and filter for `[Extension lifecycle]`; see
[`extensions-debugging.md` §2.1](./extensions-debugging.md#21-lifecycle-console-grouping)
for what the group contains and what a failed activation looks like.

**Nothing appeared at all?** Load the editor with `?extensionSmoke=1`. That
mounts the host's own smoke extension. If *its* status contribution shows up,
the host wiring is fine and the problem is in your extension; if it does not,
the problem is upstream of you.

### 11.3 Declaring contributions

Contributions tell the host what UI surfaces and behaviour your extension provides. They are declared in the `manifest.contributions` array.

#### 11.3.1 Slot contributions (toolbar, statusBar, codePanel, etc.)

Slot contributions place your extension's UI in named host slots:

```typescript
contributions: [
  {
    id: 'my-toolbar-button',
    kind: 'slot',
    slot: 'toolbar',
    order: 200,
    label: 'My Toolbar Button',
  },
  {
    id: 'my-status',
    kind: 'slot',
    slot: 'statusBar',
    order: 100,
    label: 'My Status Widget',
  },
]
```

Available slots: `header`, `toolbar`, `leftPanel`, `rightPanel`, `codePanel`, `writingPanel`, `stagePanel`, `timelineFooter`, `statusBar`, `dialogs`, `assetPanel`, `inspectorPanel`.

Example reference: [toolbar-example.ts](../../src/examples/toolbar-example.ts) (docs-safe), [status-surface-example.ts](../../src/examples/status-surface-example.ts) (docs-safe).

#### 11.3.2 Inspector and overlay contributions

For the properties panel and the timeline canvas:

```typescript
{
  id: 'my-inspector-section',
  kind: 'inspectorSection',
  placement: 'before-default', // or 'after-default'
  label: 'My Section',
  order: 50,
},
{
  id: 'my-overlay',
  kind: 'timelineOverlay',
  render: 'my-overlay/render', // required render-id reference (see below)
  label: 'My Overlay',
  order: 100,
}
```

Example references: [inspector-example.ts](../../src/examples/inspector-example.ts) (docs-safe), [overlay-example.ts](../../src/examples/overlay-example.ts) (docs-safe, executable required-render + `ctx.ui` shape).

##### Timeline overlays: the required-render contract

`timelineOverlay` is a **render-backed, host-rendered** contribution — it is not reserved and not unwired. The host renders resolved overlays into the timeline surface through `TimelineExtensionOverlayHost` (mounted in `TimelineCanvas`). The contract:

- The manifest contribution **requires a non-empty `render` id** and has **no `when` clause**. A missing/blank render id or a `when` clause is rejected at manifest validation.
- During `activate()` the extension **must bind a renderer** for that render id via `ctx.ui.registerRenderer(renderId, renderer)` (§11.4.5). Overlays whose renderer was never registered are omitted from the resolved list — there is no callable placeholder.
- The renderer receives `TimelineOverlayRenderProps`: memoized geometry (`timeToPixel`/`pixelToTime`, scale, visible extent), stable viewport/playhead stores, the current selection, a boolean `pointerClaimed` + `claimPointer()`/`releasePointer()` arbitration API, and host-owned `primitives`.
- V1's host-owned primitive is `primitives.markerLayer(...)`, **ruler-only**: `placement` accepts `'ruler'` only (no `trackId`, no canvas placement). Markers are controlled input; `onChange` reports `'preview'` during a drag and `'commit'` at release; commits snap to the frame grid when `snap: true`.
- Gesture arbitration is passive: overlay wrappers are click-through until `claimPointer()` succeeds, and `claimPointer()` returns `false` while any other timeline gesture owner or a foreign overlay holds the claim. The release criterion is that **all existing timeline gestures behave identically when no overlay has an active claim**.
- The overlay host is gated by the provider-owned **`timelineOverlaysEnabled`** flag, which defaults to `false` — overlays stay off unless a host opts in. In the DEV build, the `?timelineOverlayCanary=1` query parameter flips the flag (`npm run dev:editor` appends it); production never honors the query parameter. Maturity promotion to public-supported is deferred until the release criterion passes (see the [release checklist](./extension-platform-release-checklist.md)).

#### 11.3.3 Commands, keybindings, and context menus (M4)

Declare a command, a keyboard shortcut, and a context-menu entry in one extension:

```typescript
import type {
  CommandContribution,
  KeybindingContribution,
  ContextMenuItemContribution,
} from '@astrid/editor-sdk';

const contributions: readonly [
  CommandContribution,
  KeybindingContribution,
  ContextMenuItemContribution,
] = [
  {
    id: 'my-command',
    kind: 'command',
    command: 'com.example.my-extension.doSomething',
    label: 'Do Something',
    category: 'Examples',
    order: 10,
  },
  {
    id: 'my-keybinding',
    kind: 'keybinding',
    command: 'com.example.my-extension.doSomething',
    key: 'CtrlOrCmd+Alt+D',
    order: 10,
  },
  {
    id: 'my-menu-item',
    kind: 'contextMenuItem',
    command: 'com.example.my-extension.doSomething',
    label: 'Do Something',
    target: 'clip',
    when: 'target.clipId != null',
    order: 10,
  },
];
```

Then register the handler in `activate()`:

```typescript
activate(ctx: ExtensionContext): DisposeHandle {
  return ctx.commands.registerCommand(
    'com.example.my-extension.doSomething',
    (run) => {
      ctx.chrome.toast(`Command invoked on ${run.target?.target ?? 'no target'}.`, 'info');
    },
    { label: 'Do Something', category: 'Examples' },
  );
}
```

Shortcut conflict resolution is **first-registered-wins**. If two extensions bind the same key, the first to register keeps it; later registrations produce diagnostics.

Example reference: [command-extension.ts](../../src/examples/command-extension.ts) (docs-safe).

#### 11.3.4 Effect, transition, and clip-type contributions (M7–M9)

These contributions register trusted component renderers:

- **Effect** (`kind: 'effect'`): Component that renders on clips in preview. Export-blocked by default (`allowBrowserExport: false`, `allowWorkerExport: false`).
- **Transition** (`kind: 'transition'`): Renders between clips.
- **Clip type** (`kind: 'clipType'`): A contributed clip type with parameter schema and keyframed interpolation.

In the composition graph (M4), clip-type contributions project as `ContributionRef`
nodes keyed by `contribution:clipType:<extensionId>:<contributionId>`. Each clip
using a contributed clip type emits a `consumes` edge from the clip node to the
clip-type contribution node, with resolved/missing/disabled reference state
diagnostics.

Example references:
- Effect: flagship-local extension's `FlagshipEffectComponent.tsx` (docs-safe, EXT)
- Transition: flagship-local extension's `__tests__/flagship-local-transition.test.ts` (docs-safe, EXT)
- Clip type: [clip-type-keyframed-example.ts](../../src/examples/clip-type-keyframed-example.ts) (docs-safe)

#### 11.3.5 Other supported contribution kinds

| Kind | Milestone | Example (docs-safe) |
|---|---|---|
| `parser` | M6 | [integrity-hash-parser-example.ts](../../src/examples/integrity-hash-parser-example.ts) |
| `outputFormat` | M6 | Typed and declarable; execution reserved (returns M6 from `contributionKindNotYetBridged`). Example: [metadata-json-output-example.ts](../../src/examples/metadata-json-output-example.ts) |
| `searchProvider` | M6 | Typed and declarable; execution reserved (returns M6 from `contributionKindNotYetBridged`). Frontend rendering deferred (D-063, D-064) |
| `metadataFacet` | M6 | Supported (bridged); frontend rendering deferred (D-063, D-064) |
| `assetDetailSection` | M6 | Supported (bridged); frontend rendering deferred |
| `agentTool` | M10 | [agent-tools-canary/](../../src/tools/video-editor/examples/extensions/agent-tools-canary/) (EXT, docs-safe) |
| `shader` | M13 | [clip-local-shader-canary/](../../src/tools/video-editor/examples/extensions/clip-local-shader-canary/) (EXT, docs-safe) |
| `automation` | M9 | [automation-recording-canary.ts](../../src/examples/automation-recording-canary.ts) (docs-safe) |

Shader contributions (M4) are assigned to clips or the timeline postprocess
scope through **graph-owned** `shader.assign` / `shader.remove` preview
operations. These are internal host operations derived from existing timeline
patch payloads (`clip.update` with `app.shader`, `app.update` with
`shaderPostprocess`) — they are not public SDK patch families. Shader-uniform
keyframes use the canonical `uniforms.<name>` target path (e.g.
`uniforms.intensity`) and project `animates` edges in the composition graph.

### 11.4 The ExtensionContext

The `ExtensionContext` (received in `activate()`) provides every service your extension can use:

#### 11.4.1 Chrome services (`ctx.chrome`)

```typescript
ctx.chrome.toast('Hello!', 'info');           // Host-visible toast
ctx.chrome.progress(75, 'Processing...');     // Progress indicator
ctx.chrome.focus('#my-element');              // Move focus within editor shell
ctx.chrome.announce('Clip added.', 'polite');  // Screen-reader announcement

// Event subscriptions
const sub = ctx.chrome.subscribe('toast', (payload) => { /* ... */ });
sub.dispose(); // Clean up in your dispose function
```

#### 11.4.2 Settings (`ctx.services.settings`)

Settings are localStorage-backed, scoped per extension with the `astrid.ext.<id>.` key prefix, and cleaned up on dispose:

```typescript
const enabled = ctx.services.settings.get<boolean>('myFeature.enabled');
ctx.services.settings.set('myFeature.enabled', true);
ctx.services.settings.delete('myFeature.enabled');
```

Declare defaults in `manifest.settingsDefaults`:

```typescript
settingsDefaults: {
  'myFeature.enabled': true,
  'myFeature.threshold': 0.5,
}
```

Settings migration is **deferred** (D-005). The migration infrastructure exists in the SDK (`extensionSettingsMigration`) but the manager UI is part of the deferred M14 packaging work.

#### 11.4.3 Internationalisation (`ctx.services.i18n`)

Simple key-lookup with `{{placeholder}}` replacement:

```typescript
manifest: {
  messages: {
    'greeting': 'Hello, {{name}}!',
  },
  // ...
}
// In activate():
ctx.services.i18n.t('greeting', { name: 'World' }); // "Hello, World!"
```

#### 11.4.4 Diagnostics (`ctx.services.diagnostics`)

Extensions can publish structured diagnostics:

```typescript
ctx.services.diagnostics.report({
  severity: 'warning',
  code: 'my-extension/validation-failed',
  message: 'Clip exceeds recommended duration.',
  contributionId: 'my-inspector-section',
  detail: { clipId: 'clip-0042', duration: 3600 },
});
```

Diagnostics surfaces include: the diagnostic panel (code panel), status surface, and export guard results. The host provides `DiagnosticPanel` with diagnostic fallback links filtered to the failing extension.

Example reference: [code-panel-diagnostics-example.ts](../../src/examples/code-panel-diagnostics-example.ts) (docs-safe).

#### 11.4.5 UI renderer registration (`ctx.ui`)

Render-backed contributions (today: `timelineOverlay`) declare a required `render` id in the manifest and bind the matching renderer imperatively during activation:

```typescript
import type { TimelineOverlayRenderProps } from '@astrid/editor-sdk';

// In activate():
const handle = ctx.ui.registerRenderer<TimelineOverlayRenderProps>(
  'my-overlay/render', // must match the contribution's `render` id
  (props) => {
    // props.geometry, props.viewport, props.playhead, props.selection,
    // props.pointerClaimed, props.claimPointer(), props.releasePointer(),
    // props.primitives.markerLayer(...)
    // The renderer must return non-null, host-renderable content — never
    // null. Docs-safe examples return a short label string; real extensions
    // return a React element (or `props.primitives.markerLayer(...)` ruler
    // markers), e.g. createElement(MyOverlayView, { props }).
    const viewport = props.viewport.getSnapshot();
    const playhead = props.playhead.getSnapshot();
    return [
      `My overlay (my-overlay/render)`,
      `scrollLeft ${Math.round(viewport.scrollLeft)}`,
      `playhead ${playhead.time.toFixed(2)}s`,
      props.selection.hasSelection ? 'selection' : 'no-selection',
    ].join(' · ');
  },
);
```

- `ctx.ui` exposes **only** `registerRenderer`. There is no renderer lookup, no host DOM access, and no gesture-owner setter.
- Registering a render id the extension did not declare produces an `unbound-render-id` diagnostic; the overlay is omitted from the resolved list.
- The returned `DisposeHandle` unregisters the renderer and is idempotent; dispose it in your `activate()` disposal.
- Renderer registration is **extension-scoped** — the host reconciles by `(extensionId, renderId)` and never lets one extension claim another's render id.

Example reference: [overlay-example.ts](../../src/examples/overlay-example.ts) (docs-safe required-render + `ctx.ui` + non-null renderer).

### 11.5 Timeline mutation (patches and proposals)

Extensions read and write timeline data through the **TimelinePatch** system:

```typescript
// Read the current timeline
const snapshot = ctx.creative.reader.snapshot();

// Build a patch
const patch: TimelinePatch = {
  version: snapshot.baseVersion,
  source: ctx.extension.id as string,
  meta: { kind: 'my-extension-update' },
  operations: [
    {
      op: 'project-data.write',
      target: ctx.extension.id as string,
      payload: {
        key: 'lastAction',
        value: { timestamp: Date.now() },
        mode: 'replace',
      },
    },
  ],
};

// Apply directly (immediate mutation)
ctx.creative.timeline.apply(patch);
```

Supported operations:
- **Safe insert/update/delete/reorder clips** and update tracks/assets through `TimelineOps`
- **Proposal preview** without mutating the real timeline
- **Accept/reject** with stale base version detection
- **Undo/rollback** for patch batches
- **Relative/fractional ordering** for clip positioning
- **Project-data persistence** per extension with oversized payload rejection
- **Source-map** navigation metadata

Example reference: [command-extension.ts](../../src/examples/command-extension.ts) (docs-safe) demonstrates building and applying a patch.

#### 11.5.1 What is deferred

- `clip.split` and `clip.slice` operations are **deferred** (D-110) — reserved with warnings
- Dedicated proposal UI component tests are **deferred** (D-130)
- DSL/compiler canary reading `CreativeContext.timeline` is **deferred** (D-131)
- Proposal diff rendering and source-map navigation UI are **deferred** (D-132)

See the [supported/deferred matrix](./extension-platform-supported-deferred.md) §3.11 and §3.13 for full details.

### 11.6 Docs-safe example index

The following examples passed the M15 pre-doc readiness gate (§10) and are safe to reference:

#### Core SDK examples (`src/examples/`)

| Example file | Demonstrates |
|---|---|
| `toolbar-example.ts` | Slot contribution (toolbar) |
| `inspector-example.ts` | Inspector section contribution |
| `overlay-example.ts` | Timeline overlay contribution — executable required-render + `ctx.ui.registerRenderer` pattern (host-rendered, non-null renderer, no `when` clause) |
| `status-surface-example.ts` | Status bar slot + settings + chrome events |
| `code-panel-diagnostics-example.ts` | Structured diagnostic reporting with source ranges |
| `surface-coverage.ts` | Surface coverage across host slots |
| `command-extension.ts` | Command, keybinding, context menu, timeline patch |
| `integrity-hash-parser-example.ts` | Parser contribution with MIME/extension limits |
| `metadata-json-output-example.ts` | Compile-only output format contribution |
| `clip-type-keyframed-example.ts` | Contributed clip type with keyframed params |
| `automation-recording-canary.ts` | Automation recording with deterministic keyframes |
| `writing-canary-example.ts` | Non-timeline-native workflow (writing panel) |
| `stage-canary-example.ts` | Non-timeline-native workflow (canvas/stage panel) |

#### Extension directory examples (`src/tools/video-editor/examples/extensions/`)

| Extension directory | Demonstrates |
|---|---|
| `flagship-local/` | Full extension: toolbar, status, commands, effects, transitions |
| `agent-tools-canary/` | Agent tool extension |
| `agent-tools-copilot/` | Copilot-style agent tool |
| `agent-tools-export/` | Export-adjacent agent tool |
| `live-webcam-canary/` | Live data bridge (webcam) |
| `live-generated-frame-canary/` | Live data bridge (generated frames) |
| `clip-local-shader-canary/` | Shader clip type |
| `postprocess-shader-canary/` | Post-process shader |

---

## 12. Authoring guide: manifest shape and data kinds

This guide documents the public video editor extension shape. It describes
kinded manifest contributions declared through `defineExtension` and bound at
activation through `ctx.*` services. The shipped Transcript extension (a dataKind) comes from the Astrid rendering pack
catalog loaded through `src/tools/video-editor/dev/localExtensions.ts`, and
`src/tools/video-editor/data-kinds/dataKindLaneCanvas.integration.test.tsx` holds a
minimal inline dataKind extension registered through the real gates and painted
in the timeline canvas. Commands, slots and overlays have docs-safe examples in
`src/examples/`.

### 12.1 Public Imports

Extensions import everything from the public SDK entrypoint:

```ts
import { defineExtension } from '@astrid/editor-sdk';
import type {
  ContributionId,
  ExtensionContext,
  ExtensionId,
  AstridExtension,
} from '@astrid/editor-sdk';
```

Do not import from `runtime/*`, `contexts/*`, `components/*`, or other
internal video editor modules in extension code. Those modules may change
without preserving compatibility. The SDK entrypoint exports the manifest and
contribution types, `defineExtension`, `validateManifest`, settings helpers,
contribution-family metadata, and validation helpers.

### 12.2 Extension Shape

An extension is a frozen manifest plus an optional activation function:

```ts
import { defineExtension } from '@astrid/editor-sdk';
import type {
  ContributionId,
  DisposeHandle,
  ExtensionContext,
  ExtensionId,
  AstridExtension,
} from '@astrid/editor-sdk';

export const myExtension: AstridExtension = defineExtension({
  manifest: {
    id: 'com.example.my-extension' as ExtensionId,
    version: '1.0.0',
    label: 'My Extension',
    description: 'What the extension does.',
    apiVersion: 1,
    license: 'MIT',
    contributions: [
      // Kinded entries — every contribution carries a `kind`.
      {
        id: 'greet-command' as ContributionId,
        kind: 'command',
        command: 'myExtension.greet',
        label: 'Greet',
        order: 10,
      },
    ],
  },

  activate(ctx: ExtensionContext): DisposeHandle {
    const handle = ctx.commands.registerCommand(
      'myExtension.greet',
      () => ctx.chrome.toast('Hello'),
      { label: 'Greet' },
    );
    return { dispose: () => handle.dispose() };
  },
});
```

The manifest declares what the extension contributes; `activate()` binds the
runtime pieces (renderers, handlers) through the `ctx` services. Registration
handles compose into the returned dispose so disable, HMR, and unmount unwind
cleanly.

### 12.3 Manifest Fields

| Field | Contract |
| --- | --- |
| `id` | Stable extension identifier, usually reverse-DNS such as `com.example.my-extension`. |
| `version` | Semver package version string. |
| `label` | Required non-empty display name (`manifest/missing-label`). |
| `description` | Optional prose summary. |
| `apiVersion` | Positive integer targeting one API generation; currently `1`. Non-integers fail `manifest/invalid-api-version`. |
| `license` | SPDX identifier; recommended for any shared extension. |
| `contributions` | Kinded array of contribution entries (see below). |
| `permissions` | Descriptive permission strings only; not enforced. |
| `settingsSchema` | Optional top-level JSON Schema for extension settings. |

Contributions are NOT grouped into per-family collections. There is no
`contributions.slots`, `contributions.panels`, or similar object anywhere in
the contract; unknown kinds fail closed with `manifest/unknown-contribution-kind`,
and unknown root-level keys fail JSON Schema validation.

### 12.4 Declaring And Binding

Every family follows the same rhythm — declare in the manifest, bind in
`activate()`:

1. **Declare** the contribution entry with its `kind` and required ids.
2. **Bind** the runtime implementation through the matching `ctx` service.
3. The host gates each bind against the declaring manifest; an unmatched id
   emits a named diagnostic and no-ops instead of crashing.

Renderers bound through `ctx.ui.registerRenderer(renderId, factory)` must match
the `render` ids of declared slot/dialog/overlay contributions. Commands bind
through `ctx.commands.registerCommand`.

### 12.5 Data Kinds

The `dataKind` family contributes typed data — transcript segments, notes,
telemetry intervals, annotations — as duration-neutral lanes under the timeline
tracks. One kind, three steps:

```ts
export const TRANSCRIPT_KIND_ID = 'astrid.transcript';
export const TRANSCRIPT_SCHEMA_REF = 'astrid.transcript_segment/v1';

export const transcriptLaneExtension: AstridExtension = defineExtension({
  manifest: {
    id: 'haus.astrid.transcript-lane' as ExtensionId,
    version: '1.0.0',
    label: 'Transcript Lane',
    apiVersion: 1,
    license: 'MIT',
    contributions: [
      {
        id: 'transcript-lane-kind' as ContributionId,
        kind: 'dataKind',            // declare
        kindId: TRANSCRIPT_KIND_ID,
        schemaRef: TRANSCRIPT_SCHEMA_REF,
        shape: 'interval',           // host-validated open strings:
        domain: 'source_seconds',    // point|interval|series / known domains
        label: 'Transcript',
        order: 10,
      },
    ],
  },

  activate(ctx: ExtensionContext): DisposeHandle {
    // bind — kindId must match the declaration above
    const handle = ctx.dataKinds.register(
      TRANSCRIPT_KIND_ID,
      renderTranscriptLane,          // (props: DataLaneRendererProps) => node
      renderTranscriptItemInspector, // optional item inspector
    );
    return { dispose: () => handle.dispose() };
  },
});
```

Contract details:

- **One bind model.** Renderers live on the host registry record created by
  `ctx.dataKinds.register(kindId, laneRenderer, inspector?)`; there are no
  renderer module paths or loader fields on the manifest. Registering an
  undeclared `kindId` emits `dataKinds/undeclared-kind` and returns a no-op
  handle.
- **Host maps coordinates.** Lane renderers receive pre-mapped items
  (`DataLaneRendererProps.items` with timeline-space `timelineStart` /
  `timelineEnd`). Renderers never fetch data, never reimplement trim/speed
  algebra, and never touch duration.
- **Unknown payloads round-trip opaque.** Items whose `schemaRef` matches no
  registered kind list as an opaque lane with host extent-bar paint and an
  opaque item inspector showing id, shape, schemaRef, extent, domain,
  provenance, and truncated payload.
- **Duplicate registration replaces** the previous record with a
  `data-kind-registry/duplicate-kind` warning.
- A minimal runnable example lives in
  `src/tools/video-editor/data-kinds/dataKindLaneCanvas.integration.test.tsx`
  (an inline extension registered through the real manifest and registration
  gates); the shipped Transcript extension comes from the Astrid rendering
  pack catalog (`dev/localExtensions.ts`).

#### Seeing a lane

Lanes assemble from transcript source items. The fastest way to see one: give a
timeline's persisted bundle (`bundle.itemsBySchemaRef['astrid.transcript_segment/v1']`)
`source_seconds` interval items whose `sourceArtifactRef.assetId` is the id of a
sound-bearing media clip's asset. The lane maps them onto every clip that plays
that asset, and chips are clickable. Browser specs seed exactly this through
`publishTranscriptSegments` in `tests/e2e/timeline/support.ts`.

Besides persisted source items, lanes assemble from real profiles: the embed host's
resolver branch (`EditorRuntimeProvider.tsx`) forwards your `assetResolver`,
and a resolver whose `onProfileLoad` returns `{ transcript: { segments } }`
feeds the lane pipeline for sound-bearing media clips. Stock prod-backed
providers return null profiles today — that null-provider posture is
documented V1 behavior, not a defect. Sanity path: load the editor with
`?extensionSmoke=1` first to confirm host wiring, then check the
`[Extension lifecycle]` console group for your extension's activation.

Non-transcript kinds feed items through the same source-item seam transcripts
use: `sourceItemsBySchemaRef` on `assembleDataLanes` accepts persisted SOURCE
items (`SourceFrozenDataItem`, native source domain, keyed by qualified
schemaRef, `id` already the durable content-stable sourceItemId). Assembly
remaps every source item per referencing clip through the inverse
trim/speed algebra and derives view-only occurrence ids
(``${`${sourceItemId}@${clipId}`}``) at render time — views are never
persisted. The seam is fed two ways today: the transcript adapter over
host-fetched segments, and the TimelineBundle persistence plane
(`TimelineData.sourceItemsBySchemaRef`, populated from `LoadedTimeline.bundle`
on load and saved back with the timeline). Unknown schemaRefs still land in
opaque lanes under the same merge, sort, provenance, and fallback rules.
The former caller-mapped `extraItemsBySchemaRef` view seam was removed in
dataKind V2 — prebuilt views can no longer be ingested anywhere.

#### Interaction posture (V1)

Lane interaction is host-dispatched. Host-painted extent bars dispatch a
`dataItem` target on click, and empty lane chrome dispatches a `dataLane`
target through the same interaction setters the overlay host uses.
Renderer-painted items join the same model: the host passes an optional
`onSelectItem(itemId)` on `DataLaneRendererProps`, so a renderer can forward
item presses into the identical `dataItem` dispatch. The properties panel
renders the kind's bound inspector (or the opaque fallback) for `dataItem`
targets and a lane summary for `dataLane` ones. Lanes also render opaque
whenever no provider/registration path is wired — the lane plane fails open
to "no lanes" without a loader.

#### Persistence

What persists is SOURCE data only: a TimelineBundle envelope
(`TimelineBundleEnvelope`, `data/typed/timelineBundle.ts`) whose
`itemsBySchemaRef` maps each qualified `schemaRef` to an array of
`SourceFrozenDataItem`s. Occurrences, lane views, and renderer wiring are all
derived at assembly time and never persisted — a bundle carries nothing a
renderer needs beyond source coordinates.

Item contract (the Zod item schema is `strictObject`, so violations fail at
parse):

- `id` IS the durable content-derived `sourceItemId`
  (`${assetId}:src:<fnv1a64Hex>` over the canonical form of the item content,
  see `adaptTranscript.ts`) — positional ids must never be persisted.
- `sourceArtifactRef.assetId` is required; assembly remaps each item onto
  every clip referencing that asset.
- `entityRef`, timeline coordinates, and renderer references are rejected at
  parse time — those belong to the view plane.

Version policy: the `schema_version` header starts at
`TIMELINE_BUNDLE_SCHEMA_VERSION` (`1`). `parseTimelineBundle` fails closed on
unknown versions with a diagnostic naming the found version. Within a known
version, the envelope itself is loose: unknown top-level fields round-trip
untouched so a newer writer's extras survive an older reader.

Bundles ride the timeline's normal save path — no separate persistence API.
Providers persist `{config, registry, bundle}` atomically where their backend
supports it; see `docs/extensions/compatibility.md` for per-provider posture.

### 12.6 Settings Schema

Settings use the top-level `settingsSchema` manifest field:

```ts
settingsSchema: {
  type: 'object',
  additionalProperties: false,
  properties: {
    theme: { type: 'string', enum: ['light', 'dark'], default: 'dark' },
  },
},
```

The host resolves settings by collecting defaults from the JSON Schema,
deep-merging persisted overrides, and validating the merged result against the
schema. Invalid overrides produce diagnostics and fall back to manifest
defaults. Read resolved values through `ctx.services.settings`.

### 12.7 Diagnostics Ownership

Diagnostics are owned by the loader, runtime, and editor infrastructure.
Extensions cause diagnostics through invalid manifests, incompatible API
versions, duplicate ids, gate misses (for example `dataKinds/undeclared-kind`),
and renderer exceptions. Extension-authored diagnostic reporting is not a
public API; surface user-facing status through your own slot, panel, or command
UI. Inside `activate()`, `ctx.services.diagnostics.report(...)` is available
for structured reporting of the extension's own failures.

### 12.8 Supported Families Summary

| Family | Kind(s) | Bind path |
| --- | --- | --- |
| Surfaces | `slot`, `dialog`, `panel`, `inspectorSection` | `ctx.ui.registerRenderer` |
| Commands | `command`, `keybinding`, `contextMenuItem` | `ctx.commands` |
| Timeline overlays | `timelineOverlay` | `ctx.ui.registerRenderer` |
| Clip types | `clipType` | `ctx.clipTypes` |
| Data kinds | `dataKind` | `ctx.dataKinds.register(kindId, laneRenderer, inspector?)` |
| Trusted registries | `effect`, `transition`, `shader`, `automation` | Host-owned/trusted only |
| Reserved vocabularies | `parser`, `outputFormat`, `searchProvider`, `metadataFacet`, `assetDetailSection`, `process`, `agentTool`, `agent` | Per-milestone services |

Effects, transitions, shaders, and automation require trusted code and reject
third-party declarations. Unknown kinds never validate.

### 12.9 Import-Boundary Rules

Extension code uses:

- `@astrid/editor-sdk` for manifests, types, `defineExtension`,
  `validateManifest`, settings helpers, and family metadata.

Extension code does not use:

- `@/tools/video-editor/runtime/*`
- `@/tools/video-editor/contexts/*`
- `@/tools/video-editor/components/*`
- `@/tools/video-editor/testing/*`
- Deep imports that are not documented as public entrypoints.

Tests and internal fixtures can deep-import internals as part of repository
validation, but authored extensions and docs model the public import boundary.

---

## 13. Cross-reference

| Document | Purpose |
|---|---|
| [extension-platform-supported-deferred.md](./extension-platform-supported-deferred.md) | Canonical supported/deferred matrix (103 supported, 70 deferred) |
| [extension-platform-contract-recheck.md](./extension-platform-contract-recheck.md) | Complete M0–M14 Done Criteria evidence matrix |
| [trust-and-security.md](../extensions/trust-and-security.md) | V1 trusted-local execution model and permission posture |
| [provider-compatibility-matrix.md](./provider-compatibility-matrix.md) | DataProvider compatibility across InMemory/Runtime |
| [timeline-patch-operations.md](./timeline-patch-operations.md) | Complete TimelinePatch operation reference |
| [shader-execution-model.md](./shader-execution-model.md) | M13 shader/WebGL bridge model |
| [frontend-closure-checklist.md](./frontend-closure-checklist.md) | Frontend state completeness for public primitives |

---

## 14. Version history

| Date | Change |
|---|---|
| 2026-06-20 | Initial author contract for M15. Written after pre-doc example readiness gate passed. All referenced examples are docs-safe. Deferred and unsupported classifications match the supported/deferred matrix. Trust envelope obligations included. Renderability, packaging, and compatibility promises codified. |
| 2026-08-11 | T7.4: added §2.7 render-backed contributions (required-render `timelineOverlay`, `ctx.ui.registerRenderer`, ruler-only `markerLayer`, passive gesture arbitration, canary gate, deferred maturity promotion). §5.4 now states generic disposal never deletes project data (explicit Clear/Delete Data only). §7 distinguishes shipped installed-package management (enable/disable, settings, persistence — S-160–S-164) from absent installer, bundler, marketplace, discovery, and update tooling. |
| 2026-10-19 | Folded the extension quickstart (§11) and the extension authoring guide (§12) into this contract; the trust envelope now lives in `docs/extensions/trust-and-security.md` §11. |
