# Plan A: same machine plus the hosted domain, zero-click (16 Oct 2026, revision 3)

**Goal (version 1).** Someone runs Astrid App on their computer and opens the hosted app in Chrome on that computer. It connects to their local Runtime by itself: nothing to paste, no link to click, and from the second visit on, no click at all. Projects, timelines, saves and media come straight from the computer; our servers only serve the app. If it can't connect, the page says why in one sentence, offers a one-line instruction to hand to an agent, and connects on its own as soon as Astrid App is running.

**Revision 3** adopts the design review's simplifications and the spec review's required changes (§7). Cards: `2026-10-16-plan-a-execution.md`. Plan B reuses this plan's origin prefix, panel, journey harness and discovery re-read, and takes over safe retry and restart continuation.

## 1. What works today

| Piece | State (evidence) |
|---|---|
| Runtime | No browser-facing layer: no CORS, no Origin or Host checks (`runtime_protocol/server.py:170-196`). Its port changes on every restart (`daemon.py:55`). The product token never expires (`server.py:242-255`), so the page must never hold it. |
| Gateway `scripts/astrid-loopback-gateway.ts` | Binds 127.0.0.1 (`:184`); exact Host (`:54`) and Origin, with a Referer fallback (`:72-78`); Private Network preflights; the App's route table; streams up to 5 GiB; keeps the token. **To change:** random port by default (`:182`), a capability in the path with an 8 h expiry (`:47-50`), discovery read once (`:160`). |
| Launcher `npm run dev:local` | Starts the gateway only when `ASTRID_APP_LOOPBACK_ORIGIN` or `--hosted-origin` is set (`dev-local-workspace.mjs:74`), on port 0 by default (`:92`), and **always attaches ACP** (`:380`). |
| App | Same-origin `/api/runtime` (`client.ts:33`) and `/api/astrid` (`bridgeSession.ts:22` and 6 more). 22 `new AstridRuntimeClient()` sites pass no base. Two mode checks compare against `RUNTIME_BASE_URL` (`useActiveTaskClips.ts:157`, `useFinalVideoAvailable.ts:272`). A failed boot probe redirects home (`Layout.tsx:117-129`). Workspace mode and the Runtime identity are compiled in by the launcher (`dev-local-workspace.mjs:304`). Compose (`imageGeneration.ts:27`) and element admissions (`admitted-elements.ts:61`) are local-Vite routes. |
| Journey (A0, built) | `tests/e2e/local/direct-journey.spec.ts`, 29 cases: a production build on a hosted-style HTTPS origin, the real gateway, a real Runtime on SQLite, Chromium. **16 pass:** reads, saves, stale-save refusal, media, Range, 60 MB and 200 MB transfers, Runtime restart, gateway stop and start, the security group. **13 are `test.fail`:** 8 App cases, 4 `/v1/connect` cases, the gateway's re-read. |
| Speed (A0, reported) | Gateway against the Runtime directly: small calls about 1.7x; a 60 MB download at 78 against 102 MB/s; a 200 MB upload at parity. Gateway memory growth stayed under 100 MB. |
| Media (A0) | Chromium sends no Referer from https to `http://127.0.0.1`, so the fallback never fires. A plain `<img>` fails; `crossorigin="anonymous"` loads. About 19 files set `crossOrigin`, against 170 `<img>`/`<video>` elements. |
| Local-network permission | Harness Chromium 141: the name is `local-network-access`; `navigator.permissions.query` gives `prompt`, `granted` or `denied`, and CDP can set each (checked 16 Oct). Chrome stable: A0.7. |
| CSP | The repo sets none. The host might: A0.6. A `srcdoc` iframe inherits the page's CSP, so a host CSP must also allow the live-scene iframe's inline script. |

## 2. Design

