# Extension Platform — V1 Release Checklist

**Status:** Active (M15)
**Last updated:** 2026-08-11
**Scope:** Every evidence domain that must pass before a V1 extension-platform release can be cut.
**Consumer:** `scripts/quality/check-extension-release-checklist.mjs` reads the § 2 tables; `scripts/quality/check-extension-ship-evidence.mjs` derives the 23 ship-quality workstreams from the numbered `###` headings of § 5 (this file is the canonical data source for both).

---

## 1. Purpose

This checklist is the **single gate** that determines whether the extension platform is
ready for a V1 release. It aggregates evidence from every M15 quality gate and doc
artifact. Every row maps to a concrete file, test, or matrix entry.

**Release-blocking** rows (denoted `release-blocking`) cause `check-extension-release-checklist.mjs --release`
to exit non-zero. **Audit** rows cause the `--audit` mode (and `quality:check`) to report
warnings but not fail.

### 1.1 How to read this checklist

| Column | Meaning |
|---|---|
| **#** | Checklist item number. |
| **Domain** | Evidence domain (SDK, diagnostics, compatibility, docs, frontend, etc.). |
| **Check** | What must be true. |
| **Evidence** | Concrete artifact path(s) or gate reference. |
| **Release?** | `yes` = release-blocking; `no` = audit-only. |

---

## 2. Release Checklist

### 2.1 SDK Boundary & Public Exports

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 1 | SDK | `@astrid/editor-sdk` is the only public import path | `src/sdk/__tests__/sdk-boundary.test.ts`; `scripts/quality/check-sdk-public-exports.mjs` | yes |
| 2 | SDK | SDK boundary test passes without importing editor internals | `src/sdk/__tests__/sdk-boundary.test.ts`; `config/governance/sdk-public-export-allowlist.json` | yes |
| 3 | SDK | All SDK public exports are in the allowlist | `scripts/quality/check-sdk-public-exports.mjs`; `config/governance/sdk-public-export-allowlist.json` | yes |
| 4 | SDK | No internal re-exports leak through `@astrid/editor-sdk` | `config/governance/sdk-public-export-allowlist.json`; `src/sdk/index.ts` | yes |
| 5 | SDK | `src/sdk/index.ts` compiles under `tsc --noEmit` | `tsconfig.json`; `npm run typecheck:strict-islands` | yes |

### 2.2 Contract-Recheck Matrix

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 6 | Contract | Contract-recheck matrix is well-formed (no missing columns, bad vocab) | `docs/video-editor/extension-platform-contract-recheck.md`; `scripts/quality/check-extension-contract-recheck.mjs` | yes |
| 7 | Contract | Zero release-blocking rows in contract-recheck matrix | `docs/video-editor/extension-platform-contract-recheck.md`; `scripts/quality/check-extension-contract-recheck.mjs` | yes |
| 8 | Contract | Every supported row has non-empty evidence | `docs/video-editor/extension-platform-contract-recheck.md`; `scripts/quality/check-extension-contract-recheck.mjs` | yes |
| 9 | Contract | Every deferred/unsupported row has evidence or a release blocker | `docs/video-editor/extension-platform-contract-recheck.md`; `docs/video-editor/extension-platform-supported-deferred.md` | yes |

### 2.3 Supported / Deferred Matrix

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 10 | Deferred | Supported/deferred matrix parses cleanly | `docs/video-editor/extension-platform-supported-deferred.md` | yes |
| 11 | Deferred | Every deferred row has absence-check evidence or a blocker link | `docs/video-editor/extension-platform-supported-deferred.md`; `scripts/quality/check-extension-deferred-claims.mjs` | yes |
| 12 | Deferred | Risky deferred terms (marketplace, cloud loading, sandbox, CRDT, etc.) are covered | `scripts/quality/check-extension-deferred-claims.mjs` | yes |

