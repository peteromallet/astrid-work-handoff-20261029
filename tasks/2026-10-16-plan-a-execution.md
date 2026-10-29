# Plan A execution spec: same machine, zero-click (16 Oct 2026, for revision 3)

**Design:** `2026-10-16-plan-a-same-machine-direct.md`, revision 3. **Conventions:** `astrid-agent/docs/development/testing-plan.md` ("Cards", "Order and checkpoints", "How it is executed"; R-1, R-2, R-6, R-10–R-13). **The referee is the test run.**

## 0. Shorthand and rules

| Shorthand | Means |
|---|---|
| `J "<title>"` | `npx playwright test -c playwright.direct.config.ts -g "<title>"` passes (it matches the full title, so a describe name selects its group) |
| `M = n` | `rg -c "test\.fail\(" tests/e2e/local/direct-journey.spec.ts` prints n, and that file's budget in `scripts/quality/check-known-failures.mjs` is n |
| `U <file>` / `N <file>` | `npx vitest run --config config/testing/vitest.config.ts <file>` / `node --test <file>` passes |

- **Tiers:** H Haiku, S Sonnet, O Opus. S reviews every H diff for weakened tests; S2 is a second Sonnet on an S card. A card that fails twice moves up a tier.
- A marker comes off in the commit that makes its case pass, and that commit lowers the budget (R-6). A test of a deliberately changed design is rewritten to the new behaviour (R-7), never weakened. A small defect rides with its test; a larger one becomes a known failure naming file:line (R-13). No duration assertions (R-10).
- The owner's decisions (design §6) are asked once, at the start of W0.

## 1. Cards

### W0: gates, checks, revision-3 cases

| ID | Card | Size · route · tier · in → out | Done when | Gate |
|---|---|---|---|---|
| A0.1 | Known-failure gate covers the journey: `MARKER_RE` also matches `test.fail(`; `tests/**/*.spec.ts` is scanned; `FILE_BUDGETS` holds `direct-journey.spec.ts: 13`; a count that differs from its budget fails. The `src` cap stays 10. **Merges first** (`npm test` runs the gate). | 0.25 · normal · H · — → checker, new `.test.mjs` | `N scripts/quality/check-known-failures.test.mjs`: a `.spec.ts` marker counts; above or below budget fails; expired and malformed fail. `npm run check:known-failures` passes with 13 journey entries. | S |
| A0.2 | Default Playwright config ignores `tests/e2e/local/` (`playwright.config.ts:82-87`). | 0.1 · normal · H | `npx playwright test --list \| grep -c tests/e2e/local` prints 0 | S |
| A0.3 | `.github/workflows/direct-journey.yml`: `pull_request` on `scripts/astrid-loopback-gateway*`, `scripts/runtime-discovery-proxy.mjs`, `scripts/dev-local-workspace*`, `src/integrations/runtime/**`, `src/shared/lib/media/**`, `tests/e2e/local/**`, `playwright.direct.config.ts`; nightly; `workflow_dispatch`. Checks out the Runtime as a sibling, builds its `.venv`, installs Chromium and ffmpeg, runs with the JSON reporter, uploads `direct-measurements.json`. No lane registry. | 0.25 · normal · S · A0.2 → workflow | This PR's run: `jq` shows exactly M tests with `expectedStatus: "failed"`, none unexpected, `stats.skipped == 0` (a skip means a missing harness, R-9). `workflow_dispatch` works once the file is on the default branch. | S2 |
| A0.4 | `scripts/check-before-push`: `runtime_pattern` adds the gateway, launcher, discovery-proxy and `tests/e2e/local/` paths; the reminder names `npm run test:e2e:direct`. A reminder, not a run: without a Runtime checkout the journey only skips. | 0.1 · normal · H | A staged gateway change prints the reminder; a docs-only change does not | S |
| A0.5 | Doc corrections and the exposure sentence | closed | Done in revision 3 (design §1, §3) | — |
| A0.6 | `curl -sI <production origin> \| grep -iE 'content-security-policy\|permissions-policy'` (the owner gives the URL if unknown); record it in the design's CSP row. If it would block `http://127.0.0.1:17340` or `local-network-access`, the owner fixes the host before W2. | 0.1 · normal · H | The row quotes the headers and the date | S |
| A0.7 | Chrome permission check in current Chrome stable (`channel: 'chrome'`); the harness half is in §6. Record the accepted name, the three states, whether a denied fetch looks like nothing listening, and whether `targetAddressSpace: 'loopback'` is needed. Deliver `src/integrations/runtime/localNetworkPermission.ts` (`granted`, `prompt`, `denied`; a throwing query counts as `prompt`). | 0.25 · hard · S | `U src/integrations/runtime/localNetworkPermission.test.ts` covers the three states and a throwing query; §6 filled | CP1 |
| A0.8 | Journey cases for revision 3: add N1–N4 as `test.fail` with comments naming their card. Rewrite `App: a Runtime restart on a new port continues with the draft kept` as `App: a Runtime restart on a new port shows the restart message, and Reload reconnects with the draft kept`, without the `restartGateway()` stand-in. In `opening the hosted origin connects to the local Runtime with nothing in the URL`, expect a `/api/runtime/v1/health` probe instead of `/v1/connect`, and the pill to read `Direct Journey`. Refresh the other comments. Budget to 17, with an exception note: new behaviour, not debt. | 0.25 · normal · S · A0.1 → spec | `npm run test:e2e:direct` lists 33: 16 pass, 17 fail as expected. `M = 17`. | S2 |