- **F1. One origin prefix.** `src/integrations/runtime/connection.ts` holds one origin, resolved once at boot: `''` (same-origin: local dev, and Plan B's relay) or `http://127.0.0.1:17340` (the hosted build). `AstridRuntimeClient`, the media helpers and the Astrid base read it lazily at request time, so the 22 no-base sites stay untouched. `RUNTIME_BASE_URL`, `LOCAL_BRIDGE_BASE_URL` and `BRIDGE_PROBE_BASE_URL` are deleted; the two comparisons become `isRuntimeMode()`; a lint rule bans the literals.
- **D1. The gateway at the same paths.** `/api/runtime/*` and `/api/astrid/*` on `127.0.0.1:17340`, with no capability, no expiry and no `/v1/connect`. It accepts the exact hosted Origin and Host `127.0.0.1:17340` only. The App probes with the existing health and handshake: a network error means nothing answers; a 503 means the gateway is up and the Runtime is not.
- **D2. A stable gateway.** It re-reads discovery and the token per request with the existing `currentRuntime()` (`scripts/runtime-discovery-proxy.mjs:40`), re-verifies the identity when either changes, answers 503 while the Runtime is down, and refuses a changed realm. A taken port gives a message naming the realm that holds it. ACP is off unless `--acp` is given. Compose and admissions are not served.
- **D3. Boot gate and panel.** The hosted build first calls `navigator.permissions.query({name: 'local-network-access'})`. If it is **granted** (every returning visit), it probes at once. If it is **prompt**, it sends nothing and shows the first-time panel: a two-line explainer and a **Connect** button that triggers Chrome's prompt. If it is **denied**, it shows "browser blocked". The panel has three states, each with one sentence and **Copy instructions for your agent**:

  | State | When | Says |
  |---|---|---|
  | Can't reach Astrid App | nothing answers | first time: **Set up Astrid App on this computer** plus "Already installed? Start it"; returning (a flag on this origin): **Astrid App isn't running** |
  | Browser blocked | permission denied | how to allow local network access for this site |
  | Running but not ready | 503 | its reason: starting, Runtime stopped, realm changed |

  While the permission is granted, the App re-checks every few seconds and on focus, and connects with no reload. No Runtime query runs before it is connected. A pill shows the state and the realm's display name. A Runtime restart shows the existing restart message (`client.ts:70`) with **Reload**; drafts survive it in IndexedDB.
- **D4. Media.** `mediaCrossOrigin(url)` returns `'anonymous'` only for gateway URLs; other media is unchanged. The Referer fallback goes once nothing needs it.
- **D5. The hosted build.** `npm run build:hosted`: workspace mode, the gateway origin, no Runtime identity compiled in (the first healthy session binds, `client.ts:64-72`). Compose and admissions are disabled there, with one line saying they need the local app.
- **D5a. Pack front-end features.** Two kinds, and they behave differently on the hosted build:

  | Kind | Example | How its code reaches the browser | Hosted build |
  |---|---|---|---|
  | First-party pack UI | the transcript lane, Three.js Live Editor | compiled into the App from the vendored Astrid source (`@astrid` → `vendor/astrid-browser`, `config/vite/astridSource.ts:136`); a live scene's own bundle is a Runtime project object, run in a sandboxed `srcdoc` iframe with `connect-src 'none'` (`ui/live-scenes/runtime.ts:199`) | **works**, once the hosted site serves `/runtime-config/v1/extensions.json` with the extension host on (`extensionReleaseControls.ts:4,187`; missing means every extension is off). Its data comes through the gateway like any other read. Export is the Runtime's (`renderers/threejs/run.py`), so the page's origin does not matter. |
  | Project packs (elements an agent authors per project) | a custom effect or transition | compiled on demand by the local Vite dev server (`virtual:astrid-element-admissions`, `config/vite/astridElementAdmissions.ts:150-175`), DEV only (`admitted-elements.ts:38,60`) | **off in version 1** (decision 5). A static page has no compiler. Enabling them means the Runtime serves a verified, prebuilt element bundle that the page runs in a sandboxed iframe like live scenes, not `import()` into the trusted origin. That is a design of its own, after Plan A. |

  The first-party UI is fixed when the hosted page is deployed, while the local Astrid can be newer or older. A live-scene package the bundled validator does not know is refused at `SceneSurface.tsx:124`, which is safe but needs a clear message; card A3.E checks the happy path and the missing-config path.
- **D6. One command.** `npm run dev:local` starts the gateway by default for the production origin (`ASTRID_APP_LOOPBACK_ORIGIN=off` opts out) on 17340 and prints "Open <origin>"; Astrid's `local_install.py` prints the same.

**Version 1 assumes** one OS user per machine, and Chrome.

## 3. Security model

**What zero-click trusts.**
- Any page from the hosted origin can use the local Runtime's product routes (projects, timelines, objects, tasks) without a secret. The hosted origin is the trust root: an XSS there reaches local projects.
- Any local process can forge `Origin`. A process of the same OS user can already read the product credential, so it gains nothing. Another OS user gains access, and could take port 17340 first; version 1 assumes one user, and the pill names the realm.
- ACP, whose tool calls are auto-approved and which can open terminals, is off on this path unless a developer passes `--acp`.

**What protects it.**

| Guard | Defeats |
|---|---|
| Bind 127.0.0.1 only | other machines |
| Exact Origin, checked before routing; no Referer fallback once media sends Origin | other websites (a browser cannot forge Origin) |
| Host exactly `127.0.0.1:17340` | DNS rebinding |
| Route allowlist on canonical paths: no admin, worker, credential, doctor, backup, realm, compose or ACP | reaching past the product |
| Authorization and Cookie refused; the token stays in the gateway | a page holding a credential |
| Identity re-verified on any upstream change; a changed realm refused | a swapped Runtime |
| Chrome's permission, asked only after Connect | silent first contact |
| Size limits, idle timeouts | exhaustion |

## 4. Testing layers

| Layer | Proves | Runs |
|---|---|---|
| Unit | Gateway rules, prefix, connection states, permission handling, panel per state, media helper, launcher | `npm test`, every push |
| Journey | The hosted build, real gateway, real Runtime, Chromium; 33 cases after W0 | `npm run test:e2e:direct`; CI on PRs touching the gateway, launcher, runtime integration or media helpers, and nightly |
| Known-failure gate | Each `test.fail` is owned and expiring; the journey's budget falls to 0 | inside `npm test` |
| Manual Chrome checklist | The real prompt, domain and CSP | once, at the end |
| Live diagnostics | The panel names the failing step | every visit |

Durations are reported, never judged (R-10).

## 5. Phases

| Phase | Delivers | Size |
|---|---|---|
| A0 | Harness and 29 cases (done). W0: known-failure budget, CI lane, pre-push reminder, CSP check, Chrome permission check, 4 new cases | done + 1.3 d |
| A1 | Gateway at the same paths on 17340, ACP off, re-read and wait; the prefix, old constants deleted, lint ban; the hosted build | 1.7 d |
| A2 | Boot gate and states; panel, pill, Reload; compose and admissions disabled on the hosted build | 1.25 d |
| A3 | Media helper applied, Referer fallback removed; launcher default and `local_install.py`; Chrome checklist; sub-docs | 1.15 d |

About 5.4 focused days of cards, about 3 days elapsed with the waves in parallel.

## 6. Decisions for the owner

1. **First visit.** RECOMMENDED: probe automatically only when the permission is already granted; otherwise show the first-time panel and Connect. Probing on load would prompt every first-time visitor, including people who never installed Astrid App, and a refusal sticks.
2. **The hosted origin.** Which production URL serves the workspace build? RECOMMENDED: the gateway accepts that one origin; staging comes later via `--hosted-origin`. Check who uses the URL today, since the build it serves changes.
3. **Media.** RECOMMENDED: the `mediaCrossOrigin(url)` helper. Allowing GET without Origin for digest-addressed objects needs fewer edits, but lets any site test whether a known file is on the machine.
4. **Port 17340 and one OS user per machine** for version 1. RECOMMENDED: yes.
5. **Compose and element admissions** on the hosted domain. RECOMMENDED: disabled in version 1, with one clear line.
6. **Browsers.** RECOMMENDED: Chrome only for version 1; others each after a checklist pass.

Settled: zero-click (revision 2), and ACP off on the direct path.

**Recorded 16 Oct 2026:** the owner approved Plan A with every recommended answer above.
- **Decision 2:** the hosted origin is exactly `https://astrid.haus` (`www.astrid.haus` does not answer). It already serves this App's web build, from Railway. `/` keeps the existing entry flow: a first visit shows the landing page and a returning visitor goes straight into the app (`resolveReturningAppEntry`, `src/app/entryClassification.ts`). The hosted build remembers that preference once it first connects.
- **A0.6, checked 16 Oct:** the domain sends no Content-Security-Policy and no Permissions-Policy, so nothing blocks the local-network prompt or the live-scene `srcdoc` iframe. Re-check in A3.C after the hosted build is deployed.
- Still needed from the owner, if the Runtime repo is private: a read token for the CI lane (A0.3).

## 7. Changes from the reviews

**Design review, adopted in full:** F1 to one prefix; no `/v1/connect`, capability, expiry or `localhost`; `currentRuntime()`; F3 and D4 to Plan B; three panel states; and its six gaps (permission gate, media, ACP, compose and admissions, hosted build, single user) and citation fixes.

**Spec review, the 18 required changes:**

| # | Outcome |
|---|---|
| 1, 2, 6, 7, 8, 10, 14, 15, 16, 17 | Applied as written (A0.6 also checks Permissions-Policy) |
| 3 | Recounted per wave; the gateway-restart case goes to the state cards; the Runtime-restart case is rewritten to Reload; journey checks at the end of each wave |
| 4 | Gateway cards in sequence; media bases in one card; the `client.ts` pair gone with F3 and D4 |
| 5 | Settled by this revision (no capability), so no W0 step; CP2 is one diff review |
| 9 | Admissions disabled on the hosted build, the grep tightened, `src/test/**` excluded, `AstridTimelineEditor` dropped |
| 11 | The security rewrites happen in G1 (Sonnet), with a recorded mutation check |
| 12 | Fitted to three states (render test per state, focus and interval tests, explainer, screenshots); "different realm, switch" becomes the realm-changed message with Reload |
| 13 | The permission check is in W0 (A0.7); its harness half is done |
| 18 | The exposure sentence is §3; A0.5 is closed |

**Dropped with the design:** everything about `/v1/connect` (K5, its unit tests, "no secret in its body"), the different-realm switch, and the F3 and D4 cards. The capability cases are rewritten to the same-path rules in G1.
