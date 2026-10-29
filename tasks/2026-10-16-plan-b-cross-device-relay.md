# Plan B: cross-device through the relay (16 Oct 2026, revision 2)

**Goal.** A person connects the hosted Astrid App app to the Runtime on their computer once. After that it just works: across deploys, laptop sleep, Wi-Fi changes, Runtime restarts and app updates, with no re-pairing and no terminal commands. Big saves and big files work. We can ship the hosted app many times a day without breaking anyone's connection.

**Builds on Plan A** (`2026-10-16-plan-a-same-machine-direct.md`, revision 3). Plan A ships first: same machine plus the hosted domain, with the browser talking straight to the local gateway. Plan B reuses A's **origin prefix** (`src/integrations/runtime/connection.ts`; the relay is same-origin, so it uses the empty prefix and no App call site changes), its **panel and status pill** (connection states), its **journey harness** (`tests/e2e/local/`), and its **discovery re-read** (`currentRuntime()` in `scripts/runtime-discovery-proxy.mjs`). Two items moved here from Plan A: App-side safe retry with idempotency keys (A's F3) and continuing after a Runtime restart with drafts kept (A's D4).

**Revision 2** follows an independent overkill review. The first draft was overbuilt in mechanism (10.5–16.5 d) and underbuilt on the App side. This version reaches the same experience in about 5–6 days.

## 1. Where it stands (code evidence)

| Area | Today | Effect on people |
|---|---|---|
| Pairing state | In-memory maps in the relay (`config/vite/pairedRegistry.ts:57-60`) | Every deploy or relay restart un-pairs everyone |
| Lifetimes | Session and connector expire after 8 h (`pairedRegistry.ts:4-5`; cookie `Max-Age=28800`, `pairedRelay.ts:151`) | Re-pair at least every 8 hours |
| Pairing flow | The connector prints a fresh pairing URL on every hello (`scripts/astrid-local-connector.ts:136`) | A terminal step, repeatedly |
| Several browsers | A connector holds one `pairId`; a new pairing overwrites it (`pairedRegistry.ts:128`); only that pair's generation follows a reconnect (`:88-89`, `:142`) | Pairing a second browser or computer silently un-pairs the first at the next reconnect |
| Revoke | Revoking one browser deletes the connector (`pairedRegistry.ts:164`); the connector stops reconnecting (`connector:156`) | One "disconnect" breaks it for everyone until `--reset-pairing` in a terminal |
| Connector drop | Pending requests wait for the 30 s idle timeout, then 504 (`pairedRelay.ts:218`, `:276`) | 30 s freezes, then errors |
| App handling | Nothing in `src/` handles `paired_connector_unavailable` or `paired_request_timeout` | Every gap is a broken screen |
| Liveness | No heartbeat; fixed 1 s reconnect (`connector:156`) | Sleep and NAT drops go unnoticed |
| Runtime | Exits if the Runtime is down at start (`connector:85-94`); reads discovery once (`:49-50`) and the token only on socket open (`:125`); demands an exact scope set (`:79`) | Start order matters; a restart or a new scope breaks it |
| Limits | JSON 128 KiB, upload 64 MiB (`pairedRoutePolicy.ts:4-5`); the Runtime allows 64 MiB JSON (`server.py:30`) and 5 GiB objects (`cas.py:14`) | Big timeline saves and big videos fail |
| Throughput | Base64 inside JSON frames; no sender backpressure in any direction (`connector:120,148,202`; `pairedRelay.ts:200,242,295-301`) | Small calls stall behind media (probe: 1.7 ms idle, 75 ms median during a 60 MB download); connector memory peaked at 250 MB |
| ACP | `rpc` waits for a whole agent turn (`scripts/astrid-acp-bridge.ts:635-660`) | Long agent turns hit the 30 s idle timeout |

Probe numbers come from one loopback run of the real relay and connector against a fake Runtime (`scratchpad/relay-review/probe.mts`).

## 2. Design (minimal)

- **Pair once.** The cookie is an HMAC-signed ticket `{pair_id, connector_id, connector_verifier, realm, exp, kid}`, sliding 30 days (owner decision 2).
  - A returning connector already re-registers itself after a relay restart (`pairedRegistry.ts:73-82`), so verifying the ticket needs no database.
  - Revoking everything means rotating the connector's secret ("Forget all browsers", run locally), which invalidates every ticket at once.
  - Per-browser remote revoke waits for accounts (owner decision 1).
  - Pairings are tracked per browser, so a second browser no longer evicts the first.
  - Invitations are issued only while a connector is unpaired.
- **Invisible deploys.** On SIGTERM the relay closes connector sockets with code 1012 (service restart). The connector reconnects at once, with jitter. A browser request that arrives while its connector is between instances is parked for up to ~10 s. Parking is the only thing that covers `<img>`/`<video>` loads, which page code cannot retry. Hosting decides routing, so there is no app-level drain window.
- **The App rides out gaps.**
  - Retry reads, and retry writes with the same `Idempotency-Key` and `expected_version`; the Runtime already requires both.
  - Unsaved edits survive the gap.
  - A minimal status pill shows connected, reconnecting, computer offline, or "connect this computer".
  - Re-check on `visibilitychange`.
  - An old tab after a deploy gets a version check and a reload prompt; the route table only grows.
- **Fast and big.** Binary frames with a small header replace base64-in-JSON. Every sender waits on `bufferedAmount` (browser↔relay and relay↔connector, both ways). Media streams go over a second connector connection, so TCP keeps small calls fair, without a hand-built scheduler. The upload limit rises only after backpressure exists; the JSON limit can rise now.
- **Skew-proof connector.**
  - The relay keeps the App's route table; it deploys with the App, so it never skews.
  - The connector keeps a coarse guard: the service allowlist, path canonicalisation, the admin denylist and size limits.
  - It accepts a superset of the product scopes, with no admin or worker scopes.
  - It re-reads discovery and the token on refusal or 401, and waits for the Runtime instead of exiting.
  - It sends a `protocol` integer in hello; the relay has one "too old" state.
- **Distribution.** Astrid's local install (`astrid-agent/scripts/local_install.py`, which already sets up Node and the app copy) supervises the connector. The connector opens the pairing URL once, while unpaired. `astrid_runtime` is zero-dependency Python and cannot host a TS connector.

**Not now** (until there is evidence): credit-window multiplexing, an N-1/N-2 version matrix, the device-code flow, a device list with remote revoke, an offline edit queue, multi-replica routing. (Same-machine users do not need the relay: Plan A gives them a direct path.)

## 3. Proof (testing plan F2, rule R-10: durations reported, never judged)

One thin journey, `tests/e2e/paired/paired-journey.spec.ts`, runs on Linux:
- a production build served with the relay;
- the real connector;
- a real Runtime daemon on a throwaway SQLite realm, with `discovery.json` written by the harness;
- Chromium.

It is built from `probe.mts`'s fake Runtime plus one real-Runtime case. Every run prints direct and via-relay median and p95, MB/s and machine load. It also prints a reported, not judged, bandwidth-shaped run, to show the uplink cost for same-machine users. Only these fail a run:
- a hang;
- pairing persists across a relay restart and a connector restart;
- a second browser stays paired;
- a small call started during a 60 MB transfer finishes first;
- connector memory stays bounded with a stalled reader;
- byte counts and digests match for 5 MB and 60 MB objects;
- a Range read returns 206;
- a save over 128 KiB succeeds;
- a killed connector socket mid-save gives the named error, then the App retries with the same key, and exactly one publication results;
- a CAS 409 keeps the draft;
- a Runtime restart recovers without user action;
- an ACP turn longer than 30 s completes.

Today's failures go in as owned known failures and come out as each fix lands.

## 4. Phases

| Phase | Delivers | Size |
|---|---|---|
| M0 | Thin journey and measurement table; today's failures recorded | 0.5–1 d |
| M1 "pair once" | Signed-ticket cookie (30 d sliding), per-browser pairs, invitations only while unpaired; fail fast on connector close; heartbeat, 1012 goaway, parking; App retry with the same key and restart continuation (moved from Plan A); JSON limit 64 MiB; ACP rpc keepalive | ~2 d |
| M2 "fast and big" | Binary frames; `bufferedAmount` backpressure everywhere; second connection for media; then raise the upload limit; Range, digest and memory checks; `protocol` in hello | 1.5–2 d |
| M3 "skew" | Coarse connector guard; scope superset; reuse Plan A's discovery re-read; wait for the Runtime | ~0.5 d |
| M4 "install" | Local-install supervisor runs the connector and opens the pairing URL once | ~1 d |

## 5. Decisions for the owner

1. **Are hosted users signed in?** If so, bind a pairing to the account and require both the session and the pairing cookie. That is also the main safeguard below.
2. **The real stake is code execution.** A paired cookie drives an ACP agent whose tool calls are auto-approved and which can open terminals (`scripts/astrid-acp-bridge.ts:442-452`). A stolen 30-day cookie is code execution on the person's machine. Are 30-day cookies acceptable? Should ACP over the relay get its own extra gate?
3. **Stateless tickets**, where revoking is per connector, and per-browser remote revoke waits for accounts: acceptable?
4. **Where the connector runs:** Astrid's local-install supervisor (recommended), a compiled binary, or a Python port inside the Runtime?
5. **Settled by Plan A:** same-machine users take the direct path, so the uplink measurement only concerns cross-device use.

## Master checklist

- [ ] M0 journey harness, measurement table, known failures recorded
- [ ] M1 signed-ticket cookie, per-browser pairs, invitations only while unpaired
- [ ] M1 fail fast on connector close; heartbeat; 1012 goaway; parking
- [ ] M1 App retry with the same key and restart continuation (moved from Plan A); tab-resume check; old-tab reload prompt
- [ ] M1 JSON limit 64 MiB; ACP rpc keepalive
- [ ] M2 binary frames; backpressure in all directions; second connection for media
- [ ] M2 upload limit raised; Range, digest and memory checks green; `protocol` in hello
- [ ] M3 coarse guard; scope superset; re-read discovery and token; wait for the Runtime
- [ ] M4 local-install supervisor runs the connector