### 2.4 Diagnostics

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 13 | Diagnostics | `ExtensionDiagnosticsService.report()` with stable codes, severity, source ranges | `src/sdk/index.ts`; `src/examples/code-panel-diagnostics-example.ts`; `docs/video-editor/extensions-debugging.md` | yes |
| 14 | Diagnostics | Diagnostic fallback links open `DiagnosticPanel` filtered to failing extension | `docs/video-editor/frontend-closure-matrix.md` § 6; `docs/video-editor/extensions-debugging.md` § 3 | yes |
| 15 | Diagnostics | Export guard diagnostics for missing/unsupported extensions | `src/tools/video-editor/runtime/renderability.ts`; `docs/video-editor/provider-compatibility-matrix.md` § 3.2 | yes |
| 16 | Diagnostics | Lifecycle teardown failures captured as diagnostics, never thrown | `docs/extensions/trust-and-security.md` § 11.1 (Dispose row); S-017 | yes |

### 2.5 Compatibility

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 17 | Compatibility | Provider compatibility matrix is current and complete | `docs/video-editor/provider-compatibility-matrix.md` — both providers (InMemory, Runtime) | yes |
| 18 | Compatibility | InMemory provider: full M3 TimelinePatch + Proposal support | `docs/video-editor/provider-compatibility-matrix.md` § 3.3–3.8; `src/tools/video-editor/data/InMemoryDataProvider.test.ts` | yes |
| 19 | Compatibility | Runtime provider: full M3 support except the checkpoint API | `docs/video-editor/provider-compatibility-matrix.md` § 3.3–3.8; `src/tools/video-editor/testing/__tests__/providerCompatibility.runtime.test.ts` | yes |
| 20 | Compatibility | Astrid Bridge provider: documented partial support with known limitations | `docs/video-editor/provider-compatibility-matrix.md` § 3.3 (Partial CAS enforcement noted) | yes |

### 2.6 Docs / Example Parity

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 21 | Docs | Every supported behavior in the supported/deferred matrix has a corresponding example | `docs/video-editor/extension-platform-supported-deferred.md` — EX:/EXT: refs; `src/examples/` (21 files) | yes |
| 22 | Docs | Pre-doc example readiness gate passes (all EX:/EXT: refs resolve) | `scripts/quality/check-extension-example-readiness.mjs`; `src/examples/` | yes |
| 23 | Docs | Extension quickstart (author contract § 11) compiles and matches current SDK API surface | `docs/video-editor/extension-author-contract.md`; `src/sdk/index.ts` | yes |
| 24 | Docs | Extension author contract is traceable to the supported/deferred matrix | `docs/video-editor/extension-author-contract.md`; `docs/video-editor/extension-platform-supported-deferred.md` | yes |
| 25 | Docs | Extensions debugging guide references concrete diagnostic codes and lifecycle events | `docs/video-editor/extensions-debugging.md`; `docs/extensions/trust-and-security.md` | yes |
| 26 | Docs | Migration guide (local → pack) honesty: no aspirational prose, every deferred item linked to a blocker or matrix row | `docs/video-editor/extensions-migration-local-to-pack.md`; `docs/video-editor/extension-platform-supported-deferred.md` | yes |
| 27 | Docs | Trust envelope documents capability visibility table and lifecycle boundaries | `docs/extensions/trust-and-security.md`; S-016, S-017 | yes |

### 2.7 Frontend Closure

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 28 | Frontend | Frontend closure matrix is well-formed with all required columns | `docs/video-editor/frontend-closure-matrix.md`; `scripts/quality/check-frontend-closure-matrix.mjs` | yes |
| 29 | Frontend | Zero release-blocking primitives in frontend closure matrix | `docs/video-editor/frontend-closure-matrix.md`; `scripts/quality/check-frontend-closure-matrix.mjs` | yes |
| 30 | Frontend | Every supported primitive has evidence paths that resolve to existing files | `docs/video-editor/frontend-closure-matrix.md`; `scripts/quality/check-frontend-closure-matrix.mjs` | yes |
| 31 | Frontend | UI state coverage (empty / loading / error / disabled) documented for all supported primitives | `docs/video-editor/frontend-closure-matrix.md` — UI states column | yes |
| 32 | Frontend | Accessibility expectations documented for all supported primitives | `docs/video-editor/frontend-closure-matrix.md` — accessibility column; § 14 (cross-cutting a11y gaps) | yes |

