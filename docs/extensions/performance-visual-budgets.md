# Extension performance and visual budgets

These are release gates, not aspirational targets. Production loads only the live-scenes and
transcript extensions. The former test-only fixture catalog that stood in for the rest was removed.

The browser performance gate is `tests/e2e/timeline/extension-performance-budget.spec.ts`. It loads the
editor over the fake Runtime with the render-matrix transcript fixture (`?transcriptLaneFixture=render-matrix`,
served by the DEV fixture provider; the page honours it only under `--mode test`, the mode Playwright starts
the dev server in) and holds these budgets, all from the spec's `BUDGET` constant:

| Signal | Release budget |
| --- | ---: |
| Serialized timeline project-data response (head composition revision) | 1 MiB |
| Declared extension contributions shown in the Extension Manager | 128 |
| Runtime data requests during a 24-event scroll burst | 4 |
| Runtime data requests during a 5-second quiescent window | 4 |
| Total live DOM nodes after the burst | 5,000 |
| JavaScript heap used | 256 MiB |
| Retained heap growth after the burst (forced GC where supported) | 64 MiB |
| Horizontal document overflow | 0 px |

Run it with:

```sh
npm run test:e2e:extension-performance
```

The spec attaches the observed values as `extension-performance-budget.json` and fails on page or console
errors. Heap is read through CDP metrics (Chromium only; the growth check is skipped where the metric is
unavailable). It asserts no durations: the long timeouts in the spec are hang ceilings for a cold dev server,
not performance claims.

The other signals have their own owners:

| Signal | Owner |
| --- | --- |
| Mounted data-lane items stay at most 128 while the viewport moves (500-segment `transcriptLaneFixture=dense` lane; the window moves and early ids unmount) | `tests/e2e/timeline/data-lane-viewport.spec.ts` |
| Mounted lane items and the sparse window stay bounded at 500, 5,000 and 50,000 source intervals; late-time ids mount and early ids unmount after a viewport move | `npm run test:extension-scale` (`DataLaneList.test.tsx`, the `it.each([500, 5_000, 50_000])` cases and the 50k full-lane action case) |
| Horizontal document overflow of the composed editor shell | `tests/e2e/timeline/shell-responsive-overflow.spec.ts` at desktop, tablet-portrait and phone |

No loaded extension contributes a `timelineOverlay` (the Scene Phase Markers fixture was retired with the
fixture catalog), so there is no real-browser case for overlay edge auto-scroll or for an overlay refusing a
pinch. The first shipped extension that contributes a `timelineOverlay` must bring both back as browser cases.
Marker-versus-pinch keeps its jsdom home in `src/tools/video-editor/lib/mobile-interaction-conformance.test.tsx`
(`overlay-owned pinch — declines acquisition`); the overlay host contract stays in
`TimelineExtensionOverlayHost.test.tsx` and its integration test.

The scale gate is deterministic and structural: it proves the rendered item count equals the DOM budget
(`DATA_LANE_DOM_ITEM_BUDGET`, 128) at every size while `data-total-items` keeps the full count, with no
wall-clock or heap readings, which vary with machine load and GC timing.

Visual regression uses three complementary gates:

- `tests/e2e/timeline/layout-geometry.spec.ts` compares committed desktop,
  phone, tablet portrait, and tablet landscape geometry within an 8 px
  tolerance. Counts and structural flags are exact.
- `npm run test:e2e:extension-visual` compares focused, committed Chromium
  pixel baselines (`composed-desktop`, `composed-tablet`, `composed-tablet-touch`,
  `composed-phone`) for the timeline with the production extensions and the
  render-matrix transcript fixture. The gate fixes locale, timezone, colour
  scheme (theme hour pinned to midnight), reduced motion, device scale,
  animations, scroll position, and bundled-font readiness; it intentionally
  does not claim human typography or real-footage acceptance.
- The cross-browser/accessibility suites retain screenshots for the composed
  transcript lane, responsive controls, 200% content zoom, and reduced motion.
  The caption export proof (`tests/e2e/timeline/caption-render-export.spec.ts`)
  was removed with the Transcript Caption Foundry extension in commit aa6683590;
  it used to validate the rendered MP4 and assert that the render emitted no font-stretch
  warnings; signed human acceptance still owns typography, shaping, and
  legibility judgment over real footage.

Budget changes require a release-note rationale and updated frozen-candidate
evidence; they must not be relaxed merely to make a regression pass.
