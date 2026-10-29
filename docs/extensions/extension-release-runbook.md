# Extension Ship-Quality Release Runbook

Date: 2026-08-24

This is the operator procedure for the bundled extension host, Transcript
Caption Foundry, and Astrid Runaway typed-timeline viewer. The paired revision
manifest is [`config/releases/extension-ship-quality.json`](../../config/releases/extension-ship-quality.json),
and the executable clean-machine gate is
[`scripts/release/verify-extension-ship.mjs`](../../scripts/release/verify-extension-ship.mjs).

The verifier is intentionally conservative. It requires the manifest-pinned
Node/npm versions, the configured Astrid App branch, an annotated tag and
`ASTRID_APP_REF` resolving to the exact product candidate (`C`), and a clean Astrid App
controller `HEAD` (`H`) that is a strict evidence-only descendant of `C`. It
also requires an exact clean Astrid checkout supplied by commit through the
environment. It never fetches, changes a Git ref, resets, cleans, or applies a
production migration. A mismatch or failed command stops the run.

Before the 40+ minute verifier, run the cheap local readiness probe. It checks
the documented 11 GiB free-space floor, pinned Node/npm/Python/native tools,
the exact Astrid App and explicitly supplied Astrid checkout, clean worktrees,
manifest/ledger pin agreement, and phase-appropriate release-tag state. The
Astrid path is mandatory; the probe never guesses a sibling directory:

```sh
ASTRID_CHECKOUT=/absolute/path/to/clean/Astrid \
npm run check:extension-local-rc-preflight
```

For automation, parse JSON even when the expected blocked exit is 1:

```sh
ASTRID_CHECKOUT=/absolute/path/to/clean/Astrid \
npm --silent run check:extension-local-rc-preflight:json \
  > /tmp/extension-local-rc-preflight.json
```

`localInfrastructureReady` covers only the machine checks. Top-level `ready`
and `readyForVerifier` remain false until the manifest/ledger are frozen and
all required evidence is present. The JSON keeps production/external blockers,
human/reviewer blockers, and integration/frozen phase blockers in separate
arrays; an infrastructure-ready result does not imply verifier admission.

Before recruiting participants or changing a production flag, run the
read-only operational preflight. It fails closed while the release is still in
integration and prints the exact missing human, rollout, observability,
recovery, and review evidence plus the documented draft/capture commands:

```sh
npm run check:extension-release-preflight
```

For automation, use npm's silent mode so its lifecycle banner cannot be mixed
into the JSON stream. The command intentionally exits 1 while any blocker is
present; parse stdout even on that expected exit and use the `ready` field:

```sh
npm --silent run check:extension-release-preflight:json > /tmp/extension-release-preflight.json
```

Do not use `npm run check:extension-release-preflight -- --json` for machine
output: npm prints its banner to stdout unless `--silent` is supplied.

This command never creates evidence, signs receipts, changes the ledger, calls
production, or changes rollout state. A preflight `PASS` only means the
external evidence prerequisites are represented in the local ledger; it does
not replace participant approval, production observation, or the blocking
ship verifier.

After preflight, every Astrid App gate runs from a newly created detached worktree at
the verified evidence-controller commit, never from the operator checkout. This
keeps Git ancestry available to evidence gates while excluding ignored local
inputs such as `.env.production`, `public/files/`, and `public/uploads/`. The
temporary worktree is removed after the run; any tracked mutation fails the
post-gate clean check.

The Astrid `make ci` gate receives that same fresh detached path in the
verifier-owned `ASTRID_APP_RELEASE_CHECKOUT` environment variable. Astrid SQL-contract
tests must resolve Astrid App migrations through this explicit path; operators must
not provide or substitute an ambient sibling checkout.

Candidate identity is deliberately deferred during integration. Compute `C`
from a fresh clean source snapshot only after the native-tool attestation commit
has landed and the source sequence is reviewed; a moving local/remote branch
head is not a candidate and no final SHA should be recorded early.

## Running the frozen-candidate gate

### Local browser-gate provisioning

The local readiness, compatibility, accessibility, and timeline commands use
the Playwright package installed by the Astrid App lockfile, but `npm ci` does not
install its browser executables. Provision the matching engines once after a
fresh install or Playwright version change:

```sh
npm ci --no-audit --no-fund
npx playwright install chromium firefox webkit
```

Do not interpret an all-tests failure in a few milliseconds as an application
regression until the error output confirms that the pinned browser executable
exists.

Run the deterministic readiness browser gate through its package command:

```sh
npm run test:readiness:e2e
```

That command starts isolated editor and Astrid-stub ports. Its conditional
setup project opens the real local-test harness and waits for
`data-video-editor-harness-ready="true"` before the three device projects
begin in parallel. This warms the lazy route and complete Vite module graph
without increasing the ordinary 30-second test budget or retrying failures.

Prepare fresh, separate Astrid App and Astrid checkouts. Install the exact Node, npm,
Astrid Python, and native-tool versions recorded in the verification block of
`config/releases/extension-ship-quality.json`, plus the dev tooling required by
the manifest-pinned Astrid revision, GNU Make, and the host libraries required
by Chromium. Do not copy tool versions or release pins from a previous RC into
this runbook.
Do not reuse a developer worktree for release evidence.