### 2.8 Structural Governance

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 33 | Governance | Contract surface map is current (`config/governance/contract-surface-map.json`) | `scripts/quality/check-contract-surface-map.mjs` | yes |
| 34 | Governance | Contract governance checks pass (`check-contract-governance.mjs`) | `scripts/quality/check-contract-governance.mjs` | yes |
| 35 | Governance | No SDK import violations in example files (`check-video-editor-sdk-imports.mjs`) | `scripts/quality/check-video-editor-sdk-imports.mjs` | yes |
| 36 | Governance | No core shim usage violations (`check-core-shim-usage.mjs`) | `scripts/quality/check-core-shim-usage.mjs` | yes |
| 37 | Governance | No shots shim usage violations (`check-shots-shim-usage.mjs --max 0`) | `scripts/quality/check-shots-shim-usage.mjs` | yes |

### 2.9 Test Infrastructure

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 38 | Tests | SDK boundary test suite passes | `npm run test:sdk-boundary` → `vitest run --config config/testing/vitest.boundary.config.ts` | yes |
| 39 | Tests | No smoke tests (`check:no-smoke-tests`) | `scripts/quality/check-no-smoke-tests.mjs` | yes |
| 40 | Tests | Lint passes with zero warnings | `npm run lint` → `eslint . --ext ts,tsx --max-warnings 0` | yes |
| 41 | Tests | Strict-islands typecheck passes | `npm run typecheck:strict-islands` | yes |

### 2.10 Release Gate Meta

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 42 | Meta | This checklist file is parseable by the release checklist gate | `scripts/quality/check-extension-release-checklist.mjs`; `docs/video-editor/extension-platform-release-checklist.md` | yes |
| 43 | Meta | `quality:check` aggregate passes (all audit-mode gates) | `npm run quality:check` | no |
| 44 | Meta | All M15 success criteria (plan_v1.meta.json) have been reviewed | `plan_v1.meta.json` of the M15 hardening plan (planning artifact, not in this repository) | no |

### 2.11 Timeline Overlay Host & Gesture Arbitration

| # | Domain | Check | Evidence | Release? |
|---|---|---|---|---|
| 45 | Overlay | `timelineOverlay` contributions are host-rendered through a required `render` id bound via `ctx.ui.registerRenderer()`; overlays without a registered renderer are omitted and undeclared render ids produce diagnostics | `src/tools/video-editor/components/TimelineEditor/TimelineExtensionOverlayHost.integration.test.tsx`; `src/sdk/ui.ts`; `src/sdk/video/families/timelineOverlays.ts` | yes |
| 46 | Overlay | All existing timeline gestures behave identically when no overlay has an active claim (clip drag, trim, ruler scrub, marquee, selection, context menus, wheel/native scrolling, auto-scroll, drop/reorder, and pinch zoom) | S-168; `src/tools/video-editor/components/TimelineEditor/TimelineExtensionOverlayHost.integration.test.tsx` (T5.1 passive parity and ownership arbitration) | yes |
| 47 | Overlay | Installed-package management (enable/disable, settings editing, persisted enablement) is shipped while installer, bundler, marketplace, discovery, and update tooling remain absent | S-160–S-164, S-170; D-001, D-004, D-123 | yes |

---

## 3. Gate summary

| Gate | Mode | Package script |
|---|---|---|
| `check-extension-release-checklist.mjs` | `--audit` | `npm run check:release-checklist` |
| `check-extension-release-checklist.mjs` | `--release` | `npm run check:release-checklist:release` |
| Aggregate audit | (all audit gates) | `npm run quality:check` |

### 3.1 Release-blocking summary

All 46 checklist items marked `Release? = yes` (items 1–42 and 45–47) are **release-blocking**.
Items 43–44 are audit-only and do not block release.

