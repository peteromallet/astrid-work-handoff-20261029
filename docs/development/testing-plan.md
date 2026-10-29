# TESTS: tests that tell us the truth (Astrid · Runtime · App)

> The cross-repo testing plan for Astrid, the workspace Runtime and the App (astrid-app). It lives here because Astrid hosts the journeys (`astrid dev journey`, see `journeys.md`).

A standalone plan in Megado format: cards with size, route, inputs, outputs and "Done when". It is not run inside Otto.

**Revision 4, 16 Oct 2026.** Revision 3 (15 Oct) set the shape: three layers, producer-owned manifests, and real journeys. Revision 4 keeps that shape and changes what didn't hold up:
- **The Checkpoint B criterion "the owner watches the film" is now an automated check.** Playback is proved by preview parity and a revision marker (F2.4).
- **No accepted failures.** Every test must pass; the former quarantine and its cap are retired by R-6.
- **The smoke can build a generated mini-realm** (`--reference generated`), so it needs no copy of the real film. It still runs only on macOS until the Runtime launcher has a Linux custody provider (Owned debt: launcher custody); the real film stays the release gate.
- **Old checks are deleted only after their replacement exists.** Runtime's i06 and activation join moved from U4 to TIDY.
- **The plan's end state no longer depends on Otto tooling.** "`otto-heavy` flags leftovers" is out.
- **Thirteen cards became nine**, each with explicit inputs, so the waves can be scheduled mechanically.
- **The "where we are" numbers were re-measured** on 16 Oct in a clean Linux container.
- **New: how the plan is executed** (waves and model tiers).

**The owner's yardstick (15 Oct):**
- No arbitrary time constraints. Durations are recorded and never judged. Only a genuine hang fails.
- What counts: tests that are robust and thorough, assert meaningful behaviour, and do it as elegantly as possible.
- Not excessive: a test earns its place by catching a failure nothing else catches. Fewer, truer tests beat more tests.

## Status (21 Oct 2026, after the rebase onto the big upstream push: App 34ec4b79, Astrid a6ddfd1b, Runtime b535646)

| Card | State | Evidence |
|---|---|---|
| LEAK | **Done** | Both suites reap their process groups and fail a session that leaks file descriptors (`tests/lanes.py`). |
| UA (Astrid) | **Done** | Full default lane on main a6ddfd1b plus this run's fixes: 12,277 passed, 0 failed on the final tree (two halves: 6,693 and 5,584; the one failure the run found, a stale artifact digest for the Transcript lane fix, is fixed in ceb0dd94). Static gates: ruff 2,203 and mypy 1,943 (exact; mypy pins `platform = "darwin"` so Linux CI and macOS count the same), structure 14, 6 import cycles, doc-refs, doctor. The dev extra pins the Runtime (b535646), which main imports and nothing installed. `make preflight`, `remotion-typecheck` and `renderer-parity` pass (21 Oct; the @banodoco timeline packages installed from clones at their pinned tags, because GitHub's archive endpoint is closed to this container; the repo's lock is unchanged). Running them first found three defects, also on main: the parity fixture TIDY deleted while upstream 0db8ce05 started using it; the Remotion tsconfig mapped no `astrid_motion` element modules, so any render broke the next typecheck; and 12 real-render tests that skipped without Remotion failed with it (upstream's launch validation; an exported `PYTHONPYCACHEPREFIX` the runtime rightly refuses). Fixed in 35dd249c, ea642d5f, b503422d; the real renders are integration tests now. |
| UR (Runtime) | **Done** | Default run 3,851 passed, 0 red (26 Windows-only skips). The custody tests select their platform branch: macOS through the broker, Linux through native custody (upstream superseded our door-audit fix and Darwin fixture). |
| UP (App) | **Done** | Unit 16,930 passed in 1,227 files; `tsc` 0, lint clean, `check:contracts`, SDK imports. Timeline browser suite 23 of 23 twice (four cases retired: upstream c447c6f8 stopped loading the fixture extensions they exercised, R-1 rows in the commit); H.264 proofs in installed Chrome 3 of 3 (upstream deleted the caption matrix spec); extension gates in Chromium, Firefox and WebKit: visual 4 of 4 (baselines regenerated after the Transcript lane fixes, approved per image by an Opus reviewer), accessibility 15 of 15, cross-browser 9 of 9; public specs 7 of 7. |
| C1 | **Done except C1.3** | `artifacts.json` in Runtime and Astrid; vendor locks in the App (4) and Astrid (3), checked locally per push and against the producer's main in a boundary job. C1.3 (timeline packages) is owned debt. |
| C2 | **Done** | Nine responses recorded from a real daemon; the App's and Astrid's parsers, conflict classifiers and fakes are held to them; the paired relay is checked against every call the App makes. |
| F1 | **Built, not run end to end** | Generated reference, `--backend`, env scrubbing, disk preflight, revision set, killed-task read-back, `runtime_restart`; 82 plumbing tests. The run needs macOS (Owned debt). |
| F2 | **Thin slice built on the direct path**; three-products 4 of 4 and the direct journey (through the Runtime's own door) 39 of 39, the direct journey now 40 of 40 (upstream added a case); both re-run on 21 Oct on the final App, Astrid and Runtime branches, all three at Runtime b535646 (Linux, one worker, installed Chrome) | Four cases in `astrid-app/tests/e2e/local/three-products.spec.ts` (agent → open App; concurrent edit; render R, publish R+1 before it runs, which is steps 3 and 4 in one test with two `test.step`s; Runtime restart), Astrid side `astrid/core/dev/cross_client.py` (`host --render` also hosts `rendering.render`; the marker executor writes a PNG and a 2 s VP8 clip), nightly job `three-products` in `astrid-app/.github/workflows/direct-journey.yml`. Steps 3 and 4 built (the media-only render needs no Remotion: Remotion is per task, see Owned debt); step 6 and launcher custody stay owned debt; relay variant after Plan B M0. |
| TIDY | **Done where R-1 allows** | Homes written, then deleted: Astrid's m4/m7/m8 gates and artifacts, the CI mirror (`run_ci_checks.sh`, its 25-minute self-test, the sandbox test), the stage-1 cross-repo acceptance and cold-launch matrix (real-daemon homes in `test_runtime_client_cutover.py`), the VLM gate, the timeline agent-benchmark harness (the top-level evals package and its tests), `tests/proofs` and `scripts/proofs`, the unused fresh-clone and runpod smoke scripts, and dead files; Runtime's i06 proof; the App's paired `astrid serve` release gate (its verifier script, spec, validators, vitest wrappers, render worker and `verify-extension-ship` entry: one home added, the host-fingerprint canonicalization case, now in `src/sdk/video/timeline/sourceMap.test.ts`; the serve-owned render evidence and provenance checks are F2's) and real-bridge harness (new tests for recovery retry, promote and duplicate failure toasts, the watchdog banner; the network audit in every timeline spec) the `astrid serve` bridge itself (`dev:editor` and the timeline suite run on a seeded fake Runtime held to the recorded Runtime responses; the bridge and Supabase data providers, `useEditorSync` and the capability census are deleted), and the bridge-latency gate (its 500 ms GET and save SLOs and 10 s deadline were dropped with no home: an owner-sanctioned loss, see Owned debt). Kept with their unblock tests: see Owned debt (including the App's local-project gallery journey). |

**Product bugs the tests found and fixed on the way (R-13):**
- the training pack's schema root;
- the hype arrangement rules lost in 71d43e00 (editorial arrange and refine, video_editing cut failed at import);
- `understanding.understand` lost its mode choices and per-mode required inputs in the same port;
- the generation-publication CLI still looked for `executor_root`, which schema-v3 capabilities no longer carry;
- h3_av verified protected pixels through a different RGB conversion than it composed them with, so any yuv420p source failed verification;
- Ctrl+C cleanup had a 1 s floor that a busy host's census overran (now 5 s, a cap, not a wait);
- the first-party pack list; `pixel.strip` had no capability-matrix row; three bare env-var strings;
- the stale Runtime TypeScript conformance client;
- the App reading only the old nested Runtime error body and misreading a 422 as an unavailable capability;
- four doc commands that did not exist;
- the CI rewrite had dropped Astrid's release-wheel job (restored).

**Found in the second run (18-19 Oct), while rebasing through the rename:**
- the App accepted only the Runtime contract digest from before c87d5b9, so it refused a current Runtime (fixed upstream in parallel);
- the rename turned "no Reigh in the copy" checks into "no Astrid", which rejected the correct copy (fixed upstream in parallel);
- two vibecomfy modules named `executor.py` were discovered as folder executors and failed to load (structure baseline 23 → 15);
- a pack edit could leave the whole-Tool catalog stale, and only the App build noticed (a test now fails first);
- `make structure` ran only with `PYTHONPATH` set;
- the timeline golden digest had drifted with a deliberate fixture change (`tracks[].role`, fb9e8a31).

**Found in the third run (19-20 Oct), all fixed:**
- the extension manager's state and diagnostic text was drawn in night hues, 1.4-2.4:1 on the day palette (now design tokens held to 4.5:1 across the whole day-to-night range);
- the editor runtime set store state during render; onboarding ran the full capability census (a deliberate 404) on every launch;
- an extension setting's "Saved" timer outlived its row;
- ruler labels sat under extension markers; invisible hover controls truncated lane labels; "Actions (N)" wrapped out of its button; the Inspector's viewport default was saved as a choice;
- the H.264 proofs ran in bundled Chromium (no encoder), and their lane silently ignored the Chrome channel; they have their own installed-Chrome lane and release gate;
- the extension visual baselines followed the wall clock (they choose night now); a flaky ruler calibration clicked past the composition end;
- Astrid's mypy gate counted differently on Linux CI than on macOS; 53 RunPod tests went stale while skipped (no runpod-lifecycle) and ran red once CI installed it; seven Runtime custody tests ran the Linux branch against macOS fakes;
- stale specs after upstream's deliberate changes (the agent landing audience, one URL shape, the Rendered film's Download button, the touch editor, the renamed `app.releaseTag`), and two `tsc` errors on main.

