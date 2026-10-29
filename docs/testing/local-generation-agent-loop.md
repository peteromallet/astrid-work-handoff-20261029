# G2b: local generation through a real chat agent

Verified 2026-10-24 in `/home/user/wt/agent-loop`, branch `wt/loop`.
**Path A worked.** A real Codex chat generated images, reused its setup in a
new chat, uploaded an image input, reported a missing node after the fixes,
and cancelled only its own ComfyUI prompt. The experience is still **rough**:
permission recovery, duplicate admission, opaque image references, and busy-chat
cancellation all surfaced. No GPU, model files, provider API keys, cloud media
executors, timeline edits, push, PR, or cloud sessions were used.

## Environment and actual chat path

Read the complete local-generation plan, the G2 report, and the packaged core
and VibeComfy skills before testing. Scratch data, drivers, fixtures, logs,
transcripts, and environments live under `/home/user/e2e/loop`; none are committed.

- Reused stock CPU ComfyUI and its `.venv` at `/home/user/e2e/ComfyUI`, revision
  `fb3befd168731438f88bc96e0920a538e8649878`. Started
  `.venv/bin/python main.py --cpu --listen 127.0.0.1 --port 8188`.
  The G2 request-audit middleware remained in the scratch copy; its records
  are in `loop/comfyui.log`. `/system_stats` reported ComfyUI 0.42.0 and CPU torch.
- Saved UI-format `solid-color.json` (256×256 EmptyImage → SaveImage),
  `invert.json` (LoadImage → ImageInvert → SaveImage), and `fancy-node.json`
  (`AstridDefinitelyMissingNode` → SaveImage) through
  `POST /userdata/workflows%2F<name>.json`. Created a 64×48 RGB `loop/cat.png`.
  Existing G2 workflows were preserved, so discovery listed eight workflows.
  A separate `solid-color-slow` fixture used stock ImageBlur nodes for cancellation.
- Created a fresh realm at `loop/realm` and support root at `loop/data`, with
  empty preferences and project `loop`. Used `astrid.services declare`,
  `astrid_runtime workspace create`, and `astrid_runtime up --profile astrid
  --hosted-origin off`, with this worktree as the source checkout and
  `/home/user/banodoco/astrid-agent/.venv` as the environment, as in G2.
  Provider-key variables were removed from the launch environment; no provider
  credentials were configured in the workspace. Codex used its existing ChatGPT login.
- Runtime supervised the normal Bun `astrid/chat/service.mjs` and pack host.
  The headless client used the authenticated bridge's `/connect`, connection
  `/rpc` (`session/new`, `session/prompt`), and `/events` routes. It requested
  `agent=codex`, `defaultModelId=gpt-6-luna`; the adapter advertised and selected
  Luna. Adapter version: `@agentclientprotocol/codex-acp@2.2.2`.
  Set `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` for downloads.
- The host built the normal rendered Astrid profile, local-agent instruction,
  ACP context line, and automatic preferences snapshot. No custom task guidance
  was added to the in-chat prompt. The only clarification supplied was
  **“A solid color image.”** The installed OMP agent was skipped because it
  needs a provider key; fallback `codex exec` chat was unnecessary.

Source-install harness details matter: the shared virtualenv's console entry
point resolves another checkout. An initial chat read that older skill and was
cancelled before generation. The corrected scratch launcher changes to this
worktree and executes the supplied Python with `-m astrid.omp_agent`, matching
the installed `astrid` entry point; the chat cwd is this worktree too. Calling
`-m astrid --agent-profile-file` was an incorrect harness command, corrected
before the measured cold run. The initial configured chat directory also had
to be created. No Astrid/VibeComfy installation or global agent-setting changes
were needed.

The first helper's ComfyUI process ended with its helper session; the parent
started the final server in a persistent execution session. During a later
operator pause, the headless client's lease expired because it had stopped
polling. Added bridge keepalive requests, as the app normally makes, and resumed.
That raw `session/load` selected the adapter's default Sol model. The exploratory
cancellation on that resumed chat is retained in the logs; the final cancellation
was repeated in a **fresh Luna chat**, confirmed by response usage metadata.
This does not establish whether the app's project-chat recovery has the same
model issue. Source edits during testing also caused host attestation/replacement
waits; they inflated several timings and are not ordinary steady-state latency.

## Scenario results

Times are measured request-to-response wall time, including tool/approval waits
and polling, excluding human think time. “Tools” counts bridge `tool_call`
notifications, with automatic permission assessments counted separately as `+P`;
command arguments and complete messages are recorded in
`loop/agent-command-record.json` and each `s*-events.jsonl` / `s*-result.json`.
A turn means a user prompt that reached the model.

