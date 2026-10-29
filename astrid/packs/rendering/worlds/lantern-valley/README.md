# Lantern Valley

The built-in sample world for the Three.js Live Editor's World Explorer, and the
reference example for `astrid/packs/rendering/docs/references/worlds-authoring.md`.

A valley at dusk with a river, a stone bridge, a hamlet and lanterns that rise
from the water through the evening. Everything is built in code (three r185.1):
terrain, trees, water, lanterns, and the moon. The scene is one self-contained
HTML entry in `prepared/lantern-valley.scene.json`.

## Shots and events

Time is 75 s of source time at 30 fps. Shots are authored camera moves, laid end to end
on the source clock. Each has a `worldStart`, the world time at its first frame.

| Shot | Source | World | Sees |
|---|---|---|---|
| Valley flight | 0-25 s | from 0 s | the valley from the air |
| Riverside walk | 25-50 s | from 20 s | the river and the bridge, on foot |
| Moon overlook | 50-75 s | from 22 s | the valley from the ridge, under the moon |

Events are in world time:

| Event | World time |
|---|---|
| Moonrise | 0-18 s |
| Shooting star | 12.5 s |
| Lanterns lift off | 24-40 s |
| Fish leap | 43 s |

The explorer's free mode (`explore`) starts above the valley and is bounded to it.
`prepared/world.json` holds the shots, events and explore descriptor; it is what the
build writes from the source, so it never drifts from the scene.

## Files

- `src/`: the world source (`main.ts` the entry, `shots.ts`, `world/*` the scene).
- `build.mjs`: bundles the entry, writes `prepared/`, and regenerates the explorer module
  `ui/threejs-live-editor/explorer/worlds/sample.ts` (do not edit that file by hand).
- `deps.mjs`: where three and esbuild come from (see below).
- `harness/`: `validate.mjs` (the package through Astrid's validators and the Python
  `validate_package`), `check.mjs` (shot checks), `capture.mjs` and `views.mjs`
  (headless stills through Astrid's runtime), with `host-page.ts` and `shots.json`.
- `stills/`: three 640x360 timeline stills.

## Rebuild

```bash
node build.mjs            # prepared/ and the explorer module
node harness/validate.mjs # checks the committed package
node harness/check.mjs    # shot checks
```

Dependencies come from, in order: `LANTERN_VALLEY_DEPS=<node_modules>` when set; the
repo's `remotion/node_modules` (three pinned to 0.185.1) when it exists; otherwise this
folder's own `node_modules` after `npm install`. Stills and the profile script also
need Playwright, from `PLAYWRIGHT_DIR` or the same dependencies folder.

Commit the regenerated `prepared/lantern-valley.scene.json` and
`ui/threejs-live-editor/explorer/worlds/sample.ts` together. Do not commit `node_modules/`,
`.cache/`, or the full stills set.