A release can be cut when:
- `npm run check:release-checklist:release` exits 0 (all release-blocking items pass)
- `npm run check:contract-recheck:release` exits 0
- `npm run check:deferred-claims:release` exits 0
- `npm run check:sdk-public-exports:release` exits 0
- `npm run check:frontend-closure:release` exits 0
- `npm run check:extension-example-readiness:release` exits 0

---

## 4. Maintenance

When adding a new evidence domain or gate:
1. Add a row to § 2 with the appropriate `Release?` classification.
2. Update § 3 if a new package script is needed.
3. Run `node scripts/quality/check-extension-release-checklist.mjs --audit` to verify the row parses.
4. Run `node scripts/quality/check-extension-release-checklist.mjs --release` to confirm the gate still passes.

**Never** change a release-blocking row to audit-only without a documented deferral rationale
and a corresponding entry in the supported/deferred matrix.

---

## 5. Ship-quality checklist

This is the release-hardening reference for the dev-local extensions: Scene Phase
Markers, Transcript Caption Foundry, and the Astrid Runaway typed-timeline viewer
(the ten Creative Lab extensions it once covered were removed 2026-10-19). It turns the exploratory
implementation into a measurable production release.

For the implementation history and concrete frictions already found, see
[`creative-extension-lab-frictions.md`](../extensions/creative-extension-lab-frictions.md).
The ordered path from the stable integration branch to the frozen candidate is
tracked in the "Release phases" section of
[`extension-release-runbook.md`](../extensions/extension-release-runbook.md#release-phases).

**Required before shipping**

### 1. Clean integration branch

Merge the relevant work from `timeline-patches`, `oracle-run`, and
`oracle-unified-execution` into one reviewable branch. Separate unrelated dirty
worktree changes and resolve conflicts without losing typed-data or extension
host behavior.

### 2. Completely green merged repository

Run the full Astrid App and Astrid unit, integration, type, lint, manifest-drift,
factoring, and production-build suites. The former Astrid authority-lint and
reduced-pack factoring findings have been fixed; rerun the exact paired suite
at candidate freeze and do not waive failures on shipped paths.

### 3. Production-like end-to-end suite

From clean temporary state, start Astrid and Astrid App, migrate Runaway, open the
editor, invoke every extension, edit results, reload, restart, and render/export.
Assert UI evidence, persisted database state, and output artifacts.

### 4. Persistence and migration durability

Test browser/server/bridge restarts, migration reruns, application upgrades,
partial writes, corrupt records, and old/future schemas. Prove there are no
duplicate tracks, captions, transitions, evidence, or extension records.

### 5. Real rendering and export verification

Render transcript captions into video and compare representative frames against
approved baselines. Verify first/last-frame timing, overlaps, gaps, fractional
frames, multiple frame rates, and Runaway alignment with the 48fps manifest.

### 6. Large-lane virtualization

Viewport-window dense typed lanes rather than mounting every interval. Add
overscan, density summaries, keyboard navigation, and performance tests at 500,
5,000, and 50,000 intervals.

### 7. Deterministic local-test mode

Disable unrelated authentication, token, and remote-service work.
Fail tests on unexpected console errors or unhandled rejections and expose
extension diagnostics separately.

### 8. Astrid bridge hardening

Add authentication/authorization, CORS policy, limits, timeouts, cancellation,
pagination, rate limiting, stable typed errors, version negotiation, and clear
offline/restart behavior.

### 9. Host-owned provenance contract

Replace extension-specific source hashes with host-authored revisions or
fingerprints. Record source, schema, and generator versions and define conflict
behavior when source data and human-edited output both change.

### 10. Transcript round-trip policy

Define whether edits remain local, update transcript source, or become review
proposals. Cover regenerate/preserve/accept flows plus split, merge, deletion,
retiming, overlapping speakers, empty text, and Unicode.

The current explicit policy, completed per-record review surface, and remaining
upstream-owner acknowledgement/frozen-acceptance gates are recorded in
[`transcript-round-trip-policy.md`](../extensions/transcript-round-trip-policy.md).

**Release hardening**

### 11. Extension compatibility matrix

Test every extension alone, every pair, and all together, including live
enable/disable/reorder, duplicate IDs, slow commands, thrown renderers, failed
activation, and failed disposal.

### 12. Accessibility gates

Verify keyboard-only workflows, screen-reader names/state, focus retention,
contrast, reduced motion, zoomed text, and 200% browser zoom.

### 13. Browser and device matrix

Cover Chrome, Safari/WebKit, Firefox, and Edge across desktop, tablet, phone,
touch, mouse, trackpad, Retina, and slower hardware profiles.

### 14. Performance and resource budgets

Budget startup, activation, command latency, hydration, scrolling, memory,
project-data size, contribution count, and update frequency. Add cancellation,
backpressure, and degraded-mode behavior.

Release budgets and their executable gate are defined in
[performance-visual-budgets.md](../extensions/performance-visual-budgets.md).

### 15. Visual regression suite

Cover marker density and zoom, captions over varied footage, Runaway regions,
inspectors, loading/empty/error states, and responsive layouts.

### 16. Failure and recovery testing

Exercise offline/malformed/truncated bridge responses, stale caches, interrupted
migrations, disk-full, permission errors, crash-during-write, and failures during
activation, rendering, commands, and disposal.

### 17. Extension security boundary

For the reviewed statically bundled trusted-local extensions shipped in this
release, validate manifests and contributions, enforce namespaces and
least-privilege host-mediated access, reject unsafe URLs, injection, traversal,
and oversized payloads, and expose no extension-level project/timeline selector
or raw provider capable of selecting another project.

Arbitrary third-party, remote, marketplace, and dynamically installed
extension execution remains disabled and unclaimed by this release. This item
does not assert sandboxing, runtime permission enforcement, CSP subdivision,
process isolation, signing, or a capability broker for such code.

### 18. Migration and rollback policy

Test every supported upgrade path, safe disable/downgrade, pre-migration backup,
receipt idempotency, and restoration after failure.

**Release operations**

### 19. Staged rollout

Use separate flags for the host, Transcript Caption Foundry, and Runaway viewer;
progress from internal users through canary cohorts to default enablement.

### 20. Production observability

Measure activation failures, command errors, bridge latency, persistence
conflicts, render failures, and lane density with extension/schema versions and
without unnecessary creative-content collection.

### 21. Rollback and support runbooks

Provide rapid disable/rollback, corrupted-data recovery, failed-migration
recovery, alert ownership, and severity definitions.

### 22. Human acceptance testing

Test real projects with editors, accessibility users, specialists, and first-time
extension authors. Resolve or explicitly accept every release-blocking finding.

### 23. Frozen release candidate

Require a clean worktree, two independent reviews, pinned dependencies,
reproducible production build, release notes, known limitations, migration
instructions, and a verified rollback.

**Final release gate**

A clean machine must be able to clone the integration branch, start Astrid and
Astrid App, migrate the Runaway project, exercise every extension in a real browser,
restart everything, render/export the result, and reproduce the same persisted
state and visual evidence with zero unexpected errors.

The executable release gate is
[`scripts/release/verify-extension-ship.mjs`](../../scripts/release/verify-extension-ship.mjs);
inspect it with `npm run verify:extension-ship -- --plan` and operate the rollout,
recovery, review, and human-acceptance controls in
[`extension-release-runbook.md`](../extensions/extension-release-runbook.md). The pinned
candidate and toolchain are recorded in
[`config/releases/extension-ship-quality.json`](../../config/releases/extension-ship-quality.json).

Ship-quality disposition is enforced separately from the narrower platform
contract checklist in section 2. The immutable receipt format, honest in-progress ledger,
and fail-closed command are documented in
the "Evidence ledger" section of [`extension-release-runbook.md`](../extensions/extension-release-runbook.md#evidence-ledger). A
release verifier run cannot pass until that ledger reports 23/23 against the
exact frozen Astrid/Astrid candidate pair. The annotated Astrid App tag identifies
the immutable product candidate; the clean controller `HEAD` is a strict
evidence-only descendant containing only the frozen ledger, the manifest status
transition, and committed artifacts under the release-specific evidence root.