| Scenario | Rating | Turns; tools | Wall time | What happened; short verbatim excerpt |
| --- | --- | --- | --- | --- |
| 1. Cold chat: “Can you make an image with my ComfyUI?” | rough | 2; 12 + 8P | 149.44 s | Scanned, asked what the image should show, then selected `solid-color` after the one clarification. Imported, admitted, followed, and saved machine facts with checkout/check-in. Discarding a live shell handle caused **two** successful task admissions. Final reply named the image digest rather than embedding a preview. “I also saved your ComfyUI setup to your user preferences for next time.” |
| 2. Same chat: “another one” | smooth | 1; 2 + 2P | 33.14 s | Direct invocation and follow, no scan or workflow reread. New file and digest. “Another image was created successfully with the same `solid-color.json` workflow.” |
| 3. Same chat: “invert /home/user/e2e/loop/cat.png with my invert workflow” | smooth | 1; 5 + 5P | 54.16 s | Checked the saved port, fetched `invert`, built/imported the image ZIP, passed `managed_assets`, followed, and returned an image in project media. Pixels verified exactly. “`cat.png` was inverted successfully with your `invert.json` workflow.” |
| 4. Same chat: “run my fancy-node workflow” | failed initially; rough after fixes | initial 1; 1 + 1P. Final retest 1; 10 + 7P | initial 6.07 s; final 82.24 s | Initially inferred missingness from the name without a live check or task. A skill retest exposed a canonical rewrite bug (49.19 s; 5 + 5P). After the code fix, Luna admitted one task, got the real missing-node error before `/prompt`, and proposed identifying the owning pack before installation. “then we can install its pack into your ComfyUI and rerun.” No installation was attempted. |
| 5. New chat: “make me another solid color image” | rough | 1; 11 + 6P | 83.23 s | Used automatically injected URL, output folder, and workflow name. Checked only saved port 8188; no broad discovery or setup questions. Recovered loopback and Runtime-storage sandbox errors through normal approval, then imported/invoked/followed once. “I found the saved workflow preference.” |
| 6. While running: “cancel that” (final Luna run) | rough | 2 model turns; 6 + 6P; one additional rejected send and Stop action | 75.77 s overall; cancel turn 6.01 s | Started a five-blur stock workflow. A concurrent prompt returned HTTP 409 `session_busy`; text did not reach the model. Used bridge Stop, then resent the same text. Agent called `tasks cancel`; only our prompt was interrupted, foreign sentinel completed, server remained healthy. “Astrid Runtime reports its state as `cancelled`.” |

Before the permission clarification, the first cold attempt stopped after
6.07 s (2 tools) with “Please make sure ComfyUI is running, then try again.”
The server was healthy: the scan had returned `Operation not permitted`.
A loopback-only text fix recovered discovery, but a second attempt stopped after
26.12 s (5 tools + 2P), interpreting `runtime_acquisition_lock_unavailable` as
an installer problem. Extending that clarification to Runtime storage resolved
this too; scenario 5 exercised both recoveries without user coaching.

The exploratory resumed-Sol cancellation used 25 blur nodes: 166.79 s overall,
8.02 s for the cancel turn, and the same safe result. Both cancellation runs
hit the busy-turn limitation. These exploratory runs are separate from the final
Luna result, not silently counted as Luna coverage.

## Commands and task evidence

The agent read the packaged core/VibeComfy skills and used these commands;
full shell strings, including quoting and invocation JSON, remain in the scratch
command record. `PROJECT` below is `loop` or its selected Runtime project ID.

| Scenario | Agent command sequence |
| --- | --- |
| 1 | `python3 -m astrid --help`; `python3 -m astrid.packs.vibecomfy.local scan` (approved retry); `curl` saved workflow → scratch; `python3 -m astrid media import … --project PROJECT --json`; `python3 -m astrid.omp_invoke '<json>'`; accidental `omp_invoke --help` and a task-list diagnostic; duplicate invocation; `tasks follow … --timeout-seconds 600 --json`; `preferences user`, `preferences checkout --scope user --file …`, edit scratch copy, `preferences checkin …`. |
| 2 | `python3 -m astrid.omp_invoke '<same workflow/server JSON>'`; `python3 -m astrid tasks follow 13fbe76e669440ae80d1110e80c15169 --project PROJECT --timeout-seconds 600 --json`. |
| 3 | `local scan --ports 8188`; fetch/read `invert.json`; `python3 -m astrid.packs.vibecomfy.local pack-images /tmp/astrid-comfy/cat.zip /home/user/e2e/loop/cat.png`; import workflow and ZIP; invoke with both digests; follow. |
| 4 | Initially only fetch/read `fancy-node.json`. Final retest: read packaged guides; saved-port scan; project read with approved retry; fetch/read and import workflow; invoke; wait on the existing process handle; task follow/show for failure evidence. |
| 5 | Read packaged guides; `local scan --ports 8188` with approved retry; CLI help/current project with approved retry; fetch/read and import `solid-color.json`; invoke with `workflow_inputs="{}"`; follow. No explicit preferences fetch preceded the saved-setup choice. |
| 6 | Saved-port scan; fetch/read/import `solid-color-slow.json`; invoke and follow. After Stop/resend: `python3 -m astrid tasks cancel 3e5f5995e4dd443baf50f8b6a188f416 --project loop --json`. |