Before dependency provisioning or the production build, the verifier attests
the native toolchain on the host: realpaths and SHA-256 hashes for `ffmpeg`,
`ffprobe`, `tesseract`, and ImageMagick; exact version and build identity;
Tesseract's `eng.traineddata` bytes; and the pinned OS/architecture/release.
Node, npm, and Astrid Python identities are recorded too. A mismatch fails before expensive work begins.

Review the exact plan first; this works without an Astrid checkout and executes
nothing:

```sh
npm run verify:extension-ship -- --plan
```

For the blocking run, pass an absolute checkout path and an immutable commit.
The ref must resolve to the Astrid commit in the paired manifest, and Astrid
must be on the configured branch with `HEAD` equal to it. First commit all
source, scripts, documentation, pins, and gate configuration. Create the
annotated Astrid App tag named by `astrid.releaseTag` at that candidate `C`; both the
tag and `ASTRID_APP_REF` must resolve to `C`. Then commit the frozen ledger, the
manifest's status-only freeze, and artifacts under
`docs/extensions/ship-evidence/releases/<manifest.release>/` to produce the clean
controller `H`. The verifier captures `C`, `H`, and the annotated tag-object
hash. Resolve `<manifest.release>`, `astrid.releaseTag`, and `astrid.commit`
from the manifest for every run; do not reuse values from an older candidate:

```sh
ASTRID_APP_REF=<full-40-character-Astrid-candidate-C> \
ASTRID_CHECKOUT=/absolute/path/to/clean/Astrid \
ASTRID_REF=<manifest.astrid.commit> \
ASTRID_PYTHON=/absolute/path/to/pinned/venv/bin/python \
npm run verify:extension-ship
```

Capture complete stdout/stderr, exit status, Astrid App `git rev-parse HEAD`, Astrid App
candidate `git rev-parse ASTRID_APP_REF`, the tag named by
`manifest.app.releaseTag` via `git rev-parse
refs/tags/<manifest.app.releaseTag>^{tag}`, Astrid
`git rev-parse HEAD`, UTC start/end times, and hashes of retained test/render
artifacts. An exit code of zero is necessary, not sufficient: every frozen-RC
item and both independent review slots below must also be complete.

Evidence is add-once. The gate uses exclusive file creation, writes the receipt
before `artifact-index.json`, prints the detached index hash, and makes the
evidence directory read-only before returning. A rerun must use a new untracked
evidence root; correcting a captured document requires a new path and receipt.
Do not overwrite a receipt or refresh tracked screenshots as a side effect of an
ordinary test run.

### Visual regression input

The active candidate visual gate is `npm run test:e2e:extension-visual`; it
compares the current screenshots against the checked-in test baselines. The
separate RC6 provenance verifier guarded a finished release and has been
retired with its historical archive. Keep the visual regression gate in the
release profile.

### Typed external evidence