| New | Title | How |
|---|---|---|
| N1 | `a first visit without the local-network permission sends nothing to the gateway until Connect, then connects` | own context, no grant; no request to 17340 before the click; grant, click, connected |
| N2 | `a denied local-network permission shows that the browser blocked the connection, with how to allow it` | CDP `Browser.setPermission` with the context id (§6) |
| N3 | `with the gateway up and the Runtime stopped, the panel says Astrid App is running but not ready, then connects by itself` | stop the Runtime only, then start it |
| N4 | `App: the seeded image and video thumbnail render from the gateway` | non-zero natural sizes; audit shows the hosted Origin |

### W1: gateway lane and App lane

| ID | Card | Size · route · tier · in → out | Done when | Gate |
|---|---|---|---|---|
| A1.G1 | Same paths: delete the capability, expiry and `/session/`; serve `/api/runtime/*` and `/api/astrid/*`; Host stays exact (`:54`); move the Origin check (`:73-78`) ahead of the route 404 (`:72`); default port 17340 (0 only in tests); on `EADDRINUSE`, probe the holder and name its realm; refuse compose; print `{base, realm_id, acp}`, no `open_url`. **ACP:** the launcher passes `--acp-endpoint` only with `--acp` and defaults to 17340. In the same commit, rewrite the gateway cases (below), the harness base, and drop the capability asserts at `gateway.test.ts:38,51`. | 0.5 · hard · S · — → gateway, launcher, their tests, harness, spec | `U scripts/astrid-loopback-gateway.test.ts`: 200 on both prefixes for the origin; 403 for another origin, no Origin, Host `localhost:17340`, `[::1]:17340`, `127.0.0.1:17341`; an evil origin on an unlisted path gets 403; `/session/…`, compose and ACP without `--acp` get 404; the collision names the realm; no token in output or audit. `N scripts/dev-local-workspace.test.mjs`: no `--acp-endpoint` without `--acp`. J for the 4 probe cases; `J "security"`. `M = 13`. Commit records the mutation check: removing the Origin check, then the Host check, each turns `J "security"` red. | CP2 |
| A1.G2 | Export `currentRuntime()` from `runtime-discovery-proxy.mjs` and use it per request. On an endpoint or token change, re-run the identity check once for concurrent requests. 503 `realm_changed`, 503 on a malformed file, 503 `runtime_unavailable` with the Runtime down (still listening). Config errors exit 1. Never replay a streamed body. | 0.25 · hard · S (same agent) · G1 | `U scripts/astrid-loopback-gateway.test.ts`: a new port and a rotated token are followed; one identity check; each 503, then 200 on recovery; a POST is not retried. `J "the gateway keeps serving after the Runtime restarts on a new port"`. `M = 12`. | CP2 |
| CP1 | Opus writes `src/integrations/runtime/connection.ts` and its test (§3). In W0b. | O · — → module | `U src/integrations/runtime/connection.test.ts` | — |
| A1.O | `AstridRuntimeClient` with no `baseUrl` reads `runtimeApiBase()` per request; its session slot keys on the resolved base (`client.ts:211-255`). `bridgeMediaUrl` (`:6,19-54`) and `getDisplayUrl` (`mediaUrl.ts:2-57`) default lazily; a path is managed when it starts with the media base, and `VITE_API_TARGET_URL` applies only to unmanaged paths. `isRuntimeMode()` replaces `useActiveTaskClips.ts:157` and `useFinalVideoAvailable.ts:272`, one cache key either way. Delete the 3 constants and fix `bridgeSession.ts:5,22,35`, `useAstridBridgeDiscovery.ts:45,111`, `VideoEditorPage.tsx:85,192`, `doctorAvailability.ts:10,25`, `capabilityCensus.ts:3,185,259`, `useActiveTaskClips.ts:5`. | 0.5 · hard · S · CP1 | New tests: a client built before the origin is set calls the gateway; one slot per base; `isRuntimeMode()` true for the gateway base; a gateway case per media branch. Existing assertions unedited. `rg -n "RUNTIME_BASE_URL\|LOCAL_BRIDGE_BASE_URL\|BRIDGE_PROBE_BASE_URL" src` empty. `npm test` green. | CP1 |
| A1.B | Batch, read at call time: `integrations/astrid/transport.ts:112,153`, `integrations/astrid/nativeEditorConnection.ts:6`, `tools/video-editor/data/AstridBridgeDataProvider.ts:102`, `shared/lib/taskCreation/imageGeneration.ts:27`, `pages/PairingPage.tsx:40`; comments `AuthContext.tsx:15`, `Layout.tsx:118`. | 0.25 · normal · H · CP1 | `rg -n "/api/(astrid\|runtime)(/\|['\"\x60])" <those files>` empty; `npm test` green | S |
| A1.H | `npm run build:hosted`: `VITE_ASTRID_WORKSPACE_V1=1`, `VITE_RUNTIME_ORIGIN=http://127.0.0.1:17340`, no identity variables. The journey's global setup uses it and rebuilds when the dist came from another mode. | 0.1 · normal · H · CP1 → `package.json`, `global-setup.ts` | Build succeeds; `rg -l "127.0.0.1:17340" dist/assets` non-empty; CP1's identity guard test passes; previously passing cases still pass | S |
| A1.L | Lint ban on literals matching `^/api/(runtime\|astrid)(/\|$)` outside `connection.ts`, tests, `src/test/**`, `**/dev/**`; no allowlist entries. `/api/astrid-element-admissions` stays (A2.X). | 0.1 · normal · H · A1.O, A1.B | `npx eslint src` clean; a planted literal fails; A1.B's grep over `src` (same exclusions) matches only `connection.ts` | S |