All generation invocations used `vibecomfy.run`, `kind="executor"`, the selected
project, a workflow digest, `comfy_url="http://127.0.0.1:8188"`, and
`comfy_output_dir="/home/user/e2e/ComfyUI/output"`. Scenario 3 also supplied the
imported ZIP digest as `managed_assets`. No direct engine execution bypass,
provider-key request, pip install, VibeComfy install, ComfyUI launch/restart,
Astrid service restart, GPU-gate change, or timeline edit was issued by the chat
agent. `vibecomfy config init` was not run during attachment; installation
recipes themselves were not exercised.

| Task | Result |
| --- | --- |
| `10bc96b50b0549189bea94cb66e84cc4`, `21568f323b9e4b04a84a3559fedc301a` | Two successful cold-start admissions; the second was the one reported to the user. |
| `13fbe76e669440ae80d1110e80c15169` | Successful “another one”; digest `sha256:fdac7dfd4c3cdcbe59357c53ddcd45435924235b08c54d092d1cacfab320c02a`. |
| `0d200eb2674c4bbfac91ca8708a70f62` | Successful invert; digest `sha256:3763130bbc6abccfaba60d389c4dfec591eca8684d59a44458c14522371d5dce`. |
| `969ff408ebf54dfda84c177405b3280c` | Successful new-chat image from remembered setup. |
| `5f0b29516ff7486ba4d31a27494898be` | Expected exploratory failure exposing the staged semantic-digest bug. |
| `aed54bb7a3da4f8782a7f312da9aa5be` | Post-fix failure naming the actual missing node; zero queue submissions for it. |
| `19fb7c3e68af414b854043d9642a4ef8`, `3e5f5995e4dd443baf50f8b6a188f416` | Cancelled; exploratory Sol and final Luna respectively. |

Afterwards, `tasks show` recorded all nine tasks (five succeeded, two failed,
two cancelled). All five PNG outputs appear in project media and match the
original ComfyUI file hashes after collection. “Another one” has a distinct
file/digest; EmptyImage is deterministic, so the pixels remain the saved solid
color. These fixtures have no seed input; random sampler-seed behavior is covered
by the integration tests, not by a model-backed chat run.

The image upload was under `astrid/0d200eb2674c4bbfac91ca8708a70f62/…-cat.png`.
Its result matches ComfyUI's float32 inversion and uint8 conversion exactly.
The three original saved workflow hashes remained unchanged. Preferences contain
only the ComfyUI URL, folders, interpreter, workflow names, skill pointer, and
update date; no taste defaults or secrets. They also include two discovered but
unrun G2 workflow names, so this is broader than the skill's “workflows that
worked” wording. The new chat's injected context contains that saved section.

Final audit, including Runtime shutdown: **zero `/api/free` or `/free`, zero
queue clears, zero foreign deletes, and zero missing-node `/prompt` submissions**.
Every interrupt named one of our two cancellation prompts. Foreign sentinels
`22ddc556-c457-4020-bf55-2e31fe8e5cee` and
`a7c7d714-6c1d-4426-bd6a-6c612f572ddf` both completed successfully.

## Fixes and verification

Code fix: `_local_server_bundle` previously rewrote save prefixes before the
live preflight. A connected unknown class could fail canonical re-emission
with `staged Python semantic digest differs from intended bundle`, hiding the
useful missing-node error. Image-input preparation still happens before input
validation; attempt-specific save prefixes are now derived **after** live
preflight. Existing execution profiles and permission/API-key/GPU rules are
unchanged. The new connected-unknown-node regression failed before this fix;
post-fix it asserts the actionable error, no POSTs, and an unchanged input file.