**Found in the fourth run (20 Oct) by the F2 render case, all fixed (each in the product, with a test that fails without it):**
- the App named `rendering.remotion` for every ordinary timeline, so no host could choose a renderer it can run (`renderRouter` now names none; only the live-scene composition is still named);
- the App published an uploaded object's absolute URL as the registry entry's `file`, which the Runtime refuses as an unmanaged locator when it freezes a render (the 422 came at render admission, not at save); `dataProvider` now publishes the object's route (`/v1/objects/<id>`) when `file` is this Runtime's own URL for the entry's own object (a foreign origin's `/v1/objects/<id>` is left for the Runtime to refuse), and resolves a route without a registry readback; this needs Runtime 32b3a24 or later (see Owned debt, item 2 of the smoke blocker);
- Astrid's on-screen coverage model treated a plain `media` clip as overlay content unless its track was named `plate`, so `timelines publish` refused a shot whose picture was on any other track ("nothing covers the canvas"); a media clip with an asset is now the picture wherever it sits;
- `rendering.ffmpeg` tagged its H.264 only with the colour matrix (BT.601), so Chrome decoded the HD film as BT.709 and every saturated colour moved (green 255 → 217, mean 19 levels off the preview); the film is now converted to BT.709 and carries the whole description (checked with `ffprobe` in the integration test and by the preview-versus-film comparison in the journey).

**Found on 21 Oct, after the rebase onto the big upstream push (each fixed in the product, with a test that fails without it):**
- the rendering pack's Transcript lane drew each chip at least 14 px wide whatever its interval (padding on a border-box button), so chips that do not overlap in time overlapped on screen and the diagnostic chip sat under its neighbour; the chip text then showed sliced letters until its inset became a margin (Astrid e17af8bf, 130eff9e; vendored into the App);
- a clicked chip's focus tooltip sat over the row above and was hoverable, so the next chip up could not be clicked; it now clears the whole lane (Astrid e17af8bf);
- Astrid's installer, services and packs import `runtime_protocol`, which nothing installed: the dev extra pins the Runtime at the commit `runtime.lock.json` vendors, and the release job installs it before the wheel.