After A1.G1, the describe `GET /v1/connect (gateway)` becomes `probe through the gateway (gateway)`, with `answers the configured origin at /api/runtime/v1/health with the realm and Runtime instance`, `refuses another origin`, `refuses a rebinding Host, including localhost` and `refuses a request without an Origin`. Three security titles change with the design: `a missing, wrong or truncated capability is refused` → `the old /session/ paths and paths outside /api/runtime and /api/astrid are refused`; `…refused on the session routes` → `…on the product routes`; `admin, worker, credential and unlisted routes are refused with the right capability and origin` → `admin, worker, credential, compose, ACP and unlisted routes are refused with the right origin`.

**Milestone W1:** `M = 12`; 21 cases pass; `npm test` and `npx eslint src` green; CP2 done.

### W2: boot gate, states, panel

| ID | Card | Size · route · tier · in → out | Done when | Gate |
|---|---|---|---|---|
| A2.S | Boot gate and state (design D3): a provider and `useRuntimeConnection()`, which throws without its provider; on the hosted build it replaces the redirect at `Layout.tsx:117-129` and drives the probe at `AuthContext.tsx:37`. Uses A0.7's helper and the permission's `onchange`. Re-checks every 3 s and on focus, only while granted. The "connected before" flag is wrapped in try/catch. Runtime queries wait for connected; their keys are invalidated on connect. Exposes the realm's display name. | 0.5 · hard · S · CP1, A0.7, A1.O, A1.H | Unit tests: granted → connected; network error → can't reach, first-time or returning; `prompt` fetches nothing until `connect()`; `denied` → blocked; 503 → not ready with reason; recovery by interval and by focus; throwing storage still renders; no Runtime query before connected; the hook throws outside its provider. | CP1 |
| CP3 | Opus writes `src/shared/components/RuntimeConnection/copy.ts` and fixes the mount (§3), alongside A2.S. | O | The journey's headings match it | — |
| A2.P | Panel, pill and Reload to CP3's copy: extend `WorkspaceConnectionRecovery` where it fits; `ui/badge.tsx`, `useCopyToClipboard`, semantic tokens, error-only toasts. Explainer and Connect, three states, Copy, pill with realm name, Reload on the restart message. Panel cases attach `panel-<state>.png`. **Its last commit closes W2:** run the lane, unmark every case that passes, lower the budget. | 0.5 · normal · H · A2.S, CP3 | Render test per state and wording. J for the 11 cases below. `M = 1`. | S, CP3 |
| A2.X | Hosted build: the compose controls fed by `imageGeneration.ts:27,64` (`useImageGenSubmit.ts`, `useImg2ImgMode.ts`) are disabled with CP3's line; `admitted-elements.ts:61` skips its refresh and keeps the compiled set. | 0.25 · normal · S · A1.B, CP3 | Unit tests: with the gateway origin, disabled, line shown, no request; same-origin unchanged | S2, CP3 |

