# Astrid App and the agent-owned chat service

The chat endpoint is an agent-owned user-machine service. It keeps only ephemeral
connection handles in memory; each selected agent remains the authority for its
profiles, opaque session IDs, and session storage. The browser never receives the
bearer token or starts a child process.

The service belongs to [astrid-agent](https://github.com/banodoco/astrid-agent/blob/main/docs/reference/services.md).
The Runtime starts and supervises it from the agent's service declaration. It
runs with Bun 1.3.14, registers its loopback endpoint and private credential in
`chat.json` beside Runtime discovery, and removes its own registration on exit.
The bridge launches the installed `astrid` command; Astrid owns the packaged
profile, OMP build, credentials, and session identity.

For local app development, follow the startup and Runtime selection instructions
in the [repository README](../../README.md). On an installed computer, the
Runtime starts and supervises the chat service declared by Astrid Agent; Astrid
App does not launch or own that service.

`ASTRID_ACP_SESSION_DIR` is optional. When omitted, the installed OMP build
owns its canonical cwd-derived session directory, allowing ACP session
listing/loading/resume to discover the same opaque session ID after a fresh
process starts with the same profile and cwd. An explicit absolute
`ASTRID_ACP_SESSION_DIR` remains a supported legacy override; existing data is
left in place, but OMP 17.3.5 ACP discovery does not search that arbitrary
directory in a new process, so use it only when the original process remains
live.

In local development, the app's discovery proxy routes ACP requests through the
selected Runtime door. The door re-reads the agent's `chat.json` registration for
each request, including after chat restarts or credential rotation, and forwards
the request to the agent-owned service. The hosted page reaches the same service
through the door. Missing or invalid registration returns `acp_unavailable`.
Both paths retain the credential and protocol header outside browser code.

The existing `/api/astrid` REST routes remain on the Astrid service port. ACP
requests use `/api/astrid/acp`; in local development Vite forwards them through
Runtime discovery, and the hosted app sends them through the Runtime door. The
browser controls create, resume, cancel, close, and reconnect sessions, but do
not persist connection or session IDs. Reconnect while the service is live
reuses the same ACP process and opaque session authority; it does not create a
second session registry.

## Agent readiness and selection

The chat menu (the header's top-left dropdown, which also switches chats) reads `GET /acp/agents` whenever it opens and when the window
regains focus. The bridge finds `claude`, `codex`, and `hermes` on the person's login-shell
PATH (`$SHELL -lic`), then falls back to its own PATH. It asks
`claude auth status` (with a text fallback) and `codex login status` whether
each is signed in. Claude Code uses your Claude login; Codex uses your Codex
CLI login, including ChatGPT. Unknown sign-in counts as ready. Status errors
and child diagnostics never cross into the App.

The service reports one state per agent: **Ready**, **Sign in**, or
**Not installed**. A ready row starts a chat with that agent's service default
model, shown on the row; → (or the row's chevron) opens its service-owned model
catalog. Each command
inside a non-ready row has a **Copy command** button; only the command is copied.
Install and sign-in lines come from the service, including the installed Astrid
launcher and platform-specific Hermes instructions.

OpenAI documents the Codex CLI install command in its [Codex setup guide](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex).
Use the same `--profile` as the bridge when configured.

The bridge launches each ACP adapter through Bun, pinned in
the agent’s `astrid/chat/astrid-local-agent-adapters.ts`:

```sh
bun x --bun @agentclientprotocol/claude-agent-acp@0.93.0
bun x --bun @agentclientprotocol/codex-acp@2.2.2
```

The first chat caches the adapter (about 250 MB for Claude Code and 330 MB for
Codex with native binaries). Bun's `--bun` runtime handles Claude's Node 22
requirement. The bridge passes the detected Claude executable as
`pathToClaudeCodeExecutable` and Codex as `CODEX_PATH`, so both adapters use the
person's installed CLI and login. The app does not install either CLI. While a
chat starts, the menu reports **Getting Claude Code ready…** (or the chosen
agent); a failed start shows **Claude Code didn't start.**, its details, and
**Try again**.

Under the chat menu, a small line shows the chat's fixed agent, model and thinking
level. It opens the chat's thinking level, which can change between replies, and
**New chat with another model**, which opens the new-chat menu (the ▾ beside **+** at the right of the header) on that agent's models:
model choice happens only when a chat starts.
The service owns each catalog and its defaults, bootstrapping discovery when
needed; the browser does not keep another model list or model preference.
Models expose a thinking-level submenu only after that exact model has advertised
one. Startup validates the newly created chat's live options before applying the
chosen level, and keeps its composer locked until the agent confirms it.

Existing project chats keep their original agent and model. External session IDs
are prefixed (`claude-code:`, `codex:`, or `hermes:`) at the bridge boundary; the
prefix never reaches an adapter. New chats attach their regular browser connection
before a temporary creator connection is released, retaining the live native host
even when an empty chat has not been saved by its adapter yet.

Each new external chat receives the installed Astrid packaged profile from
`astrid --agent-profile-file` and the editor integration instructions once. Each
turn receives the same scoped editor context, refreshed for the captured selection.
Chat never installs skills or changes global agent configuration. Project
associations, replay, cancellation, and terminal and permission callbacks use the
existing ACP bridge.

The external profile and media policy are prompt context, rather than an
adapter-enforced system policy. The OMP overlay that disables native image
tools applies to Astrid only. Permission requests retain the bridge's existing
host-side decisions; this change does not add an approval dialog.

The ACP adapters are resolved with Bun at the pinned versions in the bridge
launch path; no separate adapter install is needed. Live verification on the
owner's Mac: reopen the picker and start a prompt with each signed-in agent.

The installed OMP build does not make sessions stored under a custom
`--session-dir` discoverable to a newly spawned ACP process. Astrid App therefore
does not emulate a registry or migrate those files; the canonical no-override
launch is the supported fresh-process path, while custom-directory sessions
remain an explicit same-process limitation.

## Sharing a chat between tabs

The bridge keeps one native ACP session for every live chat, across all four
agents. A second tab loading that chat follows the existing host's transcript
and updates without opening another native writer. Each browser connection
has its own event queue, so polling one tab never drains another tab's stream.

The follower shows **Active in another tab — take over**. Takeover transfers
write permission immediately; a running turn continues on the same native
session. The former writer becomes a follower, and the new writer waits for
the running turn to finish before sending another message. Only the current
writer can change session settings or cancel its turn. A submitted request ID
is retained with its native operation, so a retry joins that operation instead
of sending it again.

The shared state reports the running request ID separately from a durable
history receipt. A saved queued row for that request shows **In progress in
another tab**, and cannot be retried while it is running. Following a turn or
taking over never automatically dispatches saved queued messages.

Closing the original tab retains its native host while other tabs still use
the session. The bridge releases it when no attached client or running request
needs it. This sharing is scoped to one bridge process; native agents continue
to own durable transcripts after a bridge restart.

## Editor context passed to Astrid

The launcher is deliberately project-agnostic. Astrid App does not put the selected
project or timeline in a process flag because one bridge process can serve
multiple tabs and the selection can change while a conversation remains open.

Each submitted editor turn contains a bounded, machine-readable
`<astrid_editor_context>` block with schema `astrid.editor-context/v1`. It carries
the current project ID/slug, timeline ID/name, the Astrid App deep link, a revision
for the captured selection snapshot, and selected clip/asset references. It
does not copy the full asset registry or private media URLs into the prompt.
Astrid should use its project, timeline, media, task, and run tools to read
fresh state before editing and saving. The block is refreshed on submission so
a project or timeline switch cannot leave the next request using stale editor
context.

## Canonical Runtime editor entry

The editor's canonical local data path is the existing authenticated Runtime
proxy, not the legacy Astrid REST timeline route. Follow the local app startup
instructions in the [repository README](../../README.md), select the intended
Runtime workspace, then open:

`/tools/video-editor?project=<Runtime project_id>&timeline=<timeline_id>`

For disposable Runtime setup, use the generated client's atomic
`createTimelineDocument` operation with the chosen project and timeline IDs.
Do not create the same timeline first with `createTimeline`; the Runtime
contract treats `createTimelineDocument` as the create-timeline-plus-document
operation and returns `409 timeline already exists` for a pre-created shell.
The ACP controls are available alongside this Runtime editor entry; their
connection and opaque session IDs remain tab-local.