Two findings that are not product fixes: ffmpeg reads every VP8 frame as BT.601 whatever the WebM container says, and a browser's `<video>` and its WebCodecs path decode an *untagged* clip differently, so the journey's own media (and the marker executor's clip) are BT.601 with the colour description in the file; and a `task:T/name#n` handle counts all of a task's outputs, so the marker clip is `marker_clip#1` (the PNG stays `marker#0`).

**Test-system fixes on the way:** a vendor-lock boundary check now fails only when a vendored file changed (a version-only producer change was failing every consumer); running one test from a file with a known failure no longer trips the stale-entry check; the App's theme test pins the clock (the theme follows the time of day).

## End state (what "done" means)

When this plan is finished, these statements are true. Each one is checkable.

1. **One honest answer per repo.**
   - A plain default run is green in CI, on every push.
   - Red means something is broken; there is no "normal red".
   - No failure quarantines; all required tests pass.
   - Every test runs in a lane with a recorded result. The union of the lanes equals the collected suite.
2. **No copy between the products can drift unnoticed.** Each copy is checked by **artifact digest** against a producer-owned manifest, so a one-byte change fails the consumer. There are three producers:
   - **Runtime**: clients, schemas, fixtures, and real-daemon response fixtures.
   - **Astrid**: its CLI command surface, its elements catalog, and the `astrid-browser` source the App vendors.
   - **The timeline packages**: schema and composition, including transitive copies.

   Every journey records the exact revision set it tested:
   - the Astrid, Runtime and App heads;
   - the manifest versions;
   - the vendored commits.
3. **The human-and-agent workflow is proven for real.**
   - **`smoke`** (Astrid + Runtime) runs on any Linux or macOS machine against a generated mini-realm, and against a clone of the real film on the reference machine. It proves:
     - host start;
     - a render admitted the way the App admits it;
     - host replacement after a code change;
     - a crash mid-render, with orphans reaped and the killed task ending in a defined state;
     - a Runtime restart under a live host.
   - **`full`** (all three, through the topology beta users run: the App on its Workspace v1 provider → paired relay → connector → Runtime) proves:
     - an agent publish shows up in the open App;
     - a concurrent human/agent edit loses nothing;
     - the App's own render action renders exactly the accepted revision;
     - the rendered film plays through the relay, matches the preview, and has sound;
     - the App survives a Runtime restart without losing its draft.
4. **Every red names its cause:**
   - the layer and the phase;
   - a hang is stopped and named as a hang;
   - a provider failure (Codex or the image model) is kept apart from a product failure.
5. **Each check runs where it belongs, once:**
   - hosted CI runs the local and boundary layers per push;
   - the smoke runs before merges that touch R-11's paths, and at each release;
   - `full` runs at each integration point and release;
   - no render or journey runs in hosted CI per push.
6. **Less than today:**
   - the ~10 proof and gate mechanisms (including the App's retired `astrid serve` harness) reduce to the journeys;
   - each of their useful assertions has a named new home;
   - fakes are trusted only for what real-daemon fixtures verify;
   - no new framework.
7. **Test runs don't harm the machine.** Every suite reaps the daemons and hosts it started. It fails if it leaves processes or file descriptors behind.

## Layers

1. **Local behaviour** (per repo, every push). Everything deterministic that needs no second repo, real host, renderer or network, including filesystem, database and component tests.
2. **Boundary compatibility** (every push to a consumer, and whenever a producer's manifest changes):
   - digests against producer manifests;
   - consumers' parsers and fakes run against **real-daemon response fixtures**;
   - the paired relay's route table is checked against every call the App actually makes.

   This proves fidelity to a pinned producer version, not compatibility with every future push.
3. **Real journeys** (`astrid dev journey --tier smoke|full`). `full` includes `smoke`.

When all three layers are green, the main things work together. When one is red, it says which thing is broken.

## Where we are (evidence)

Re-measured 16 Oct 2026 in a clean Linux container (4 cores, Python 3.11, Node 22), at Astrid `54095b4`, Runtime `9780b59` and App `c986308`.

| | Astrid | Runtime | App |
|---|---|---|---|
| Collected | 11,887 tests | 1,944 tests | 19,081 tests (4,532 suites) |
| Collection errors | 29 files | 1 file (i06), plus 4 more from undeclared test deps (`jsonschema`, `PyYAML`) | — |
| Red in a full run | ~850 (one full pass, 16 Oct; ~600 triaged so far) | **88 failed / 1,853 passed** | **264 failed / 18,815 passed** (95 files) |
| Main cause of the reds | Tests not updated for 71d43e00 (packs moved `executors/` → `actions/`, schema v3 `pack.yaml`) | Tests not updated for 9ba7b1c (task-spec dedup) and 9d2b5df (remote activation order) | Mocks and fixtures drifted from the product's current exports |
| Real product bugs found | training schemas root missing; editorial `arrange` imports a removed function; first-party pack list stale; custody race on Linux | remote-worker drain broken by merge 5053297; TS conformance client stale against the contract | pack commands use the retired task envelope; seam admission refuses popup edits; recovery draft dropped by the poll gate; 22 ungoverned SDK exports |
| Tests that rewrite tracked files | `remotion/src/types.generated.ts` | `egg-info/SOURCES.txt`, the generator test | — |

**Progress (16 Oct):** Runtime's default run is green (1,914 passed, 3 known failures). The App's default run is green apart from tests that were timing out under load, which are now fixed (19,050 passed, 7 known-failure entries). Astrid is in progress.

**Copies between the products (15 Oct, checked):**
- Astrid's Python client exactly matches Runtime's, but by hand-copied hashes.
- **The App's `generated.ts` has drifted.**
  - `publishParentComposition` accepts `[200, 201]`; the server always returns 200.
  - The App's guard checks only `SCHEMA_DIGEST` and runs in no CI.
- Runtime's `contract/manifest.json`:
  - lists paths, with no digests and no version;
  - omits the visual fixture and the conformance YAML.
- `component-manifest.json`'s fixture digests are placeholders (`aaaa…`).
- Runtime has two differing TS clients: `packages/typescript` and `clients/typescript`.
- The TS "generator" patches its own committed output.
- The conformance YAML says PATCH 1→2, while the actor publishes a composition revision.
- Timeline-schema exists in three versions:
  - Astrid's Python pin (`banodoco/astrid-agent` at `242f9c43`);
  - **0.0.1**, transitively, in Astrid's Remotion lock;
  - the App's vendored 0.0.2.

  Composition is 0.0.6 versus 0.0.2, and Remotion 4.0.509 versus 4.0.503.
- The App vendors `astrid-browser` from Astrid `06dee36` (25 Sep), and nothing checks it.
- **The App's agent prompt tells the agent to use `timelines retime-clip`, which Astrid removed** (0bd37792).
- Five Astrid test files pin Runtime `afccb430` in a sibling checkout that doesn't exist.

**Live interaction bugs found by the reviews.** These were fixed *before* this plan started, each with a red→green test, and merged to main on 15 Oct 2026 (Astrid 42eca1d7, Runtime ec18217, App 295670ca4). This plan is testing only. Its cards keep those behaviours covered.

| ID | Bug | Where | Kept fixed by |
|---|---|---|---|
| B1 | The paired relay's allowlist rejects `…/timelines/{id}/composition-revisions` and `…/inspect` (and `/v1/capabilities` on the Runtime side). Paired-mode saves likely fail. | `astrid-app/config/vite/pairedRoutePolicy.ts` | C2.3, F2 |
| B2 | The ACP prompt names the removed `retime-clip` command. | `astridAcpLauncher.ts` | C1.2 |
| B3 | The App classifies conflicts by regex on the message. The App's fakes send codes the Runtime never sends. | `client.ts:146`, `fakeBridgeRouter.ts:684` | C2 fixtures |
| B4 | An expired lease is reaped only inside a claim. A crashed render stays `running`, and the App's render poll spins forever. | Runtime `store.py:3368`; App `useRenderState.ts:776` | UR.6, F1.2 |
| B5 | After a Runtime restart, the pack host keeps a sticky fence and refuses to re-register until an Astrid client opens. App-started renders then never run. | `generic_host.py:6015` | F1.3 |
| B6 | The App's `generated.ts` accepts `[200, 201]` for `publishParentComposition`; the server only returns 200. | App `generated.ts` | C1.4 (regenerated, then digest-pinned) |

**Duplication:**
- Fakes: ~20 Runtime fakes in Astrid, and ~9 in the App. The App's main fake imitates the retired Astrid bridge.
- ≥6 host-launch fixture families.
- ≥5 ways to locate the other repo.
- Proof and gate mechanisms:
  - in Astrid: the dev journey; s1/m4/m7/m8; stage1 acceptance; iteration e2e; tests/proofs; the timeline eval harness; the VLM gate; smoke_*.sh;
  - in Runtime: i06 and the activation join;
  - in the App: the paired release verifier and `REAL_BRIDGE`.

## Rulings

| # | Ruling |
|---|---|
| **R-1** | Three layers only. Nothing else gates a merge or a release. Other harnesses are folded in or deleted, and only after each useful assertion has a named new home. |
| **R-2** | The default run leaves out tests that need a pack host or other long-lived subprocess, Node, ffmpeg or Remotion, native macOS, the network, or a second checkout. They are marked `integration`, `darwin_native` or `live`, and run in a recorded nightly lane. **The nightly lane obeys R-6 like any other lane**: every failure must be fixed. |
| **R-3** | Each producer (Runtime, Astrid, the timeline packages) owns a versioned manifest of artifact **digests**. Consumers vendor by script and check digests, never hand-copied hashes or version strings. |
| **R-4** | A fake is trusted only for operations whose real-daemon responses (including errors) it reproduces from recorded fixtures. Anything else fails loudly. No universal fake. |
| **R-5** | Runtime never imports Astrid or the App. Cross-product tests live in the consumer and record the producer versions. |
| **R-6** | Red is never normal, and never accepted: a failing test is fixed (or, if it measures the wrong thing, corrected), never listed, xfailed or skipped. There is no known-failures list (removed 18 Oct 2026). An import or collection error fails the run. |
| **R-7** | Delete before adding. A test pinned to a removed design is deleted, with a `removed.yaml` line, not fixed. No new framework. A test of a deliberately *changed* design is updated to assert the new behaviour. |
| **R-13** | **Small product fixes ride with the test that exposes them.** The plan is testing-only, but a test that exposes a small, unambiguous product defect (a wrong path, a stale generated file, a broken import) gets the fix in the same commit. A larger defect remains blocking, with an owner and a reason naming file:line. |
| **R-8** | Tests assert behaviour and identity, not private attributes or proxies. Examples: "the output is revision R", not "a render finished"; "the killed task ended in state X", not "the next render works". |
| **R-9** | Every suite reaps what it starts and fails on leftovers. Required lanes fail when prerequisites are missing. Heavy local runs go through `otto-heavy` when it is present; nothing requires it. |
| **R-10** | Every journey phase reports success, failure or hung, with its duration and the machine load. Durations never fail a run. Hang ceilings are many times the usual duration. Provider failures are reported separately and never replaced by a fixture. |
| **R-11** | **When journeys run.** Every merge runs the affected local and boundary checks. The smoke also runs before a merge that touches any of:<ul><li>Astrid `astrid/core/execution/{process_group,custody_broker,task_scope,generic_host*}.py`, `astrid/sdk/{autobootstrap,host_bootstrap,workspace_client}.py`, `astrid/packs/rendering/**` or `remotion/**`;</li><li>Runtime `runtime_protocol/**` or `astrid_runtime/**`.</li></ul>The thin `full` runs before a merge that touches the App's `src/integrations/runtime/**`, `renderRouter.ts`, `useTimelineSave.ts`, `usePollSync.ts`, `config/vite/paired*` or the connector. Both run at each integration point and release. |
| **R-12** | **One pre-push command per repo** (`scripts/check-before-push`, a small script, not a framework). It runs the default run and, when R-11's paths changed, the smoke, **locally**. That local smoke is the "before merge" check of R-11; hosted CI never runs it. A push to main without it is not done. |

## Cards

Sizes are rough focused days, for ordering only. **In** names the cards whose outputs a card needs; a card with no inputs can start at once. Route is normal or xhard.

### LEAK: test runs clean up after themselves
`1 d · normal · in: — · out: U#no-leaks` · **partly done 15 Oct**
**Done when:**
1. ✅ Astrid and Runtime suites own and reap every daemon and host process group, and fail on leftovers (Astrid 390e6679 + a6e7bd40; Runtime 66751d7 + dd57fe2).
2. A session-end check compares open file descriptors and rooted processes with the start, in both suites, and fails on growth.

### UA: Astrid honest and green (with its CI)
`4 d · normal · in: — · out: U#green-astrid, CI#astrid`
**Done when:**
1. **CI that can pass.** The frozen m4/m7/m8 jobs, the Runtime pin `a278cd46` and the duplicate suite run are gone. One unit job runs the default run, with the cheap static gates (`make structure ruff mypy cycles`) as steps. (r4 GREEN's `make doc-refs` does not exist; its documentation checks join those gates when written.) `scripts/check-before-push` exists.
2. **Dependencies resolve.** `pip install -e '.[dev]'` works in a clean environment. The timeline-schema pin points at a reachable source (today it names `banodoco/astrid-agent@242f9c43`, which `uv` cannot fetch).
3. **Collection is honest.** Collection-time side effects move into fixtures. One `runtime_checkout` fixture replaces the five locators and the `afccb430` / `70e269bc` pins. Collection has zero errors: each erroring file is deleted (with a `removed.yaml` line) or repaired. No test listed by r4 GREEN item 6 as "never obsolete" is deleted.
4. **Lanes are complete.** The union of the default, nightly and journey lanes equals the collected suite, checked by a test.
5. **Green.** Every failure is fixed or its test corrected to the current behaviour; every required lane passes. No test is weakened to get green, and corrections explain their reason in the commit.

### UR: Runtime honest and green
`2 d · normal · in: — · out: U#green-runtime, CI#runtime`
**Done when:**
1. Test dependencies are declared (`jsonschema` and `PyYAML` are imported by tests but not declared), so a clean `pip install -e '.[test]'` collects the whole suite.
2. Every current red is dispositioned.
3. Tests stop rewriting committed files: `test_generated_client.py:707`, and whatever regenerates `astrid_runtime.egg-info/SOURCES.txt` (better: stop committing `egg-info`).
4. A generous per-test hang guard is set (hangs only).
5. Runtime's first workflow runs the default run, plus `test_second_client_e2e.py` as a boundary job with an npm cache. `scripts/check-before-push` exists.
6. A test keeps B4 fixed: an expired lease with no new claim ends in its defined state.

### UP: App honest and green
`2 d · normal · in: — · out: U#green-app, CI#app`
**Done when:**
1. vitest is measured and gets a per-push workflow. `scripts/check-before-push` exists.
2. The default run needs no Astrid checkout. Today the vitest config fails to load without `ASTRID_CHECKOUT`, because the vendored `astrid-browser` lacks `tools/catalog.json` and the `video_editing` pack.
3. Tests that reach into another repo (`astridSceneAuthoring`, `localExtensions.catalog`, `portableVisualSeamIntent`) move to the checkout lane, or the producer runs them itself (R-5).
4. Every red is fixed. Issues recorded on 16 Oct: the load-dependent flakes in `astridAcpBridge.test.ts`, `PublicAstridSite.lifecycle` and `AgentChat.projectContract`, and `shotCompositionRuntime.test.ts`, whose handshake fixture no longer matches the product connector role.
5. Stub-bridge and real-bridge tests are separated. `bridge-latency.yml`'s expected red is gone.

### C1: three producers, checked by digest
`2.5 d · normal · in: UA, UR, UP · out: C#manifest`
**Done when:**
1. **Runtime** `contract/manifest.json` has a version and digests for the openapi, the schemas, **the one named canonical TS client**, the Python client, the visual fixture and the conformance YAML. The placeholder digests in `component-manifest.json` are real. The conformance YAML's PATCH step matches what the actor does. Runtime CI runs `generate.py --check`.
2. **Astrid** publishes a manifest by script (with `--check`) of its CLI command and flag surface, the editor/elements catalog, and the `astrid-browser` sources the App vendors. An App test asserts every `astrid-tools …` command in the ACP prompt exists in it. That keeps B2 fixed.
3. **Timeline packages:** Astrid and the App check the effective schema and composition artifacts by digest, including the transitive 0.0.1 in Astrid's Remotion lock.
4. Astrid and the App vendor by one script each and record the manifest versions. The hand-copied hashes are deleted. The App's `generated.ts` is regenerated (B6).
5. A planted one-byte change fails each consumer.

### C2: fakes verified by real-daemon fixtures, and the relay route table
`2 d · xhard: every unit test that uses a fake trusts it · in: C1 · out: C#fake`
**Done when:**
1. The existing real-daemon actor records response fixtures, digested in Runtime's manifest: the publish 409 body; task admission; task read; managed outputs; an events page that crosses a page boundary.
2. The App's zod parsers (`src/integrations/astrid/*Routes.ts`), the App's `isRuntimeConflict` and the Python fake each accept exactly those fixtures. Unsupported operations fail loudly.
3. **The paired relay's route table** is checked against every method, path and header the App's providers call (positive), and the forbidden routes are kept (negative). That keeps B1 fixed.
4. Other fakes move over when their file is next touched.

### F1: smoke, the real Astrid + Runtime contract
`2.5 d · normal · in: UA, UR · out: F#smoke`
**Already in `astrid dev journey`:** host start, renders, outdated-host replacement, survives a heavy job, PATH reuse, `kill -9` idle and mid-render with orphan reap, a Node preflight, recorded durations, generous hang ceilings, failures that show stdout and stderr.

**Done when:**
1. **Portable.** `--reference generated` builds a mini-realm (a few seconds of ffmpeg test media, one timeline) so the smoke runs on any Linux or macOS machine, including a cloud container. The real-film reference stays the release run. It runs from a disposable worktree of HEAD, never editing the shared checkout.
2. **The killed task is read back from the Runtime:** it carries `task.lease_expired`, it ends in one defined state, and a stale attempt's publication is rejected.
3. **New phase `runtime_restart`:** restart the Runtime under an idle host, then admit an excerpt render **through `POST /v1/tasks` in the App's request shape**, with no Astrid client open. It completes. That keeps B5 fixed.
4. The summary records the revision set: the Astrid HEAD, the imported `runtime_protocol` checkout and its HEAD, the App HEAD, and the manifest versions.
5. Preflight checks free disk against the Runtime's free-space floor (4 GiB) plus the expected render scratch, and refuses to start without that headroom.
6. Unit fixtures prove each outcome kind (success, failure, hung). The journey takes GATE item 5's scenario registry, so r4 cards can add scenarios.

### F2: full, all three products through the shipping topology (thin first)
**Related:** the App's same-machine direct path (hosted page → loopback gateway → local Runtime) has its own journey, `astrid-app/tests/e2e/local/direct-journey.spec.ts`, run by Plan A (`astrid-app/tasks/2026-10-16-plan-a-same-machine-direct.md`). F2's thin slice runs on that direct path; the cross-device relay variant (card F2-L1) comes after Plan B M0.

`4 d · xhard: the only test across all three · in: F1, C1, C2 · out: F#full`
**Built, thin slice on the direct path.** The I09 handoff case it started from (the App's paired release spec, deleted with the whole paired release gate) is gone: its assertions now live in cases 1 and 2 and the restart case of `astrid-app/tests/e2e/local/three-products.spec.ts`. The Astrid side is `astrid/core/dev/cross_client.py` (`identity`, `host`), and the shared helpers are in `astrid-app/tests/e2e/local/support/`. **Not** the paired release phases or `REAL_BRIDGE`: they drove the retired `astrid serve` and are deleted.

**Topology:** the hosted App build on its RuntimeDataProvider, through the loopback gateway, to a real Runtime on SQLite in a throwaway realm; the Astrid CLI is a second client of that Runtime (Plan A direct path). Each case first asserts that the App, Astrid and the Runtime share one realm, one instance and one contract. The relay variant (the paired relay and connector, `transport: relay`) runs the same cases after Plan B M0 (card F2-L1).

**Done when**, in order. *Status: 1-5 built (steps 3 and 4 are the one case `render R, publish R+1 before it runs`); 6 is full tier only and needs the network (Owned debt: F2 step 6 and launcher custody). Steps 3 and 4 run on Linux with Chrome and no Remotion: the host chooses `rendering.ffmpeg` for a task that names no renderer, and the host side is proved against a real Runtime by `tests/integrations/test_media_only_render_without_remotion.py`.*
1. **Agent → open App.** Astrid publishes a revision while the App is open, and the App shows it without a reload. One real task-activity event for that work is visible in the App.
2. **Concurrent edit.** Start an App edit and hold its save acknowledgement; publish an agent edit from the CLI; make another App edit, then release and retry. Both edits survive, or a named conflict keeps the draft intact. The retried save produces exactly one publication. Opaque fields and explicit clears are preserved. Both clients agree after a reload. This carries r4 IP3/IP4.
3. **Render that revision, adversarially.** Render accepted revision R through the App's render action (`renderRouter.enqueueAstridRuntimeRenderTimeline`). Publish R+1 before it executes. The task's `timeline_authority.parent_revision_id` equals R, and a frame or audio marker that distinguishes R from R+1 is R's.
4. **The render plays, and it is the film the App showed.** Through the relay, a seek returns 206 with `Content-Range`. Frames decode near the start, middle and end, and **match the App's preview of R at those times** within a perceptual threshold (r4 IP5). The decoded audio isn't silent. Playwright's Chromium must decode H.264/AAC; that is checked in preflight. If the App later gets an in-app player for renders, this step drives it; until then it reads the output through the relay.
5. **Runtime restart with the App open:** the App shows its relaunch notice, the draft survives, and it saves after the relaunch.
6. **Full tier only:** the Codex image → sprite step comes before step 1, as a separately reported product check. The thin slice uses existing film media.

Phase outcomes follow R-10.

### TIDY: fold or delete the other mechanisms, assertion by assertion
`1.5 d · normal · in: F1, F2 · out: T#one-gate`
**Done when:** each item below has every useful assertion mapped to its new home (a line per assertion, reviewed), and is then deleted:
- Astrid: stage1 cross-repo acceptance; `iteration_video_runtime_e2e`; the timeline eval harness; `smoke_*.sh`; `tests/proofs`; the VLM gate; the s1/m4/m7/m8 scripts, Makefile targets and `artifacts/`; `run_ci_checks.sh`; the cold-launch matrix;
- Runtime: `test_i06_composed_proof.py` and the cross-process activation join test (its checks have Runtime homes, see Owned debt);
- the App: `real-bridge-serve.mjs`, the paired `astrid serve` release gate (its verifier script, spec, validators, render worker and ship wiring), and the unpinned `bridge-latency.yml` with its script, seed and `make`/`npm` wiring (deleted; the SLO drop is owner-sanctioned, see Owned debt). The App's local-project gallery journey is kept by R-1 (see Owned debt).

**Deferred, not in this plan:** custody behaviour tests become PROCLIFE's acceptance tests when PROCLIFE lands (a reused pid is never signalled, no process is signalled twice, busy means a task in flight, the crash journal is reaped on start), and the custody broker's ~23k lines of tests go with it.

## Owned debt (outside the cards, recorded so it is never ambient)

- **Astrid structure: 14 distinct violations, now a shrink-only gate** (`scripts/reshape/baselines/structure_astrid.json`, checked in the default lane). A new violation fails; a fixed one must leave the baseline. Removing the rest needs design decisions, not test fixes:
  - 8 top-level `astrid/` modules and dirs outside the canonical packages;
  - `core/execution/generic_host.py` importing pack internals (6 sites);
  - 3 `sys.modules` registrations that `importlib` legitimately needs, where the rule allows no exemption.
- **Astrid ruff/mypy baselines were reset on 16 Oct** (ruff 1,469 → 2,294; mypy 956 → 2,152). The old CI never reached them, so they had drifted. They now only shrink: since B12 both gates are exact (`scripts/reshape/count_baseline.py`), so a lower count fails until the baseline is rewritten and deleted code cannot leave slack for a later regression. The import-cycle baseline was regenerated from 14 stale pairs to the 6 real ones.
  - *The exactness is total-only.* `verdict()` compares only `finding_count` (today ruff 2,203, mypy 1,943). The baselines also store `code_counts`, which `verdict()` never reads, so a new finding of one code offset by a fix of another passes with exit 0. Unlike the structure gate (a set of distinct violations), these gates cannot tell which finding is new. Unblock: `verdict()` compares `code_counts` per code and fails on any code that rose.
- **The smoke cannot run off macOS: one product blocker left (found 16 Oct while building F1; items 2 and 3 closed 20 Oct).**
  1. The Runtime launcher (`astrid_runtime up/down/restart`) needs Darwin audit-token custody (`astrid_runtime/custody_broker.py:899`). On Linux its process identity is also `ps-lstart:` while the daemon records `proc-start-ticks:`. A Linux custody provider is a security design decision; by owner decision (20 Oct) launcher custody stays Mac-only, so F1 and F2 step 6 stay owned debt.
  2. *Closed: Remotion is per task, not per capability.* `rendering.render` declares `requires_remotion: selected` (pack and capability matrix, which agree), so it is advertised ready without Remotion and the Remotion check is reported beside readiness (`gates: tasks that render with rendering.remotion`; the host's registration line and ready file list the fault). The renderer stays an explicit choice and `RenderService` is unchanged. At lease admission the host decides: a task that names `rendering.remotion` on a host that cannot run it fails with the Remotion reason and no child; a task that names no renderer renders with Remotion when the host can run it and with `rendering.ffmpeg` otherwise; any other explicit selector runs as given. The choice is recorded in the task result as `renderer_selection {selector, chosen_by, remotion_ok, remotion_reason}`. "Media-only" means only that `rendering.ffmpeg`'s own support check accepts the timeline; there is no second classifier, so a timeline ffmpeg refuses (a PNG hold, a crossfade) fails with ffmpeg's reasons plus the Remotion fault. That check is therefore the only thing between an App render and a wrong film, so it refuses what Remotion honours and ffmpeg never reads: an `app.astrid_render_clock` tail (the film would end at the authored extent), `metadata.source_window_*` (ffmpeg applies no window), and a resolved theme whose canvas differs from the canvas ffmpeg draws on (the timeline's `theme_overrides.visual.canvas`, else 1920x1080 at 30 fps; Remotion falls back to the theme named by the request's `rendering.remotion.theme_path`, else the built-in one). `support.py` `_unapplied_timeline_reasons` and `_theme_canvas_reasons`, one support test each in `tests/packs/rendering/test_ffmpeg_support.py`, and the render-tail case against a real Runtime in the integration test. Not covered, because neither renderer reads it from the timeline or the package that would is not installed here: `output.resolution`, and the theme's background colour behind a letterbox. Evidence: `tests/test_generic_host.py` (the selector cases), `tests/test_astrid_beta_capability_matrix.py`, and `tests/integrations/test_media_only_render_without_remotion.py` against a real Runtime at the vendored commit with no `ASTRID_REMOTION_PROJECT_DIR`, publishing the registry the way the App does (identity plus the object's `/v1/objects/<id>` route as `file`). That route is only accepted since Runtime 32b3a24 (it freezes the route, and refuses an absolute or foreign-origin URL as an unmanaged locator), so the App's `file` fix holds only against a Runtime from 32b3a24 on; the App and Astrid vendor locks used to pin 329c9c5, which predates it, and now pin b535646 (upstream main of 20 Oct, which includes it). `rendering.ffmpeg` now treats an empty visual track with default semantics as absent, which the Runtime's composed-occurrence projection always produces (`test_composed_occurrence_projection_renders_with_ffmpeg`).
  3. *Closed: the Linux census gaps were closed by upstream c2733366 (port the process-custody fixes onto the renamed tree), which landed after our 4b138220 and 020e45f7.* A descendant that is absent, has a reused pid or exits during `pidfd_open` now returns instead of raising (`custody_broker.py:3115-3141`; `UnadmittedCandidateAbsent` is Darwin only), and a leader that exits before ancestry capture is accepted when the census's zombie row carries exactly the birth bound at launch (`process_group.py:479-486`; `bind_launch` registers through `held_child_birth_identity`, `:240-250`). Evidence on Linux: `tests/core/execution/test_process_group.py` 61 passed and `test_custody_broker.py` 565 passed, including `test_linux_descendant_gone_before_registration_is_absent_not_a_violation`, `..._pid_reused_before_registration_is_absent`, `..._exiting_during_pidfd_bind_is_absent` and `test_instantly_exiting_launches_are_a_known_outcome_not_a_custody_error`; a stress run of `popen_owned_process` over `sh` exit/true chains, backgrounded short children, `node --version` and `ffmpeg -version` had 0 failures in 1,020 launches (180 sequential, 120 from 8 threads, 720 from 8 processes); a real `rendering.render` child launched through `popen_owned_group` settled succeeded 3 times.

  Until the launcher decision is made, F1 runs on the reference Mac. F2 steps 3 and 4 no longer wait for Remotion: on a machine with Remotion provisioned an omitted selector resolves to Remotion (`renderer_selection.chosen_by` host, selector `rendering.remotion`), which is the Mac behaviour and unchanged.
- **A render host without Remotion claims `rendering.render` tasks it cannot run, so the plan assumes one render host per realm.** Because `rendering.render` is advertised ready without Remotion, the host that claims a task decides at its lease: a task that names `rendering.remotion` fails there with the Remotion reason (`_renderer_selection` raising inside `fail_admission`, which settles `retryable=False`), and a task with no selector on a host without Remotion goes to `rendering.ffmpeg` and, when ffmpeg refuses the timeline, fails with ffmpeg's reasons plus the Remotion fault. On a realm with two render hosts, one with Remotion and one without, whichever claims first fails the task for good, where before this change the host without Remotion would never have claimed it. Owned debt, not fixed: the Runtime client has no call by which a host declines a lease it holds, and a `retryable` failure re-queues the task for any claimant, this host included, so making the refusal retryable would not route the task to the other host; no realm we run has a second render host. Release condition: the first realm with two render hosts, which needs a capability-level readiness split (advertise `rendering.render` only with the renderers a host can run) or a Runtime call to decline a lease.
- **Astrid's `integration` tests that start the Runtime's own main are red, and were before the vendor-lock bump (found 20 Oct, not fixed here).** `pytest tests/integrations -m integration` on Runtime main: 57 failed and 10 errors, mostly `RuntimeDaemon.__init__() got an unexpected keyword argument 'production_worker_credentials'` (the switch was removed upstream in Runtime 8c9b77d: every daemon now provisions the scoped worker credential, bound to the actor `astrid-pack-host`), plus tests of the retired `astrid/packs/generation` executors, `upload_object` calls without the fence arguments, and a Linux sandbox probe. The tests that pin the vendored commit (`tests/journeys`, `test_media_only_render_without_remotion.py`) passed at 29d0954, not yet re-run at the merged lock b535646, once their host registers as `astrid-pack-host`. Owner: Astrid; release condition: each of those files moved to `tests/helpers/runtime.py`'s worker credential or deleted by TIDY.
- **F2 step 6 and launcher custody stay owned debt (steps 3 and 4 are built).** Steps 3 (render R, publish R+1 before it runs) and 4 (the render plays and matches the App's preview) are in the journey in `astrid-app/tests/e2e/local/three-products.spec.ts` (Chrome channel: the bundled Chromium has no H.264 or AAC), driving `renderRouter.enqueueAstridRuntimeRenderTimeline` with no selector for an ordinary timeline; the `f2.marker` colour gives step 3 a frame marker that tells R from R+1, and the host side is proved by `tests/integrations/test_media_only_render_without_remotion.py` (R+1 published before `run_once`, `parent_revision_id` equal to R, R's frame colour, H.264 plus AAC, audible audio, `renderer_selection` ffmpeg chosen by host; a task that names `rendering.remotion` is admitted and fails with the Remotion reason; a timeline ffmpeg refuses fails with ffmpeg's reasons plus the Remotion fault). The old `test_preview_matches_render_frame` stub is removed with its home recorded in `tests/removed.yaml`. Step 6 (Codex image → sprite) is full tier only and needs the network (R-2 `live`); it is released by the full-tier journey (F2-L2) on a machine with network access. Launcher custody on Linux is a security decision (owner decision 20 Oct: Mac-only). None of these is a `test.fail` or `test.fixme` stub.
- **C1.3, the timeline packages:** schema and composition are produced outside these three repos (banodoco/timeline-composition and friends), so digest checks need a manifest there. Versions still differ (Astrid's Python pin, 0.0.1 transitively in Astrid's Remotion lock, the App's vendored 0.0.2; composition 0.0.6 vs 0.0.2). Alignment stays with r4 PINS.
- **TIDY items kept by R-1, with the tests that would release them:**
  - Astrid smoke scripts: `smoke_wheel_install.sh` is the home for installed resources, the vendored client, wheel identity, both adversaries and workspace cleanup. It reads its expected values from the checkout and the installed registry, `make wheel` runs it, and CI's `release` job runs it (`--wheel/--venv`) against the wheel it built and installed.
  - Astrid timeline eval harness, `tests/proofs` and `scripts/proofs` (deleted in B5, with the fresh-clone and runpod-extra smoke scripts; the CI `unit` job and `make editable` already install the dev extras). The agent-benchmark harness needed `.otto/runs` artifacts that are not in git and never claimed a run, and the proofs read a sibling intro build; neither asserted product behaviour that runs anywhere. Three product assertions got live homes first: the pack-host handoff (the registered host binds the worker credential, actor, instance, epoch and schema; a wrong actor or scopes is refused) in `tests/sdk/test_host_bootstrap_source_identity.py`; a music bed plus visible title passing managed-render validation in `tests/packs/rendering/test_managed_timeline_render.py`; and the `astrid/version.py` fallback to the `pyproject.toml` version when no `astrid` distribution metadata is installed (`python -m astrid --help` and `import astrid.sdk` still work; a missing or empty version raises) in `tests/test_version_reporting.py`. `tests/test_timeline_group_move_a03.py` keeps its `move_occurrence_group` half. The `ASTRID_TIMELINE_EVAL_*` variables stay, because F2 sets them.
  - App pre-push, checkout lane and debug output (B14). The git hook now runs `scripts/check-before-push` (which also runs the build-context guard), and the `make prepush` target is gone. `scriptedReplay.test.ts` reads the committed Light study script instead of `../../runs`, so it left the checkout lane and runs in the default run. `astridSceneAuthoring.test.ts` stays in the checkout lane: it is the only runner of Astrid's `tests/packs/rendering/test_live_scene_authoring.test.ts` (60 passing tests that import the App's editor SDK, and Astrid has no JS runner), so deleting it would drop them from every run. It is released by a JS runner on the Astrid side or by moving that test into the App. `console.log` evidence output was removed from four App test files (two Vitest, two Playwright).
  - Runtime's cross-process activation join test (deleted in B6). Its five checks now have Runtime homes at the Runtime boundary with synthetic owned processes: successor finalization and lost-ACK replay in `tests/test_local_execution_claim_fence.py`; record-before-EOF-ACK ordering, lost final ACK fencing the credential, exact replay and conflict without republishing, and a changed generation fenced with no record in `tests/test_local_worker_placement.py`. The one check with no live home is the real cross-repo one: an actual Astrid GenericHost receiving Runtime relay frames in a subprocess. Its right home is an Astrid integration test that drives a real Runtime relay (R-5), not yet written.
  - App `scripts/acceptance/verify-local-project-gallery.{mjs,test.mjs}` (`npm run test:acceptance:local-project{,:matrix,:unit}`, `docs/acceptance/local-project-gallery.md`): the local-project gallery journey, which reads loopback Astrid bridge data for local projects. It stays because four assertions have no live home. It is retired by the release owner once each has a test, in this order:
    1. gallery generation IDs match the bridge's, and the gallery page size is 45: a vitest case on the local gallery data lane (`src/tools/video-editor/data-kinds/useDataLanes.test.tsx` or the gallery hook's own test) fed from the C2 recorded responses;
    2. the lightbox `Variants (N)` count equals the generation detail's variant count, with detail requests scoped to the opened generation: a `LocalTimelineShotBrowser.test.tsx` case, plus a request-scope check in the same test;
    3. the local-disabled editor note ("Local Astrid timeline: generation and cloud-only actions are disabled", `GenerationSection.tsx:108`) and its locked controls: a component test of `GenerationSection` in local mode;
    4. strict zero diagnostics (no page error, console error, HTTP failure or failed request apart from the capability sentinel probes) over the gallery path: an assertion in the direct journey (`tests/e2e/local/direct-journey.spec.ts`), where the repo's other pageerror captures do not fail on console or HTTP errors.
    Until then the journey is untracked-by-CI debt: nothing runs it in CI, and it needs a loopback Astrid bridge that the Plan A gateway replaced. Open owner decision: either write the four tests or accept the loss and delete the journey.
- **Dropped with no home, owner-sanctioned: the bridge-latency SLOs.** `scripts/bridge-latency-report.mjs`, its seed and `check:bridge-latency` / `make bridge-latency-check` asserted a 500 ms p95 for bridge GETs, a 500 ms save, and a 10 s deadline for the seeded project, against `astrid serve`. They were deleted in B4 with no replacement: the bridge is retired and the Plan A gateway has no latency budget. R-10 also says durations never fail a run. If the owner wants a latency budget on the direct path, it is a new card, not a restoration.
- **Skip-forever rendering tests, B7.** The 28 `@pytest.mark.skip` tests of retired planner, shorthand and alias designs in `tests/core/rendering/test_{service,provenance,registry}.py` and `tests/packs/test_renderer_parity.py` are deleted, one `removed.yaml` line each, together with the four planner-test helpers and the raw-fixture path constant that only they used. No module under `tests/packs/rendering/test_timeline_visualize_*.py` skips any more: layout, emit, model and pack run on the runtime snapshot loader (`snapshot_from_runtime`), and the filesystem snapshot loader is gone. The skip gate `pytest -rs tests/core/rendering tests/packs | grep -c 'SKIPPED.*retired\|superseded'` is 0.
  - Assertions moved, not dropped: the relation, refresh-root, focus-timestamp and one-recovery-action-per-unavailable-state checks live in `test_timeline_visualize_emit.py` (`test_desert_slice_relations_and_refresh_focus_actions`, `test_desert_slice_one_recovery_action_per_unavailable_state`, `test_runtime_admitted_asset_keeps_inspect_original_available`, which also keeps the missing versus unsupported distinction). Model and pack tests keep their desert, scope, transition, metric-definition and self-containment checks; the old project-root media classification became runtime admission. Only the stale-sidecar diagnostic (a retired input) and the filesystem-root media tests are gone (`removed.yaml`).
  - Porting the two files exposed three product drifts, fixed with them (R-13): the evidence-pack manifest omitted `optional_formats.svg`, which its own closed schema requires (it now writes a null path and the reason that SVG was removed); the metric-definitions artifact had no entry for the ground-truth key `authored_all_track_composition` (two definitions added); and a model test read `executors/` instead of `actions/`.
  - The same gate also caught 30 `tests/packs/builtin/dataset_build` tests that skipped forever with "retired builtin-training ... not shipped", because upstream deleted `docs/megaplan/epics/builtin-training/`. The nine contract fixtures were restored from git history into `tests/fixtures/dataset_build/`, and `test_config_parsing.py` now runs (23 pass; the six model-backed preflight cases needed `budgets.delegation.max_derived_bytes`, which the product now requires). `test_contract_foundation.py` validates the packaged schemas directly. Four tests that compared the packaged copy with the deleted frozen docs, or pinned the wording of a deleted migration doc, are gone (`removed.yaml`).
  - `tests/fixtures/timeline_visualize/` lost every directory that only skipped or deleted tests read: `golden/`, `park24_media/`, `park24_slice/`, `storyboard_fal/`, `adversarial/`, `unified_inspector.json` and `fixture_matrix.json` (its only reader, `test_timeline_fixture_manifest.py`, went in B5). `compositor_parity/`, `desert_slice/`, `desert_truth.json` and `negative/` stay: live tests read them.
  - `tests/editing_conformance/test_platform_safety_net.py::test_preview_matches_render_frame` stays for F2 step 4.
  - **Open owner decision: the PNG and SVG renderers.** The render test (11 tests, all module-skipped at HEAD) is deleted, so the pinned PNG and SVG goldens and the pixel-geometry checks no longer run. `render_png.py` is still used by the evidence-pack test, which now also asserts byte determinism and page size. `render_svg.py` has no caller in the product or in any test, and the evidence pack rejects SVG output. Both are still listed in `rendering/pack.yaml:644-646`. The owner decides: delete `render_svg.py` (and the `svg` entries in the manifest schema, the `svg` format and the pack.yaml lines), or restore pinned goldens for the renderers that stay.
- **Astrid orphan scripts, fixtures and root clutter, B8 (deleted).** The 2RP launch-video scripts, the actor-interleaving probe, the source-package closure check, the P7 evidence scanner (with its five tests, one `removed.yaml` line each), the notes folder at the repo root, the CPU-pack and event-hash fixtures, the m7 representative fixture, the legacy `tests/golden` fixtures (the `hype/` folder stays: two parity tests read it), the stage-one speech input artifacts, the 18 root report files with their shrink-only legacy-clutter list, the m7 and m5 megaplan plans, the three stale H3 candidate wheels (36 MB, owner decision: the committed `vibecomfy` hash no longer matched the pack pins) with their root dependency manifest and the `artifacts/` root entry, and the unused private test-runner dev dependency. The hygiene gate lost the list, the m7 allowlist, and the notes, receipts and findings root entries. The P7 forbidden-marker scan needed no home: `scripts/reshape/authority_lint.py` (`legacy_authorities`) already enforces the live Supabase and legacy-authority rule. The ruff and mypy baselines were unchanged by this batch.
- **Astrid history docs and the flock spike, B9 (deleted).** The dated QA waves and findings under the old testing-docs folder, the standalone-tools and default-packs plans with their evidence, the two megaplan completion notes, the contract and architecture notes for retired surfaces (supported platforms, monkeypatch contracts, the timeline release evidence, the flock-on-APFS spike and its three `removed.yaml` lines), the relocation map and its validator section in `tests/test_structure_contracts.py`, and the feature-ports plan. Retired references were edited out: `serve` left the product census set (it was a rejected legacy token), and the stale `.env` and `tests/agentic` citations were removed. No product assertion moved, because none of the deleted files asserted product behaviour.
- **Astrid capability catalog, B10 (in-repo packs only).** `scripts/gen_capability_index.py` lists only the executors, orchestrators and elements under `astrid/packs/`, and runs with `ASTRID_PACKS_PATH` unset and an empty `ASTRID_HOME` and pack-source state, so the committed catalog is the same on every machine. It writes the one copy the skills and the doc-refs gate read (`astrid/packs/_core/docs/references/capabilities.md`); the stale second copy in the core pack's old skill folder and the registry fallback to it are deleted, and the Hivemind section that only an installed external pack produced is gone (external packs stay discoverable live through `astrid skills` and `discover`). A default-lane test (`test_committed_catalog_is_fresh_for_the_in_repo_packs`) runs the real freshness check with an external pack on the path. No assertion moved: the gate had no default-lane check of the real file before.
- **Astrid test-system cleanup, B12.** One obvious way per job:
  - *Lanes and markers.* The only markers are the four lanes (`integration`, `darwin_native`, `live`, `opt_in`, registered in `tests/lanes.py`) and `timeout`. Every other marker either had no user or selected no lane, and is gone: the Remotion gate selects the parity file with `-m integration`, and the Remotion text-card render, which only runs with `RUN_RENDER_TESTS=1`, is `opt_in`. The unused project-seeding fixtures in `tests/conftest.py` are deleted.
  - *Skips on import (R-6).* `tests/lanes.py` fails any `importorskip` skip when `CI` is set or the run selects `integration` tests, and tests/test_lanes.py proves it. Declared dev dependencies (`banodoco_timeline_schema`, `jsonschema`, `aioquic`) are imported plainly. Tests that need the Runtime or VibeComfy from a second checkout are marked `integration`; a module that imports one at top level loads it with `require_module`, which fails in the integration lane and skips the module in the default lane (it deselects every test that needs it). Private-package import failures are subject to the same required-lane check; there is no exception list. Moved to the integration lane: the real-Runtime tests in `tests/integrations`, `tests/sdk/test_admission_recovery.py`, `tests/stage1/test_runtime_client_cutover.py`, the VibeComfy-backed tests, and the font-coverage and mutagen tests (`fontTools`, `brotli` and `mutagen` are not dev dependencies; declare them to run those in the default lane).
  - *Pack tests are collected.* The eight tests that sat inside `astrid/packs/{capture,discord_local,fal,seedance_local}/tests` and `rendering/renderers/remotion` never ran (`testpaths` is `tests`); they live in `tests/packs/<pack>/` now and pass.
  - *One journey plumbing file* (`tests/journeys/test_journey_plumbing.py`, from the V6 and F1 files; all 61 test functions kept) and one baseline mechanism for ruff, mypy and structure (rewritten down by this batch: ruff 2,288, mypy 2,105).
  - *Docstrings now say what is true:* the m5b regression file (green, not "expected to fail"), the platform safety net (a F2 step 4 skip, not "step 0"), and `scripts/reshape`. No test was deleted, so `removed.yaml` has no new line. Not renamed (the rename lands later): the `*_luna`, `*_d18`, `*_i08` and `test_pack_migration_m4_shells.py` file names.
- **Astrid real-Runtime fixture and locator, B13 (UA.3).** `tests/helpers/runtime.py` holds the one locator, `runtime_checkout()`: `ASTRID_RUNTIME_CHECKOUT`, else the `astrid-runtime` sibling of this checkout or of its main checkout. A missing Runtime fails in a lane that runs `integration` tests and skips the module elsewhere (R-6); `commit=` runs the Runtime as of one commit (`vendored_runtime_commit()` is the one the vendored client came from), and `use_runtime()` makes `runtime_protocol` importable. `tests/conftest.py` holds the one `real_runtime` fixture: it starts a daemon on a temp realm and stops it at teardown through `owned_process_groups`. The 16 files that started their own daemon, and the files that found the Runtime themselves (the parity gate, the setup-lifecycle test, the H3 harness), now use them. The six pasted `_RuntimeDaemon = RuntimeDaemon` wrappers, the per-file locators (`ASTRID_STAGE1_RUNTIME_CHECKOUT`, `ASTRID_RUNTIME_CANDIDATE`, sibling-name guesses, `git archive` copies) and the `afccb430` pins are gone. The H3 CPU harness (`tests/helpers/h3_cpu_runtime.py`) takes its Runtime from the locator but keeps its receiving-root layout for VibeComfy and the T9 profile (AT-12).
  - Deleted, one `removed.yaml` line each: `test_neutral_runtime_contains_canonical_domain_tables_and_constraints` (it read SQL files the Runtime no longer has and skipped everywhere; the tables are exercised by the shot and reference tests of `test_runtime_client_cutover.py`) and `test_runtime_timeline_create_read_version_and_cas` (it drove the retired `timelines.create` and `timelines.save` routes, which the Runtime now refuses with 410). The dead frozen-runtime scaffolding in `tests/packs/rendering/_helpers.py` (nothing called it since B7) went with them.
  - Not ported: tests that use `runtime_protocol` in-process without a daemon (`RuntimeService` and `RealmStore` in `tests/timeline`, `tests/v10` and `tests/core/execution`) still import it directly.
  - Integration failures recorded during the zip port, requiring verification and fixes under R-6: 24 tests in `test_generation_runtime_composition.py`, 14 in `test_generic_host_activation_acceptance.py`, 17 in `test_generic_host_external_provider.py`, one in `test_generic_host_runtime_control2.py`, `test_media_handoff_render_boundary`, the capability parity proof run, `test_e2_publication_contract_roundtrip`, both `test_runtime_publication_chain` daemon tests and `test_import_edit_capture_history_runs_as_runtime_tasks_and_settles_lineage` (stale pack paths and product drift, not the fixture; UA stays open on them).
- **Four packs have no egress policy (discord_local, h3_av, seedance_local, foley).** An enforcing policy needs each pack's real destinations from a live run, plus an allowance for the native children and loopback Runtime connections the hook refuses today (`generic_host.py:7413`, `network_policy._patch_native_descendants`).
- **Open after B8 (ask-owner):** `scripts/diagnostics/runtime_lifecycle_reproducer.py`; the runpod and H3 operator scripts; and the `docs/` and `docs/plans/` files that have no code reference. The `dev` extra still installs `banodoco-timeline-schema` from a GitHub archive in `banodoco/astrid-agent`, so a clean developer install still needs GitHub.
- **App `config/contracts/astrid-plan-a-c2.json`** still carries stale hand-pinned client digests (`generatedClientCompatibility`). Removing them changes a frozen contract digest, so it needs a coordinated bump. The vendor locks are now the real check.
- **Linux custody issues recorded during the port (product, PROCLIFE):**
  - a short-lived SDK-render descendant reaped between the census and `register()` raises at `custody_broker.py:3051`; Linux has no unadmitted-absent handling like Darwin's (`:2909`). The six render-parity tests in `test_conformance.py` cover this path;
  - `host_bootstrap.py:561` retires a host registered by another process with a numeric `os.killpg`, because no custody handle exists across processes.
- **The capability parity gate's proof run** is an integration-lane test. Its cpu and render proofs are now real-daemon tests in `test_runtime_client_cutover.py`; its local_generation and provider proofs need an OS network sandbox for the provider broker and a Runtime checkout on the path, so they do not pass in a plain Linux container.
- **The App's typecheck and lint are not in CI:** `tsc -p tsconfig.app.json` reports 36 errors and a repo-wide ESLint run reports 29 errors (measured on this branch; the count moves, so re-measure before baselining), none in files the F2 card touched. Each needs a shrink-only baseline or a burn-down before it can gate.
- **Astrid's recoverability gate** (`test_recoverability_conformance_zero_mode`) is red on upstream main: the 71d43e00 port to pack actions brought 230 bare raises and direct stderr writes. Converting them to the recoverable-error contract is product work, owned by the pack-actions port.
- **Six TCP provider actions declare no host-managed broker** (`test_every_tcp_provider_manifest_declares_an_enforceable_host_broker`). Adding a broker to `network_policy` is a security change, so the provider owner must fix the product policy before the gate passes; tests do not invent security policy.
- **Astrid has no scheduled lane: R-2's recorded nightly lane does not exist for Astrid.** Its only workflow, `.github/workflows/ci.yml`, runs on push, pull request and dispatch, with no `schedule`. `tests/lanes.py` names the nightly expression (`integration or darwin_native or live or opt_in`), but nothing runs it: the Runtime's `nightly.yml` (03:00 UTC) runs the Runtime's own `-m integration` with Astrid installed at `tests/astrid-agent.pin`, and the App's `direct-journey.yml` (03:17 UTC) runs Playwright, using the Astrid CLI from `main` but no Astrid pytest lane. (Read: those three files only; the Runtime's `ci.yml` and the App's other workflows were not.) Today (21 Oct) `-m integration` selects 764 tests (402 of them the D18 Runtime-realm proofs, which skipped silently in the default lane until 21 Oct and pass against Runtime b535646 with `ASTRID_D18_RUNTIME_SOURCE` set) with 4 collection errors ("no Runtime checkout") when no Runtime checkout is present, `-m opt_in` selects 27, and `-m live` selects 0. They run only when someone runs them, so R-6 cannot hold on them; the open integration failures recorded under B13 are in this lane. Unblock: a scheduled Astrid workflow that runs the `lanes.py` expression with a Runtime checkout on `ASTRID_RUNTIME_CHECKOUT` (and a macOS runner for `darwin_native`), failing on any red or collection error.
- **Fixed sleeps in tests (R-10).** Matching lines: Astrid `time.sleep(` 99 in 32 files (most in `tests/test_generic_host.py`, 16, and `tests/core/execution/test_task_scope.py`, 12); Runtime `time.sleep(` 33 in 12 files (most in `tests/test_astrid_activation_join.py`, 9); App `tests/e2e` `waitForTimeout(` 27 in 7 files (most in `timeline/support.ts`, 8) plus 2 `setTimeout(r` waits in `tests/e2e/local/support/`. A sleep before an assertion is a duration that can fail a run on a loaded machine, which R-10 forbids; a poll interval inside a wait-for-condition loop with a generous ceiling is fine. The lines are not yet classified. Unblock: classify each line, and replace every fixed wait with a wait on the condition (a polled deadline in Python, a locator or `expect.poll` wait in Playwright).
- **Hand-written fake Runtimes in Astrid (C2, R-4).** `git grep -nE 'class (Fake\w*Runtime|\w*RuntimeFake|Stub\w*Runtime)' -- tests` finds 13 class definitions in 11 Astrid files (including `FakeRuntimeClient` twice and `FakeRuntimeCLI`), and none in the Runtime. R-4 trusts a fake only for operations it reproduces from recorded real-daemon responses; a hand-written response drifts from the daemon without failing. C2.4 moves them only when their file is next touched, so the count has no floor. Unblock: move each to the C2 recorded-response fake or the `real_runtime` fixture, and add a default-lane check that fails on a new class matching that pattern.
- **No failure quarantine.** All required lanes must pass under R-6; unresolved product failures block completion.
- **Recorded on 21 Oct, after the rebase onto the big upstream push:**
  - The App's `tests/e2e/timeline/caption-render-export.spec.ts` is collected by no Playwright project on main (upstream keeps it "renderer-owned until its real Astrid task"), so it runs nowhere. Unblock: the Astrid render task it waits for, or a project that collects it.
  - Since c447c6f8 the browser loads only the production extension catalog, so real-browser edge auto-scroll and marker-versus-pinch arbitration have no browser case (marker-versus-pinch keeps its jsdom home in `mobile-interaction-conformance.test.tsx`); the first shipped extension that contributes a `timelineOverlay` brings the browser case back (`docs/extensions/performance-visual-budgets.md`). By owner decision (21 Oct) the dev Scene Phase Markers and transcript-lane extensions are deleted (App aa668359, 6,080 lines); the overlay, data-kind and lifecycle machinery they exercised is tested against inline test extensions; the cases whose only subject was the dev extensions are retired with R-1 rows in that commit.
  - *Closed 21 Oct:* the App's `check:contract-surface-map` was red on main because the rewritten README dropped the gate-to-surface table it reads; the table is back at the end of README (App 37ed8e88).
  - *Closed 21 Oct:* six Remotion frame-worker cases were red on Linux because the pinned `@remotion/renderer` launches Chrome through `setpriv --pdeathsig SIGKILL` there and the test's fake only accepted the bare executable; the fake now accepts exactly that launch prefix and still fails on a real double start. The Remotion tsconfig's `include` globs still name the old element directories.
  - *Decided 21 Oct (owner): keep the host's renderer choice.* When a task names no renderer, the host uses Remotion where it can run, else ffmpeg if ffmpeg accepts the whole timeline (33d7a045); a task that names a renderer gets exactly that one. This partly reverses the explicit-only rule of 026ffe18 (31 Aug, which also removed the hybrid planners), so tell its author. Per-segment mixing would be a new planner on the Runtime media handoff and is not planned.
  - Upstream 574e97f4 writes each clip's derived display name into the saved config on the first edit of any kind. The derivation ignores a persisted ordinal, UUID or asset id on read, so display stays right, but a source file's name is frozen into the config once saved.
  - *Closed 21 Oct:* `test_pinned_launcher_recovers_disposable_partial_state` skipped unless a path on one Mac existed. The harness now takes the launcher the venv installs (`--pinned-launcher`), and the two cases are `integration` and `darwin_native`: the recovery harness needs macOS paths and the source profile the installer writes, so they run on the reference Mac's heavy lane (37db9ad0).
  - *Closed 21 Oct:* three `AgentChat.projectContract` cases waited with Testing Library's 1 s default, which acts as a timing assertion under oversubscription. The file now sets a 10 s hang ceiling (App a7ba8296); the starvation did not reproduce on the day (24 of 24 runs at 8 parallel on 4 cores, before and after), so the change is the R-10 rule applied, not a reproduced fix. One pre-existing `setTimeout(…, 450)` in that file is counted in the fixed-sleep debt.


## Relation to r4

- **Replaced:** GREEN's suite-greening (by UA, UR, UP) and GATE's single-film gate (by F1 and F2).
- **Kept:** IP1 (preservation); IP3 and IP4, carried into F2.2; IP5 (preview = render parity), now F2.4's check; IP6 (SEC-1…5, reconnect, Range seek); REPLAYS.
- **Owned here:** the journey takes GATE item 5's scenario registry. UA owns GREEN's doc and manifest checks.
- **Pins:** PINS-ASTRID and PINS-APP still align the renderer closure; C1.3 proves it by digest.
- **To amend in r4's text:** `testing.md:25,29,32` and GATE items 1–3 (no journey per merge, "≤5 min", "not observed (deadline)").

## Order and checkpoints

```
wave 1:  LEAK   UA   UR   UP          (independent, in parallel)
wave 2:  C1 → C2      F1              (C1 needs the three greens; F1 needs UA, UR)
wave 3:  F2 → TIDY
```

**Checkpoint A** (end of wave 2):
- the three default runs are green in CI;
- a planted one-byte drift fails in each consumer;
- the portable smoke, with `runtime_restart` and the read-back of the killed task, passes in a clean container and is the R-11 merge check.

**Checkpoint B** (end of wave 3): `journey --tier full` passes on main against the real film, including F2.4's preview-parity check after a concurrent edit.

## How it is executed

The plan is executed in waves of agents. The shape matters more than the headcount.

**The referee is the test run, not a model.** A card's "Done when" is checked by running something: the suite, the planted drift, the journey. That is what lets cheap models do most of the work.

| Tier | Does |
|---|---|
| **Haiku** (most calls) | Run suites and group failures by signature; add markers and lanes; delete tests for removed designs with their `removed.yaml` line; write CI workflows and `check-before-push`; manifest and vendor scripts to a written spec; relay route-table entries; map old assertions to new homes. |
| **Sonnet** | Review every Haiku diff for weakened tests (a removed assertion, a widened tolerance, a new skip); fix genuinely red tests; implement C1, C2 and F1; take over any task Haiku fails twice. |
| **Opus** | Decisions made once and reused: the manifest format, the mini-realm, F2's topology; settle disputed "real bug or stale test?" calls; approve every deletion batch (UA.3, TIDY); the xhard cards. |

**Guard rails:**
- Each change lands as a small commit on a branch per repo, with the referee's result in the message.
- A change that makes a red test green by weakening it is rejected, whatever the tier.
- Every disposition (fixed, corrected, moved to its required lane, deleted) is one line in the card's PR, with its reason.