The 11 W2 cases: `opening the hosted origin connects to the local Runtime with nothing in the URL`; `a reload stays connected`; `with the gateway stopped the panel offers agent instructions`; `a fresh profile shows`; N1; N2; N3; `App: open the seeded project, edit, save, reload byte-identical`; `App: a second writer saves first, the App shows the conflict and keeps the draft`; `App: a Runtime restart on a new port shows the restart message`; `App: a gateway restart reconnects by itself`. A case that needs a larger fix (for example, no conflict UI on this path) stays a known failure owned by A2.P, naming file:line.

**Milestone W2:** `M = 1`; CP3 approved the screenshots.

### W3: media, launcher, checklist, docs

| ID | Card | Size · route · tier · in → out | Done when | Gate |
|---|---|---|---|---|
| A3.M | `src/shared/lib/media/mediaCrossOrigin.ts` and test. Appends A3.MA's batch lists here: disjoint, at most 10 files each, from `rg -l "objectContentUrl\|bridgeMediaUrl\|getDisplayUrl" src --glob '!**/*.test.*'` (53 files). | 0.1 · normal · S · A1.O | `U src/shared/lib/media/mediaCrossOrigin.test.ts`: gateway URL → `'anonymous'`; same-origin, Supabase, CDN, `data:`, `blob:` → `undefined`; a non-gateway `<img>` renders without the attribute | S2 |
| A3.MA | `crossOrigin={mediaCrossOrigin(src)}` on each `<img>`, `<video>` and canvas source those helpers feed. The last batch unmarks N4 and deletes the budget entry. | 0.25 · normal · H, up to 3 batches in parallel · A3.M | Per batch: S re-runs its grep and checks each element; `npm test` green. Last: `J "App: the seeded image and video thumbnail render from the gateway"`; `M = 0`; no budget entry. | S |
| A3.R | Find gateway URLs in CSS `url()`, `poster=` (13 sites), `<source>` and `<link rel=preload>`: they cannot send Origin and get no Referer (A0), so convert each or list it. If none remain, delete the fallback (`astrid-loopback-gateway.ts:74-77`); retitle `an image element loads with crossorigin=anonymous (Origin), and without it only with an explicit referrer policy` to `…, and without it is refused`; in `browser credentials, a foreign Referer and the Private Network preflight`, a hosted Referer gets 403. Otherwise keep it and record why. | 0.1 · normal · S · A3.MA | `U scripts/astrid-loopback-gateway.test.ts`; `J "media"`; `J "security"` | CP4 |
| A3.L | `ASTRID_APP_LOOPBACK_ORIGIN` defaults to the production origin (decision 2), `off` opts out; print "Open <origin>" after the gateway's start line; delete the "session link" wording (`dev-local-workspace.mjs:386,435`). | 0.25 · normal · H · A1.G1 | `N scripts/dev-local-workspace.test.mjs`: default spawns the gateway on 17340 for production; `off` spawns none; `--check` spawns nothing; "Open" follows the start line. `rg -n "localRuntime\|session link" scripts` empty. | S |
| A3.I | Astrid `scripts/local_install.py`: the Open line beside `App:` (`:404`); pass `--hosted-origin`; `check_app` (`:402`) passes the opt-out. | 0.1 · normal · H · A3.L | `python -m pytest tests/test_local_install.py` in astrid-agent; `--check-only` binds nothing on 17340 | S |
| A3.E | Pack extensions on the hosted build. The harness serves `/runtime-config/v1/extensions.json` on the hosted origin with `extensionHostEnabled` and `transcriptCaptionFoundryEnabled` on (today it answers 404, `support/harness.ts:175`, so every bundled extension is closed in the journey). Seed one timeline with a transcript lane and one live-scene clip whose package is a Runtime project object. | 0.25 · normal · S · A2.S, A3.M | `J "extensions: the transcript lane renders its words from the gateway"`; `J "extensions: a live scene previews from a Runtime object in its sandboxed iframe"`; `J "extensions: with the config missing, the editor still loads and extensions are off"` | CP4 |
| A3.D | `docs/structure_detail/data_fetching.md` (prefix and states: Purpose, Source of Truth, Key Invariants) and `image_loading_system.md` (`mediaCrossOrigin`). No new `.md`. | 0.1 · normal · H · all | Cited paths resolve | CP4 |
| A3.C | Manual, once, Chrome, real domain: no prompt on load; Connect prompts once and Allow connects; reload and a new tab need no click; a site-settings block shows the blocked panel and its fix works; edit, save, reload; image, video play and seek; stop and start `dev:local` reconnects by itself; headers re-checked. | 0.25 · human · A3.MA, A3.L | One line per item in the PR | CP4 |

## 2. Waves

| Wave | Cards | Pattern | Concurrency |
|---|---|---|---|
| W0a | A0.1 | serial: H, S review, merge (it gates `npm test`) | 1 |
| W0b | A0.2, A0.3, A0.4, A0.6, A0.7, A0.8; CP1 | fan-out, disjoint files: implement, review, merge | 6 and 1 Opus |
| W1 | gateway: G1 → G2 (one Sonnet); App: A1.O ∥ A1.B ∥ A1.H → A1.L; CP2 after G2 | two pipelines; the App lane is a batch pipeline refereed by grep and `npm test` | 4, then 2 |
| W2 | A2.S ∥ CP3 → A2.P ∥ A2.X | spec, implement to spec, review, screenshots; journey checked at the end | 2, then 2 |
| W3 | A3.M → A3.MA (3 batches) → A3.R ∥ A3.L ∥ A3.E → A3.I ∥ A3.D; then A3.C, CP4 | fan-out of two lanes; A3.MA a batch pipeline | up to 5, then 1 |

**No parallel cards share a file.** In W1 the gateway lane owns the gateway, discovery proxy, launcher, harness, journey spec and budget; the App lane owns `src/**`, `package.json`, `global-setup.ts` and the eslint config. A2.S precedes A2.P on `Layout.tsx`; A3.R follows A3.MA on the journey spec.

## 3. Opus checkpoints

| CP | When | Does and checks |
|---|---|---|
| **CP1** base resolution, boot gate | W0b; approves A0.7, A1.O, A2.S | Writes `connection.ts`: `setRuntimeOrigin()` once at boot from `VITE_RUNTIME_ORIGIN`; `runtimeOrigin()`, `runtimeApiBase()`, `astridBase()`, `isGatewayUrl()`, `isRuntimeMode()`; a guard against a gateway origin with a compiled identity; the state type (`connecting`, `connected`, `cant_reach` with `firstTime`, `blocked`, `not_ready` with a reason, realm). A test pins the same-origin defaults. Checks: mode never comes from a base string; the default is read per request; the slot key; boot order (permission, probe, queries); nothing fetched in `prompt`. |
| **CP2** gateway security | after G2 | Reviews the G1+G2 diff against design §3, the guards one by one; each refusal beside a passing control; the mutation check recorded. |
| **CP3** panel copy and UX | W2: before A2.P, then after A2.P and A2.X | Writes `copy.ts`: one sentence per state, first-time and returning wording, explainer, Connect, the blocked fix, not-ready reasons, Reload, pill labels, agent instruction, compose line; mounts the gate in `Layout.tsx`. Reviews every `panel-<state>.png` from the lane run. |
| **CP4** sign-off | end of W3 | Full journey green with `M = 0`, no budget entry; `npm test` green; `rg -n "127\.0\.0\.1:17340" src --glob '!**/*.test.*'` matches only `connection.ts`; A3.R accepted; checklist recorded; docs updated; design §3 matches the code. |

