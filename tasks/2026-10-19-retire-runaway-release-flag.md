# Retire `runawayTypedTimelineEnabled` (follow-up to the Creative Lab / fixture-lane removal)

Why: after the Creative Lab extensions, the DEV Runaway bridge loader and the transcript fixture provider were
deleted, the flag gates nothing App-side except the Runaway viewer registration in `VideoEditorPage.tsx`
(`extensionReleaseFlags.runawayTypedTimelineEnabled`). It is still part of the release-config contract
(`EXTENSION_RELEASE_CONFIG`, `RUNAWAY_TYPED_TIMELINE_ENABLED`), so removing it is a cross-repo contract change
with a shared schema (Zod), not an App-only cleanup.

Owner: unassigned. Needs the release-contract owner to accept it before anyone edits the schema.

## Master checklist
- [ ] Decide: keep the Runaway viewer behind a flag, or register it unconditionally like the other kept extensions.
- [ ] Remove the field from `src/tools/video-editor/runtime/extensionReleaseControls.ts` and its test.
- [ ] Remove `RUNAWAY_TYPED_TIMELINE_ENABLED` from `scripts/runtime/write-extension-release-config.mjs`,
      `scripts/runtime/verify-extension-container.mjs`, their tests, and `tests/e2e/local/support/harness.ts`.
- [ ] Update `docs/extensions/extension-release-runbook.md` (and the historical ledger only by amendment).
- [ ] Bump the shared release-config schema in the same PR in every repo that reads it; no compatibility shim.
