# editorial.pacing

`editorial.pacing` renders a deterministic rhythm sheet from one exact,
Runtime-admitted authoring bundle. It is an auxiliary review action and never
publishes or mutates a timeline.

The generic invocation layer supplies `project`, `timeline_ref`, and the
immutable bundle/identity handoff. The action deliberately has no ambient
launcher fallback and does not open a second Runtime connection. A missing or
mismatched handoff fails closed.

Outputs:

- `pacing.png`: 2400x1350 rhythm sheet with chapters, canonical picture cuts,
  speech density, silence gaps, cut rate, optional beats, and summary.
- `pacing.md`: human-readable summary, cut table, stalls, silences, and method.
- `pacing.json`: `editorial.pacing/v1` machine-readable model.

The shared model consumes `astrid.core.timeline.cuts.picture_cuts` for cut
identity and timing. It does not select a parallel visual-cut definition.
When the visualization pack contributes a rhythm layer, it should consume the
same model and the public V3 `LayerContext`/`LayerResult` contract.

The action is read-only. Final Runtime-bound invocation, manifest registration,
SDK/CLI exposure, and installed qualification are integration-owner work.