## 4. Risks no card covers

| Risk | Containment |
|---|---|
| The Runtime repo is private; CI needs a read token | The owner adds it and confirms the repo path before A0.3 merges |
| Chrome renames or splits the permission | Unknown names count as `prompt`: worst case one extra click; CI's Chromium shows the change |
| Known failures expire 30 Oct | If W3 slips, the owner extends them in a commit with a reason |
| The production URL's current users get the workspace build | Owner decision 2, before A3.L |
| XSS on the hosted origin reaches local projects | Accepted by zero-click; CSP hardening after Plan A |

## 5. Master checklist

- [ ] Owner decisions 1–6 recorded (start of W0)
- [ ] A0.1 known-failure budget (merged first)
- [ ] A0.2 config ignore · A0.3 CI lane · A0.4 pre-push reminder · A0.6 headers · A0.7 permission helper
- [ ] A0.8 revision-3 cases; `M = 17`
- [ ] CP1 `connection.ts`
- [ ] A1.G1 same paths, 17340, ACP off · A1.G2 re-read and wait; `M = 12`
- [ ] A1.O prefix, constants deleted · A1.B literals · A1.H hosted build · A1.L lint ban
- [ ] CP2 · Milestone W1
- [ ] A2.S states · CP3 copy · A2.P panel, pill, Reload · A2.X compose and admissions; `M = 1`
- [ ] CP3 screenshots · Milestone W2
- [ ] A3.M helper · A3.MA batches; `M = 0` · A3.R Referer fallback
- [ ] A3.E pack extensions on the hosted build · A3.L launcher · A3.I `local_install.py` · A3.D docs · A3.C Chrome checklist
- [ ] CP4 sign-off