The exploratory failure also exposed an obsolete `astrid executors` recovery
hint. Local-server execution failures now suggest the runnable, read-only
`python3 -m astrid.packs.vibecomfy.local scan` diagnostic; the accompanying
missing-dependency message still points to the installation recipe. A focused
CLI-error regression verifies that the missing-node detail is preserved and the
retired route is absent. Other execution profiles retain their existing hints.

Small skill edits, committed separately:

1. Distinguish loopback/Runtime-storage sandbox denial from a stopped server or
   broken installation; use the normal permission-request flow.
2. Wait on a live shell process handle rather than invoking again.
3. Let the task check missing nodes against the live server; identify an unknown
   owning pack before offering installation, without inventing an install slug.

Scenario 5 confirmed permission recovery and single admission; the fresh Luna
scenario 4 retest confirmed waiting on the original handle and the live failure
message. No skill sections were rewritten wholesale.

All commands ran from the worktree root. Python below is
`/home/user/banodoco/astrid-agent/.venv/bin/python`; Bun is `/root/.bun/bin/bun`.
Luna helpers handled fixture setup, log review, regression-test construction,
and targeted test runs; the parent reviewed the changes and made the fix.

| Verification | Result |
| --- | --- |
| `python -m pytest -q tests/test_agent_context.py tests/test_preferences_documents.py tests/packs/test_vibecomfy_local.py tests/test_generic_host_vibecomfy_lifecycle.py` | 66 passed |
| `bun test ./astrid/chat/astrid-local-agent-host.test.ts ./astrid/chat/acpProcessHost.test.ts` | 26 passed |
| `python -m pytest -q tests/test_vibecomfy_production_engine.py tests/packs/test_vibecomfy_metadata.py tests/packs/vibecomfy/test_local_server_helpers.py tests/packs/test_vibecomfy_local.py tests/test_generic_host_vibecomfy_lifecycle.py` | 68 passed, 2 subtests passed; 1 integration test deselected by the default lane |
| `ASTRID_RUNTIME_CHECKOUT=/home/user/banodoco/astrid-runtime python -m pytest -q -m integration tests/packs/vibecomfy/test_local_server_run.py` | 21 passed; one existing generated-template deprecation warning |
| New regression alone before the production fix (`-k unknown_connected_node`) | Reproduced the staged semantic-digest failure; fixed in the complete integration run |

No unresolved test failures were found. The pass counts above include overlapping
regression coverage, not 181 distinct tests. Full repository suites, browser UI,
GPU/Windows runs, provider-backed model workflows, and actual node/model
installation were skipped. The first helper's requested `astridAcpLauncher.test.ts`
does not exist; `acpProcessHost.test.ts` covers that launcher instead.

## Remaining rough edges, ranked

1. **High: typed cancellation during an active turn is rejected.** The bridge
   returns `session_busy`; Stop only interrupts the agent, so a second “cancel
   that” is needed to cancel the Runtime task. Task cancellation itself was safe
   in both runs. Changing chat concurrency/steering is outside this focused fix.
2. **High: the reply is an opaque media digest.** Images are registered in project
   media, but the headless replies did not embed a preview or usable media link.
   Browser task-card/preview rendering was not verified, so this test cannot claim
   that “shown in chat” works for external agents.
3. **Medium: repeated sandbox approval and diagnostics are slow.** Even the new
   chat needed six permission assessments, a CLI help read, workflow fetch/import,
   and a full saved-port scan rather than one cheap health request. The skill
   avoids erroneous reinstall advice but does not remove this friction.
4. **Lower: memory and selection are imperfect.** Cold-start selection asked what
   to draw instead of showing the workflow short list; saved preferences included
   unrun workflow names. Setup also deferred `config init`. No incorrect install
   occurred, and these did not block attachment or the new-chat run.
5. **Harness limitation: raw session-load model preservation.** The exploratory
   resume switched Luna to Sol; the final scenarios were repeated on a fresh Luna
   session. The app's project-chat recovery path still needs a dedicated check.

## Cleanup and retained evidence

`astrid_runtime down` returned `stopped`, with no active tasks, stale bindings,
unreconciled attempts, or unreleased reservations. Terminated the owned ComfyUI
process and keepalive. Runtime port 38343, chat port 33585, and ComfyUI port 8188
were all closed. No owned fixture, chat bridge, or Codex ACP/app-server processes
remained; unrelated agents were untouched.

Useful retained scratch records: `agent-command-record.json`, `s*-events.jsonl`,
`s*-result.json`, `task-<id>.json`, `context-before-chat2.txt`,
`preferences-final.json`, `media-final.json`, `verification.json`,
`audit-verification.json`, both `cancel*-evidence.json`, `comfyui.log`, the test
logs, `cleanup-runtime.json`, and `cleanup-final.json`.
