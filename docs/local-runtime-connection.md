# Connect the hosted app to Astrid on this computer

## Connection screens

| # | Situation | Signal | Screen |
|---|---|---|---|
| 1 | First visit, no local install | `prompt` → Connect → Allow → 2× `silent` | permission → pending → set_up |
| 2 | Installed, but this browser has not connected before (cleared data, private window, another browser) | as 1 | set_up. It says only that this browser hasn't found Astrid here yet, and shows the same installer line, which also starts an existing install. |
| 3 | Returning, Astrid stopped | `granted`, 2× `silent`, `connectedBefore` | not_running |
| 4 | Astrid starting | fewer than 2 failed readings | connecting → app. If slower, row 3 or row 1 until ready. |
| 5 | Launcher up, Runtime down | `down` | not_running, whatever the history |
| 6 | Permission not asked | `prompt` | permission |
| 7 | Chrome's prompt open | `prompt`, Connect probe in flight | pending |
| 8 | Prompt dismissed | still `prompt` | permission again |
| 9 | Permission denied | `denied`, nothing sent | blocked |
| 10 | Astrid started for another origin | 403 before CORS → `silent` | set_up or not_running; rerun the installer from the page's origin. |
| 11 | Another program on the local port | `silent` | set_up or not_running; the installer reports the conflict. |
| 12 | Realm or identity changed, before connecting | `restart` | restart_needed |
| 13 | Phone or tablet | `isMobileDevice()` | phone |
| 14 | Safari or Firefox | scenario not `chromium` | rows 1–5, no permission screens (G5) |
| 15 | Connected, Astrid stops | 2 failed health readings | stopped card. It clears itself when the same instance answers. |
| 16 | Connected, Astrid restarts | new `runtime_instance_id` | restarted card → Reload |
| 17 | Connected, the door's credential changes identity | 503 `runtime_identity_mismatch` | restarted card → Reload → row 12. Rare, and each step is true. |
| 18 | Timeline won't load | load error | loadFailed. It retries a few times when Astrid answers; Try again always works. |
| 19 | Connected, no projects | — | EmptyWorkspaceGuidance |

The page polls every three seconds and on focus. A `restart` signal shows immediately; otherwise it stays on
`connecting` until two readings in a row fail. Then it shows `not_running` if this browser connected before or any
probe gave a `down` reading, and `set_up` otherwise. Background checks do not change visible content until
the screen itself changes. Non-Chromium desktop browsers skip the Chrome permission step.

The `set_up`, `not_running`, and `restart_needed` screens show the same OS-specific
installer line for install, repair, or restart. `update_needed` shows the update
form of that line. The installer starts Astrid on this computer and opens
`https://astrid.haus/?connect=1`, which enters the hosted app and its Runtime
connection gate. Runtime credentials stay on this computer; the browser receives
no product token. See the [repository README](../README.md) only when developing
the app source locally.

For an existing installation, inspect its saved Runtime selection and source
profile before repair. Keep its support root, realm, profile and credential.
Do not infer the selected workspace from a checkout name or substitute an empty
default root. `astrid doctor --json` reports Astrid's resolved selection, and
`astrid-runtime workspace inspect --data-root <existing-root> --json` checks the
explicit installation. Preserve the installed named agent profile when repairing
its source configuration; the Runtime and agent own their services and credentials.

Verify `/api/runtime/v1/health`, realm identity, projects and timelines through
the Runtime's door using the configured hosted Origin. A connection can be
healthy while a workspace is empty; don't create demo records to hide a wrong
selection.

## Managed media requests

A successful object GET from a terminal does not prove that browser playback can
read it. The hosted page must send its exact Origin on native media requests,
and browser fetches must omit credentials. The Runtime's door acts with the
product credential on this computer; it rejects browser cookies and authorization. Keep its strict
Origin rule instead of adding credentialed CORS to work around a renderer bug.

The canonical rendering pack owns one managed-object URL recognizer and the
`ManagedImg`, `ManagedOffthreadVideo`, and `ManagedVideo` primitives. They apply
anonymous native CORS and credential-free decoder fetches only to managed object
routes on loopback origins or the same-origin proxy, preserving external and
signed URL options. Pack effects, image readiness, video readiness, and the App's
audio cache must reuse that boundary. Do not add request policy separately to
each effect. Refresh the browser source with
`scripts/astrid-landing/refresh-vendor.mjs` and verify its recorded provenance.

Regression coverage includes `ManagedMedia.hosted.test.tsx` (managed URLs,
encoded IDs, ports/hosts, native attributes, refs/readiness callbacks, decoder
and fallback options), `AudioAnalysisProvider.test.tsx` (credential-free cache
warming), and the Runtime's door conformance tests (astrid-runtime
`tests/test_door_transport.py`: Origin refusal and ranged byte responses). Browser QA must also cover a pack-owned animated image/video,
backward and forward seeking, and transition boundaries; ordinary seeded media
alone does not exercise pack-owned native requests. Inspect the browser's actual
request and console when an image fails, not only a server-side GET.

## Saved chat after the agent chat service restarts

An ACP connection ID belongs to one agent chat service process. If that service restarts,
the client retires a missing connection and retries the read-only saved
transcript load once with a fresh connection. This includes an older service's
specific `not_found` / `ACP connection is not available; reconnect` response;
an unknown saved session remains an error. Prompts are never automatically
resent by this recovery. Restored unconfirmed messages stay paused until the
user explicitly retries delivery after checking saved history.

`useAgentSession.test.tsx` covers both transcript-load and event-poll connection
loss, plus unknown-session isolation. `AgentChat.projectContract.test.tsx`
exercises the real panel/hooks/transport and verifies that a fresh connection
preserves the draft and queued message without calling the prompt endpoint.