Do not attach a generic test log to transcript ownership, rollout,
observability, recovery, human acceptance, or independent review. Workstreams
10 and 19–23 use the versioned templates and `npm run extension:evidence`
workflow documented in
[External-evidence operator flow](#external-evidence-operator-flow).
Initialize outside the release evidence root, fill from the real external
session, validate, capture once, append an unsigned receipt, and obtain the
required participant signature afterward. A captured document is immutable;
correcting it requires a new path and receipt. The tool does not accept private
keys, infer success, or change a ledger status.

## Production release controls

These are runtime-only production controls, all default-off for a new release.
Set them as container/service variables, never as Docker build arguments and
never with a `VITE_` prefix. Product configuration may map these contract names
to provider-specific keys, but the mapping and effective values must be recorded
with the RC. A child flag never bypasses its parent.

| Contract flag | Controls | Dependency | Immediate rollback effect |
| --- | --- | --- | --- |
| `EXTENSION_HOST_ENABLED` | Activation and rendering of the bundled extension host | None | Prevent new extension activation and remove host surfaces after a safe reload |
| `TRANSCRIPT_CAPTION_FOUNDRY_ENABLED` | Transcript Caption Foundry registration, commands, and writes | `EXTENSION_HOST_ENABLED` | Stop Foundry commands/writes while leaving unrelated host extensions available |
| `RUNAWAY_TYPED_TIMELINE_ENABLED` | Astrid App-side Astrid Runaway projection, commands, and viewer registration | `EXTENSION_HOST_ENABLED` | Stop new editor-side Runaway projection, commands, and viewer activation while leaving unrelated host extensions available |

The Astrid App server-side proxy and `astrid serve` must share one randomly generated
`ASTRID_BRIDGE_TOKEN`; never expose it through a `VITE_` variable or browser
code. Start Astrid with `--release-mode`, which requires bearer authentication
and the version handshake. Both Vite dev and preview fail closed with `503` when
the server token is absent, inject the bearer value only on the loopback
upstream request, validate the bridge port as an integer from 1 through 65535,
and bound both proxy sockets to the shared ten-second bridge deadline. The
committed deterministic stub is the only unauthenticated mode and must be
enabled explicitly by its owning test/dev launcher.

`EXTENSION_HOST_ENABLED` is deliberately the shared rollback boundary for this
reviewed release inventory. Production selection fails closed for
any ID not in this list:

- `haus.astrid.transcript-lane` (also gated by the Transcript child switch)
- `haus.astrid-runaway-timeline` (also gated by the Runaway child switch)

The ten Creative Lab extensions that once shared this list were removed (2026-10-19): the
shipped catalog could not produce their IDs. The DEV Scene Phase Markers extension was
removed too (2026-10-21), together with its list entry. Enabling the parent enables
the listed extensions together; emergency containment turns the parent off and safely
reloads. That coarse rollback is an explicit release decision, not an implied
per-extension control. The compatibility, composition, visual, persistence,
render, and device evidence must therefore cover the complete enabled set.

The Runaway child switch does not remove the shared `data_bundle` column or
`bundle` member from the generic timeline read: that envelope can also contain
Transcript or future typed data and is fetched atomically with the timeline.
With Runaway disabled, its kind is not registered and persisted Runaway items are
not projected. (The DEV-only `/runaway-transitions` bridge loader was removed, so no
Runaway source request exists to suppress.) This is the tested containment boundary; operators must not describe
the switch as suppressing unrelated shared-envelope transport, stopping an
already-running Astrid migration, or disabling Astrid service writers. Those
service/data operations require their own Astrid-side containment procedure.

Every container start atomically writes the public versioned document
`dist/runtime-config/v1/extensions.json` from those three variables plus
`EXTENSION_RELEASE_CONFIG_REVISION`. Vite preview serves it at the fixed
same-origin URL `/runtime-config/v1/extensions.json`; the page loads it with
redirects disabled, `no-store`, and a fixed four-second timeout before React
mounts. A timeout renders the application with all three switches closed.
Development does not fetch the document and defaults open for fast local
authoring.

Set booleans to exactly `true` or `1`; every other value is off. Set
`EXTENSION_RELEASE_CONFIG_REVISION` to 1–64 ASCII letters, digits, `.`, `_`, or
`-`. Missing or malformed revision forces the parent and both children closed.
Malformed JSON, unknown schema versions/fields, network errors, non-2xx
responses, and cross-origin redirects also fail closed. Query strings and
browser storage are never consulted. In particular, production ignores
`?extensionSmoke=1` even when the host is enabled.

To change or roll back a flag, update the service variable and restart/redeploy
the container so the runtime document is regenerated. Reuse the same image;
do not rebuild the Vite bundle. Confirm the served document and then safely
reload the page. Log only the effective boolean snapshot and configuration
revision, never targeting rules or user attributes. Analytics configuration is
separate from this runtime rollout document.

The document is intentionally global to one deployed instance; it contains no
user or project targeting data. Named-staff and percentage cohorts must be
routed by deployment infrastructure to separately configured instances of the
same image. If the platform cannot prove that routing and its emergency route
change, Stage 1 and percentage rollout remain blocked rather than falling back
to client-side identity targeting.

## Staged rollout

The Release DRI owns stage changes. Astrid App on-call, Astrid on-call, the Data
Migration DRI, and Observability on-call must be reachable before any increase.
Advance one flag at a time in dependency order: host, Foundry, then Runaway.

| Stage | Cohort | Minimum observation | Entry and exit rule |
| --- | --- | --- | --- |
| 0. Dark | 0%; all flags off | One deploy health window | Dashboards and alerts receive baseline traffic; rollback and backup are verified |
| 1. Internal | Named staff test projects only | 24 hours and the human protocol below | No SEV-0/1; zero unexplained write conflicts or migration anomalies |
| 2. Canary | Up to 1% of eligible projects | 24 hours | Error, latency, conflict, and render budgets remain within the signed RC thresholds |
| 3. Limited | 10%, then 25% | 24 hours at each step | No statistically meaningful regression; support and recovery drills remain green |
| 4. Broad | 50% | 48 hours | Both independent reviewers approve the observed canary evidence |
| 5. Default | 100% eligible projects | Ongoing | Release DRI signs the final disposition and closes no alerts by suppression |

Pause on any unexplained breach. Roll back immediately for a SEV-0/1, data-loss
signal, cross-project access, migration non-idempotency, or sustained release
budget breach. Resume at the previous completed stage only after the incident
owner records root cause, corrective evidence, and Release DRI approval.

## Observability and privacy boundary

The minimum event families required before Stage 1 are host activation,
extension activation/disposal, command outcome, bridge request outcome/latency,
persistence conflict, migration outcome, render/export outcome, and
lane-density/performance budget outcome. All of those sources are now wired
locally through the bounded `astrid:extension-operational-event` browser
boundary. This includes page-level bridge health/project/timeline discovery,
core Astrid timeline load/save, terminal
local-to-installed migration outcomes, and browser render/export completion.
Bridge reads have a fixed deadline and classify timeout, HTTP/transport, and
invalid-response failures.
Migration telemetry reports only the current host-owned extension identity,
target schema version, duration, a settings-count bucket, outcome, and a fixed
validation/write error class; settings, diagnostics, exception messages,
bundle references, and creative content never cross the event boundary. Host
activation is absent while the parent switch is closed; provider teardown
never invents an extension disposal for `host`.

Local source wiring is necessary but does not clear the production
observability gate. The authenticated analytics transport, edge ingestion,
migrations and query views that once received these events were removed
2026-10-18 (tag `pre-cloud-removal`); until a new sink exists and produces
reviewed production receipts (deployment, a distributed rate limit,
dashboard/alert wiring, an RC-revision synthetic probe, and an alert drill),
Stage 1 remains blocked. A locally captured DOM event or green source test does
not satisfy the dashboard/alert gate.

Stage evidence and rolling health are deliberately separate. The retained event
coverage matrix is keyed by exact release revision and proves which required
scenarios were exercised; a missing rare or negative event is a test-coverage
gap or `not_applicable`, not a production page. Rolling health is also keyed by
exact release revision and reports only 15-minute liveness plus
failure/degraded outcomes. During expected cohort traffic or a synthetic probe,
a missing target-revision row is `UNKNOWN/HOLD`; quiet traffic does not turn the
correct absence of a conflict or migration into an incident. Configure the
sink's authoritative `EXTENSION_OPERATIONAL_RELEASE_REVISION`; client-supplied
mismatches are rejected and must never be merged into the release rollup.

Allowed fields are deliberately bounded:

- Server-generated receipt timestamp and the bounded release/configuration
  revision.
- Reviewed extension ID/version and schema version when applicable.
- Operation name from a fixed enum; success/failure/cancelled/degraded outcome;
  and an event-compatible typed error class.
- Duration in milliseconds, a fixed count bucket, and coarse browser family.

Forbidden fields include user/account/project/timeline IDs, raw URLs or paths,
tokens, headers, cookies, prompts, transcript/caption text, media, thumbnails,
creative parameters, free-form exception messages, raw bridge/database payloads,
and arbitrary extension settings. Scrub at event construction, not only at the
dashboard. Access is least-privilege; retention and deletion follow the shortest
applicable operational policy. Observability on-call audits a sample before
Stage 1 and again before default enablement.

Every alert links to this runbook and names one primary and one backup owner.
Missing target-revision telemetry while traffic is expected, unknown error
classes, rejection spikes, or a broken dashboard blocks stage advancement.
UNKNOWN is a hold, never success; rare-family absence routes to release review
instead of paging on-call.

## Rollback

1. Declare the incident, timestamp it in UTC, appoint the Incident Commander,
   and freeze stage changes and production migrations.
2. Disable the smallest affected child flag first. Disable Runaway, then
   Foundry, then the host when scope is uncertain or shared host behavior is
   implicated. Confirm effective values from two independent reads.
3. Stop new writes for the affected surface. Do not delete records, migration
   receipts, backups, or failed payloads.
4. Capture Astrid/Astrid commits, deployment/config revisions, typed error and
   aggregate counters, database/schema/receipt versions, and hashes of affected
   artifacts without copying creative content into telemetry or the ticket.
5. Roll application code back to the last verified paired revisions. Never mix
   an old Astrid App host with an unapproved Astrid revision.
6. Run read-only health and compatibility checks, then verify representative
   existing projects, persistence after restart, and render/export.
7. If data was written or migrated, follow the recovery procedures below before
   re-enabling any flag.
8. Keep the release disabled until the Incident Commander, Release DRI, and
   relevant data/service owner sign the recovery evidence.

Feature-flag disablement is the first containment action; it is not a substitute
for code rollback, data recovery, or root-cause correction.

## Corrupt-data recovery

1. Disable the affected child flag and stop writers. Preserve the original
   record/store as read-only evidence.
2. Create the approved backup or snapshot, record its tool version and UTC time,
   and calculate hashes. Verify the backup can be read before proceeding.
3. Classify scope using schema/version/receipt metadata and typed validation
   errors. Never paste creative fields into logs or incident chat.
4. Restore the last known-good backup into an isolated recovery copy. Run the
   validator and repair tooling only on that copy, with network writes disabled.
5. Compare counts, referential integrity, source/provenance identities, receipt
   history, and artifact hashes. Run the migration twice and prove the second run
   produces no duplicate tracks, clips, captions, transitions, or typed items.
6. Have the Data Migration DRI and product-domain owner inspect the diff and
   sign a restore/repair disposition. Preserve human caption edits separately
   from transcript-source corrections.
7. Restore through the approved atomic mechanism, restart both services, and
   perform read/reload/render/export acceptance while flags remain off.
8. Re-enter rollout at Stage 1. Retain the pre-recovery snapshot until the
   incident and required compliance hold are closed.

If no verified backup or deterministic repair exists, keep the feature disabled
and escalate as SEV-0/1. Never fabricate a migration receipt, drop an unknown
field, or silently regenerate user-edited content.

## Failed-migration recovery

1. Disable Runaway and the affected writer; take a pre-recovery snapshot.
2. Inspect the immutable receipt and schema metadata to classify the migration
   as not started, rolled back, partially applied, fully applied without receipt,
   or receipt present with invalid state. Do not guess from UI appearance.
3. For any partial/ambiguous state, restore the verified pre-migration backup.
   Do not hand-edit production tables or mark the migration complete.
4. Reproduce on an isolated copy at the same Astrid/Astrid commits. Capture the
   typed failure, correct the migration at its source, and run upgrade, restart,
   reload, render/export, rollback/restore, and a second upgrade.
5. Prove receipt idempotency and zero duplicates on the second run. Compare the
   restored source/provenance and user-edit hashes with the pre-migration record.
6. Ship the corrected paired RC through this verifier and both review slots.
   Apply it under the Data Migration DRI's change window with flags off.
7. Re-enable only at Stage 1 after database, bridge, editor, and artifact evidence
   is signed. A failed rollback remains a SEV-0/1 even when the UI appears healthy.

## Severity and ownership

| Severity | Examples | Response target | Primary ownership |
| --- | --- | --- | --- |
| SEV-0 | Confirmed cross-project exposure, credential leakage, widespread irreversible data loss | Page immediately; containment starts within 5 minutes | Incident Commander + Security on-call; Release DRI and both service owners engaged |
| SEV-1 | Corruption with a viable backup, failed/duplicate migration, widespread activation/render failure, rollback failure | Acknowledge within 10 minutes; contain within 30 | Release DRI + Data Migration DRI or affected Astrid/Astrid on-call |
| SEV-2 | Limited cohort failure, sustained budget breach, recoverable persistence conflict, broken required telemetry | Acknowledge within 30 minutes; no stage advancement | Owning Astrid/Astrid team; Observability on-call for telemetry |
| SEV-3 | Cosmetic or low-impact issue with a documented workaround and no data/accessibility risk | Triage next business day | Feature owner |

The Release DRI decides rollout state and owns this runbook. Astrid App on-call owns
host, Foundry, browser, persistence, and render symptoms. Astrid on-call owns the
bridge, Runaway source, and Astrid CI symptoms. The Data Migration DRI alone
authorizes restore/migration execution. Security on-call owns privacy or access
incidents. Accessibility findings are co-owned by the Accessibility reviewer and
feature owner. Ownership transfers must name a person and acceptance timestamp;
an unacknowledged handoff does not transfer responsibility.

## Frozen-RC checklist

Complete the preparation and static-review items, then change the manifest status
from `integration` to `frozen` immediately before the blocking verifier run.
Complete every item before Stage 1. Any code, lock, manifest, gate-profile, or
paired-revision change after freezing invalidates the run and requires a new RC.

- [ ] Astrid App and Astrid worktrees are clean; the exact `HEAD` commits and expected
  branches/tags are recorded in the RC evidence.
- [ ] `config/releases/extension-ship-quality.json`, the lockfiles, Node/npm
  versions, Astrid Python/tool lock, browser versions, and flag mapping are frozen.
- [ ] `npm run verify:extension-ship -- --plan` was independently reviewed and
  contains no skipped, mutable, or operator-injected command.
- [ ] The blocking verifier passed from fresh checkouts and its full log, exit
  status, timestamps, and artifact hashes are retained.
- [ ] Migrate-twice, restart, persistence, corrupt/future schema, failed migration,
  rollback/restore, and duplicate-prevention evidence is green.
- [ ] Real-browser extension invocation/edit/reload/restart and render/export
  evidence is green with zero unexpected console/page/runtime errors.
- [ ] Compatibility, accessibility, browser/device, 500/5,000/50,000 density,
  performance/resource, visual, failure/recovery, and security budgets are green.
- [ ] All three production flags default off; targeting and emergency-disable
  access were tested by the on-call operators.
- [ ] Privacy-safe dashboards and alerts were inspected with real RC event shapes;
  missing/unknown telemetry fails an alert test.
- [ ] A restorable backup exists; code/flag rollback and migration recovery were
  rehearsed against the pinned pair.
- [ ] Release notes, known limitations, migration instructions, support macros,
  owners, escalation paths, and customer-impact wording are approved.
- [ ] Both independent review evidence slots and the human acceptance protocol
  below are complete. No open SEV-0/1 or undispositioned release blocker remains.

## Independent review evidence

The reviewers must be independent of each other and may not approve a lane they
authored. Each works from a fresh checkout, inspects raw evidence and hashes, and
records a signed approve/reject disposition. A link to a chat summary alone is
not evidence.

### Review slot A — release and systems

| Field | Required evidence |
| --- | --- |
| Reviewer / team | _Pending_ |
| Independence statement | _Pending: work authored and conflicts disclosed_ |
| Astrid App commit / Astrid commit | _Pending_ |
| Verifier log, exit, UTC time, artifact index hash | _Pending_ |
| Scope inspected | _Pending: gates, clean-machine reproduction, rollout, observability, rollback_ |
| Findings and owner dispositions | _Pending_ |
| Decision / signature / UTC timestamp | _Pending: APPROVE or REJECT_ |

### Review slot B — data and human outcomes

| Field | Required evidence |
| --- | --- |
| Reviewer / team | _Pending_ |
| Independence statement | _Pending: work authored and conflicts disclosed_ |
| Astrid App commit / Astrid commit | _Pending_ |
| Recovery/migration and acceptance evidence hashes | _Pending_ |
| Scope inspected | _Pending: persistence, corrupt data, migration, transcript policy, accessibility, render output_ |
| Findings and owner dispositions | _Pending_ |
| Decision / signature / UTC timestamp | _Pending: APPROVE or REJECT_ |

## Human acceptance protocol

Automated tests and agent reviews do not satisfy this protocol. Recruit at least
one real participant for each persona: working video editor, accessibility user,
transcript/caption specialist, and first-time extension author. A person may fill
only one review slot for a given RC.

1. Use consented, non-sensitive representative projects and the frozen paired RC.
   Record persona, environment, assistive technology/input method, browser/device,
   project fixture ID (not a production project ID), and exact commits.
2. Give task goals rather than click-by-click instructions: enable the relevant
   feature, invoke extensions, edit and preserve results, navigate dense lanes,
   reload/restart, recover an intentional safe failure, and render/export.
3. For the transcript specialist, cover regenerate/preserve/accept, split, merge,
   delete, retime, overlapping speakers, empty text, Unicode, and the boundary
   between human caption edits and transcript-source correction.
4. For the accessibility participant, include keyboard-only flow, focus retention,
   names/state announcements, 200% zoom, reduced motion, and error recovery.
5. For the first-time author, use only shipped public docs/SDK. Record every private
   import, undocumented assumption, unsafe default, or missing diagnostic as a
   finding rather than coaching around it.
6. Capture task outcome, time, structured observation, participant rating,
   accessibility barriers, persisted-state comparison, render/export hashes, and
   privacy-safe screenshots. Do not record faces, voices, transcript text, media,
   or free-form creative content without explicit consent and approved storage.
7. Assign every finding a severity, owner, due date, and fixed/accepted/rejected
   disposition. Only the Release DRI plus the affected persona reviewer may accept
   a non-blocking limitation. SEV-0/1, data loss, inaccessible core flow, or a task
   failure is never accepted for this release.
8. Repeat the failed task on the corrected RC. All four persona dispositions,
   evidence hashes, and UTC signatures must be present before Stage 1.

Human acceptance passes only when every participant completes the core journey,
persisted and rendered outcomes match expectations after restart, no release
blocker remains, and both independent reviewers accept the collected evidence.

## Evidence ledger

The ship-quality checklist ([section 5 of the release checklist](../video-editor/extension-platform-release-checklist.md#5-ship-quality-checklist))
is intentionally separate from the extension-platform contract checklist rows
in section 2 of the same file. The former is a product release gate; the
latter proves narrower SDK and host contracts. A green contract checklist must
never be presented as a green ship-quality release.

The machine-readable release ledger is
[`config/releases/extension-ship-evidence.json`](../../config/releases/extension-ship-evidence.json).
Its 23 entries are derived, in order, from the numbered `###` headings in
[section 5 of the release checklist](../video-editor/extension-platform-release-checklist.md#5-ship-quality-checklist).

Run the structural audit while integration is in progress:

```sh
npm run check:extension-ship-evidence
```

Run the fail-closed release gate only for a frozen candidate:

```sh
npm run check:extension-ship-evidence:release
```

The audit exits successfully when the ledger structure is sound and every
claimed `pass` has valid receipts. It still prints every open workstream. The
release gate requires 23/23 `pass`, frozen Astrid App and Astrid commits, and evidence
receipts bound to those exact candidate commits.

### Candidate and evidence controller

The Astrid App candidate commit (`C`) is the immutable product/source revision. The
annotated tag named by the release manifest and `ASTRID_APP_REF` must both resolve
exactly to `C`. The candidate ledger is still `integration` and leaves
`candidate.appCommit` null because a tracked file cannot contain the hash of
the commit that contains it.

Release evidence is finalized in a clean controller commit (`H`) that is a
strict descendant of `C`. The verifier examines every parent edge in `C..H`, so
a forbidden edit is still rejected if a later commit reverts it. Every changed
path must be one of this code-owned allowlist:

- `config/releases/extension-ship-evidence.json`, for the frozen disposition,
  candidate pins, workstream statuses, blockers, and receipts;
- `config/releases/extension-ship-quality.json`, where the only permitted
  semantic change is exactly `status: integration` to `status: frozen`; or
- `docs/extensions/ship-evidence/releases/<release>/`, the release-specific root for
  committed evidence artifacts.

No source, script, package/lock file, runbook, checklist, or other configuration
may change after `C`. Prefix lookalikes, deletions, renames that touch a path
outside the allowlist, outside-history merge parents, symlinks, gitlinks, and
executable evidence blobs fail closed. Allowed files must be committed ordinary
blobs. Freeze code, scripts, documentation, pins, and gate inventory before
creating the candidate tag; after it, commit only the evidence closure above.

### Receipt contract

Every passed workstream needs at least one receipt of the code-owned evidence
kind required by the gate. Each receipt records:

- a globally unique ID and evidence kind;
- `astrid` or `astrid` plus the exact 40-character commit;
- an exact UTC capture time;
- the command or human action and either exit code zero or an explicit signed
  approval;
- a non-secret environment identity and exact tool versions; and
- a repository-relative evidence artifact plus its SHA-256.

The gate resolves the artifact without following an escape outside the
repository and recomputes its hash from both the worktree and committed `H`
blob. Any edited, uncommitted, missing, external, symlinked, executable, or
non-zero receipt fails. In release mode, every receipt commit must equal the
frozen paired candidate (`C` for Astrid App), never the evidence controller `H`.

Human acceptance cannot be replaced by agent or browser automation. Workstream
22 requires four separately identified receipts: working video editor,
accessibility user, transcript specialist, and first-time extension author.
Workstream 23 requires two distinct independent reviewer approvals.

Workstreams 10 and 19–23 additionally require typed JSON external evidence.
The receipt kind and a generic log are not sufficient. The checker parses the
artifact, binds its release and both candidate commits to the ledger, rejects
unknown fields, verifies nested evidence references, and requires a different
top-level artifact path for every external receipt. Its workstream semantics
are fail closed:

| Workstream | Typed evidence required for `pass` |
| --- | --- |
| 10 | Exact transcript handoff, source owner, source/returned revisions, handoff fingerprint, applied-source fingerprint, owner acknowledgement, and the complete policy-case result set |
| 19 | One rollout stage, two independent reads agreeing on effective flags and route, named owners, and a passing emergency-disable or route-change drill |
| 20 | Production revision probe, all event families, revision-filtered dashboard evidence, distributed rate-limit exercise, four alert drills, and privacy audit |
| 21 | Separate rapid-disable/rollback, corrupt-data, and failed-migration drills, each with backup, pre/backup/restored/post hashes, chronological timeline, three owner approvals, and recovery outcomes |
| 22 | Four separate session documents, one per required persona, bound to each signing principal and containing consent, tasks, persistence, render/export, privacy, findings, and disposition |
| 23 | Separate review documents for slots A and B, each bound to its signing principal and containing independence/conflict disclosure, scope, findings, disposition, evidence-index hash, inspected artifact hashes, and reproduction checks |

The versioned, deliberately incomplete templates are under
[`config/releases/extension-external-evidence/v1/templates/`](../../config/releases/extension-external-evidence/v1/templates/).
They are drafts, never evidence. The closed-object validator is
[`extension-external-evidence.mjs`](../../scripts/quality/lib/extension-external-evidence.mjs).

### External-evidence operator flow

The operator CLI never accepts a private key and never marks a workstream
`pass`. Initialize a draft outside the evidence closure:

For each run, set `RELEASE_ID` to `release` and `NODE_VERSION` to
`verification.node` from `config/releases/extension-ship-quality.json`; use
those values below. Do not copy an RC number or tool version from an older run.

```sh
npm run extension:evidence -- init \
  --type rollout-stage --output /tmp/rollout-stage.json \
  --release "$RELEASE_ID" \
  --app-commit <candidate-C> --astrid-commit <astrid-commit> \
  --environment production-stage-0 --tool "node=$NODE_VERSION"
```

Fill the draft only from observed output. Validate it, then capture an immutable
copy under the release evidence root; `capture` refuses to overwrite a file:

```sh
npm run extension:evidence -- validate --artifact /tmp/rollout-stage.json
npm run extension:evidence -- capture \
  --input /tmp/rollout-stage.json \
  --output "docs/extensions/ship-evidence/releases/$RELEASE_ID/rollout/stage-0.json"
```

Generate the unsigned receipt for review, or append it without changing status:

```sh
npm run extension:evidence -- receipt \
  --artifact "docs/extensions/ship-evidence/releases/$RELEASE_ID/rollout/stage-0.json" \
  --workstream 19 --id rollout-stage-0

npm run extension:evidence -- receipt \
  --artifact "docs/extensions/ship-evidence/releases/$RELEASE_ID/rollout/stage-0.json" \
  --workstream 19 --id rollout-stage-0 --append-ledger
```

Use `hash --artifact <path>` for any supporting file. Human/review receipts
remain unsigned until the participant runs the separate signing helper.

Do not mark a row `pass` merely because a test or document exists. Capture the
actual output, hash it, disposition failures, and only then attach the receipt.

## Release phases

This is the execution plan from the stable integration branch to a signed,
frozen extension release candidate. The detailed requirements are in the
[ship-quality checklist](../video-editor/extension-platform-release-checklist.md#5-ship-quality-checklist),
the executable operator procedure is the rest of this runbook, and formal
claims are owned by the [evidence ledger](#evidence-ledger) section.

### Current disposition

The release manifest is the source of truth for the current cycle's release ID,
annotated tag, Astrid commit, branch pins, and verification toolchain. During
integration, resolve the moving Astrid App synchronization head with `git rev-parse
HEAD`; do not copy a branch SHA into a receipt before the source freeze. The
paired Astrid checkout must be clean, on the manifest-configured branch, and at
the exact manifest-configured commit with a clean hermetic `make ci` proof.

Previously tagged candidates and their evidence remain immutable historical
inputs; they must never be moved, reused, or relabelled for the current cycle.
Failed rehearsal roots are preserved as diagnostic history, not passing
receipts. A source sequence fix restarts the affected evidence phase, and the
ledger advances only through receipts bound to the manifest's current release
ID and exact candidate/controller pair.

The integration line has landed deterministic Runaway timing, clip-body selection,
Suspense/bridge-stub contracts, runtime-isolated ports and CAS fixture resets,
proxy Origin/Host/auth/protocol boundaries, strict-port plus nonce/commit
readiness, tracked-evidence protection, and exact visual-baseline provenance.
Native-tool attestation, crash-safe bounded-command/paired-server containment,
managed-media seeding, exact runtime resolution, owned-origin Remotion CORS,
and JSON task-output boolean normalization are now on the pushed pair. The
current integration head has diagnostics across the static, browser, resource,
render, and paired-bridge lanes. Counts, screenshots, and local browser results
from an integration head are useful planning signals only; they are not release
receipts. Recompute them from fresh clean trees after the manifest's source
sequence is reviewed, and bind the resulting evidence to candidate `C`,
controller `H`, the manifest release ID, Astrid commit, toolchain, and
dependency locks.

### Phase 1 — publish and lock the integration baseline

1. Keep the pushed process-containment and native-tool-attestation checkpoints
   intact; keep `artifacts/` and Playwright output outside the tracked release
   tree.
2. Require review of the candidate code commits through the production startup-budget
   gate. Do not add feature work to this branch after the evidence rehearsal
   begins; fixes discovered by a gate receive a focused commit and restart the
   affected evidence phase.
3. Keep the exact manifest-pinned Astrid revision; the previously reviewed
   security, renderer, local-auth, and bridge-hardening fixes must all be
   present before a candidate tag is created.

Exit: the reviewed integration sequence is ready to be materialized as a fresh
clean candidate; the release plan commands remain deterministic. Remote/local
branch synchronization is recorded separately from candidate identity.

### Phase 2 — recover disk and run exact-pair evidence rehearsals

1. Confirm at least 11 GiB free with `df -h /System/Volumes/Data`. Removing only
   orphaned task-owned pytest and Astrid temporary roots restored roughly
   12 GiB free without touching user caches, Playwright, active Chrome data,
   release worktrees, or live release servers. The current margin above the
   enforced floor is small, so recheck it before and after every heavyweight
   phase and remove only verified task-owned residue.
2. Use fresh clean worktrees at the exact Astrid App candidate computed after native
   attestation and the pinned Astrid commit. Run the individual local release
   gates, complete unit suites,
   production build, three-engine browser/device/accessibility suites, visual
   baseline provenance, container rollback, and the three-products journey.
3. Retain complete logs, canonical database/state hashes, the decoded MP4 and
   every-frame report, screenshots, rollback hashes, dependency inventories,
   native-tool/platform attestation, and the detached artifact-index hash.
   Rerun any failing phase after its root fix; do not waive a shipped-path
   failure. Evidence paths are add-once: a rerun uses a new untracked root and
   a correction gets a new receipt/path rather than overwriting a captured one.

Exit: the exact pair completes every locally executable gate with a clean tree,
no unexpected errors, reproducible persisted state, and retained hash-addressed
evidence.

Every external command is bounded by a phase budget and writes timeout
diagnostics. Detached server groups receive TERM and up to five seconds to
exit, then KILL and another five seconds; readiness failure reaps the complete
group even when the child handle has not yet been returned. Native attestation
resolves and byte-hashes `ffmpeg`, `ffprobe`, `tesseract`, and ImageMagick,
checks exact version/build identity and Tesseract `eng.traineddata`, and pins
the host platform before dependency provisioning. The standalone path records
that no container was used.

### Phase 3 — close environment and product-owner gates

1. Install/authorize Edge or record a release-owner exception; execute physical
   touch, trackpad, Retina, slower-device, screen-reader, and sustained
   typography sessions.
2. Connect a real upstream transcript owner and prove that an accepted handoff
   advances to `acknowledged-by-source-owner` only for the exact fingerprint,
   returned revision, owner, and applied-source fingerprint.
3. Supply a production deployment target and access. Deploy Stage 0 with all
   extension flags dark, configure cohort routing, distributed rate limiting,
   dashboards, alerts, and named on-call owners, then perform disable, bridge
   outage, failed migration, corrupt data, and restore drills.
4. Complete four distinct human sessions: video editor, accessibility user,
   transcript specialist, and first-time extension author. Resolve every
   release-blocking finding.

Exit: production drills are captured, the upstream acknowledgement is proven,
and all four human personas have signed receipts. The paired caption path is
now machine-proven; general SDK caption semantics and Caption Safe-Zone
Orchestra's text/layout/contrast/media acceptance remain limited and must not
be represented as a broader semantic-caption guarantee. The cloud backend was
removed from the App entirely on 2026-10-18 (tag `pre-cloud-removal`), so the
earlier restriction on ordinary cloud or legacy routes no longer applies.

### Phase 4 — independent review and frozen RC

1. Register six authenticated Ed25519 principals: the four human personas and
   two independent reviewers. Keep private keys outside the repository.
2. Freeze product candidate `C`, create the annotated tag named by
   `astrid.releaseTag` in the manifest, and permit only evidence/ledger/status
   commits in controller history `C..H`.
3. Bind every receipt and artifact hash to the exact Astrid App candidate, controller
   commit, annotated tag object, Astrid commit, toolchain, and dependency locks.
4. Have both independent reviewers reproduce the evidence, verify rollback,
   sign their dispositions, and advance the ledger only when all 23 workstreams
   are genuinely supported.
5. Run `npm run verify:extension-ship` from the clean controller commit. Any
   source fix invalidates the freeze and starts again from Phase 2.

Exit: the immutable verifier exits zero, the evidence ledger reports 23/23,
both reviewers approve, rollback is proven, and the Release DRI signs the final
disposition.

### Inputs still required from the owner

- The surveyed Codex Sparkle update cache at
  `~/Library/Caches/com.openai.codex/org.sparkle-project.Sparkle` is only
  2.8 MiB, not 2.7 GiB, and is not a useful recovery target. Before each
  heavyweight frozen-gate phase, run `df -h /System/Volumes/Data` and require
  at least 11 GiB free. Additional cache cleanup permission may be needed if
  that fresh check remains below the floor; remove only verified task-owned
  residue.
- Production target/access plus observability and on-call owners.
- Edge/physical-device availability or an explicit release exception.
- A real upstream transcript owner for the exact-fingerprint acknowledgement.
- Four human participants and two independent reviewers, with their Ed25519
  public identities.