## 6. Findings (A0.7)

| Item | Harness Chromium 141.0.7390.37 (16 Oct) | Chrome stable |
|---|---|---|
| Name accepted by `navigator.permissions.query` | `local-network-access` (`local-network`, `loopback-network` throw) | pending A3.C (manual) |
| Fresh profile / after Playwright's grant | `prompt` / `granted` | pending A3.C (manual) |
| After CDP `Browser.setPermission` | `denied` with the context id; no effect without it | pending A3.C (manual) |
| Denied fetch versus nothing listening | Indistinguishable from script: both reject with `TypeError: Failed to fetch`, whether a gateway is listening or not. Only the console differs (denied: "blocked by CORS policy: Permission was denied for this request to access the `unknown` address space"; nothing listening: `net::ERR_CONNECTION_REFUSED`). So the gate must read the permission state, not infer it from a failed fetch. In `prompt`, a fetch to a listening gateway stays pending (headless never answers the prompt; 5 s race timed out) while a closed port still fails at once with `TypeError` | pending A3.C (manual) |
| `targetAddressSpace` needed | No. Granted: a fetch to the listening loopback gateway succeeds with or without `{targetAddressSpace: 'loopback'}` (the gateway answers the preflight with `Access-Control-Allow-Private-Network: true`). Denied and `prompt` outcomes are the same with and without it | pending A3.C (manual) |
