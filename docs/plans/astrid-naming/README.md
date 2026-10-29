# Astrid naming: execution plan

Status: ready to execute (v3). v2 folded in the simplicity review. v3 adds what trips a mediocre manager or worker, found by dry runs (a Luna manager, Luna workers on N-TOOL, C-APP and C-MIGRATE, and a Sol lead on N-MAP), switches the models to Codex, and adds up to five review rounds at the end (V-REVIEW). Re-checked 2026-10-17 against `main` of Astrid `84a14f11`, Runtime `569412c`, App `a45e28422`. Counts in this plan are from that date. Workers re-grep; they never trust a count. Evidence tables are in [inventory.md](inventory.md); every old-name token is in [old-tokens.txt](old-tokens.txt) and the 79 collisions in [collisions.tsv](collisions.tsv).

This plan renames the three Astrid repositories and every name derived from the old ones. `peteromallet/Astrid-agent` becomes `peteromallet/astrid-agent`. `banodoco/reigh-app` becomes `banodoco/astrid-app`. `banodoco/banodoco-workspace-runtime` becomes `banodoco/astrid-runtime`. In code, "Reigh" becomes "Astrid" (or "App" where both exist), and "Banodoco" as a product name for the Runtime becomes "Astrid Runtime".

## Summary

- **Security fix first.** A third party now holds `reigh.art` (created 2026-09-23, 302-redirects to an unrelated domain), and the App still sends users there (README, the allowed preview hosts, and every LoRA README the `huggingface-upload` function writes). Removing every `reigh.art`, `reigh.ai` and `reigh.app` reference is the first PR of Phase 0 (D-APP, step 1). It does not wait for the rename.
- **23 tasks:** 1 XHARD (N-MAP), 1 review (V-REVIEW), 16 normal, 5 human. Plus one standalone follow-up (F-WINDOW) that needs neither the plan nor its tools.
- **Lifetime: about 4 days**, then the plan and its tools are deleted (P-FINAL). The only thing left afterwards is the three-line follow-up F-WINDOW, about 30 days after deploy.
- **Shape.** Phase 0 lands every pure deletion on `main` as ordinary PRs and renames the GitHub repos, while the tools and the map are built and rehearsed on throwaway copies. Phase 1 is a short freeze: the Runtime lands first on its own, then Astrid and the App pin its merged SHA once. Phase 2 cleans up local tooling, R4 docs and satellites. Phase 3 is up to five Astra review rounds looking for gaps. Then the plan is deleted.
- **R4 is in flight.** On 17 Oct Codex pushed `codex/handover/timeline-r4-*` branches to all three repos (Astrid 422 commits ahead of `main`, about 120k added lines; App 186, about 41k; Runtime 72, about 28k). R4 does not have to stop. Each R4 integration branch catches up with the tested recipe in section 4.5. A test on the real R4 branches found zero conflicts caused by the rename and zero old names left. The only conflicts were the ones R4 already has with `main` (38, 44 and 17).
- **No data migrations except one.** No Runtime realm migration (a byte census on every machine confirms it is not needed). One small browser-storage copier in the App. One forward Supabase migration.

**Clean-break rule.** No aliases, shims, dual reads, fallback env vars, re-exports or compatibility periods. After cutover no file in any repo contains an old name. The only exceptions are the temporary browser migration module (and its test) and this plan, both deleted later.

**Complexity verdict.** Moderate: big but mostly mechanical. A script does the bulk; the hard parts are the name map and lockstep cross-repo names.

The plan names the old names, so it is itself residue. P-FINAL deletes it.

## Contents

1. Names and 2. Scope: what counts as an old name
3. How hard is this? (verdict, hard parts, effort, "Complexity you might be missing")
4. Approach
5. Mapping rules
6. Sequencing and the cutover window
7. How to run this (models, workspace, sandbox, day-one questions, briefing, stop rules, status)
8. Tasks (Phase 0 prep, Phase 1 cutover, Phase 2 after, Phase 3 review rounds, the standalone follow-up)
9. Human checklist
10. Done when
11. Decided defaults and open questions

---

## 1. Names

| Today | New | Note |
|---|---|---|
| `peteromallet/Astrid-agent` (the old `peteromallet/Astrid` already redirects to it) | `peteromallet/astrid-agent` | Case-only change, for family consistency. `https://github.com/peteromallet/astrid-agent` already returns 200. Moving it into the `banodoco` org is the owners' call and out of scope. |
| `banodoco/reigh-app` | `banodoco/astrid-app` | |
| `banodoco/banodoco-workspace-runtime` | `banodoco/astrid-runtime` | |

**Why `astrid-runtime` and not `astrid-workspace-runtime`.**
- No recorded reason for "workspace" exists. The earlier Codex plan (10 to 11 Oct) proposed `astrid-workspace-runtime`, but its rationale was never written down. The only hint is the seed commit `ba511c4f79` calling it a "neutral workspace runtime for Astrid and Reigh".
- "Workspace" meant the Runtime was neutral between two products. Reigh is now the Astrid App, so that no longer motivates the repo name.
- The user-facing command is already `astrid-runtime`. Runtime `pyproject.toml:15` maps it to the launcher, and Astrid runs `astrid-runtime up` (`astrid/setup.py:291`).
- The neutral protocol keeps its names: `workspace.v1`, `WorkspaceClient`, `runtime_protocol`, `/v1/` routes. Only product packaging changes: distributions, launcher package, client packages, CLI, env vars, support folder.
- The Runtime's neutrality tests do not stop this. `tests/test_contract_fixtures.py:13` scans only `conformance/fixtures/*.json` and `:60` scans only `conformance/fake-second-product.ts`. Neither reads `pyproject.toml`, `README.md` or package names (verified). The `forbidden_symbols` line in `conformance/second-client-core-v1.yaml:7` is documentation and is not enforced. The Runtime `README.md` already says "Astrid" and "REIGH" (lines 3, 11, 12, 96), so N-MAP and C-RT must keep that sentence true: the protocol and fixtures stay product-free, the packaging may say Astrid.

**Why `astrid-agent` and not `astrid`.** The repo holds the `astrid` Python package and CLI, but also `scripts/`, `planning/`, `remotion/` and docs. The GitHub URL is already `Astrid-agent`, and `docs/setup/release-recipe.md` calls it the "Astrid client/toolkit". The inside names (package `astrid`, CLI `astrid`) do not change, so `astrid-agent` costs one case change and avoids a second rename.

## 2. Scope: what counts as an old name

**Old (the zero check fails on these, case-insensitive unless noted):**
- `reigh` in any case and any position (`Reigh`, `REIGH`, `ReighExtension`, `useReighShotsHost`, `reigh_live_scene_request`).
- `banodoco-workspace-runtime`, `banodoco-workspace-client`, `banodoco_workspace` (covers `banodoco_workspace_client` and `banodoco_workspace_runtime`).
- `banodoco_local`, `banodoco-local`, `banodoco-runtime`.
- Env vars containing `BANODOCO_`, **matched case-sensitively**, including `ASTRID_BANODOCO_*`. Lowercase `banodoco_schema`, `banodoco_timeline_schema`, `banodoco_config`, `banodoco_root`, `banodoco_composer`, `banodoco_worker`, `banodoco_catalog`, `banodoco_social` are not env vars and are not old (about 570 lines in Astrid).
- `@banodoco/workspace-client`.
- `Application Support/Banodoco`, `Banodoco Workspace`. Two hits in `astrid/core/timeline/banodoco_schema.py` (lines 6 and 89) mean the community repo, not the Runtime: N-MAP maps those two by hand.
- `peteromallet/Astrid` not followed by `-agent`, and, case-sensitively, `/Astrid-agent` with a capital A (so the six lines that must become `astrid-agent` cannot survive the final check).
- The bare key `workspace-runtime` used as a repo name (App `scripts/quality/lib/astrid-contract-schema.mjs:10`). N-MAP decides each hit; protocol names such as `WORKSPACE_RUNTIME_URL` are not repo names.
- The domains `reigh.art`, `reigh.ai`, `reigh.app` (covered by `reigh`; named here because they are a security matter, see the Summary).
- **"Banodoco" as the Runtime's product name**, which the patterns above miss: the prose forms `banodoco[ _-](runtime|local)` in any case ("the Banodoco runtime", "Banodoco local"), and every other bare `banodoco` that N-MAP classifies as the Runtime product. On 17 Oct, 160 distinct bare-`banodoco` tokens in the three repos were neither a kept form below nor matched by a pattern above. Examples: `x-banodoco-schema-owner`, `banodoco.candidate-core.v1`, `//banodoco.dev/workspace/v1/...`, `enqueueBanodocoRenderTimeline`, `delegateToBanodocoAgent`, `worker-banodoco`, and 114 standalone uses of the word "Banodoco". N-MAP classifies each one. It is either the community or org name (kept, listed in `kept-banodoco.txt`) or the Runtime product (renamed through the map).
- **Stutter** created by the rename itself, for example `ASTRID_REIGH_CHECKOUT` becoming `ASTRID_ASTRID_CHECKOUT`, `com.reigh.astrid-runaway-timeline` becoming `haus.astrid.astrid-runaway-timeline`, or `REIGH_APP_CHECKOUT` becoming `ASTRID_APP_APP_CHECKOUT`. Found on 17 Oct: `ASTRID_REIGH_*` (6 names in the App), `com.reigh.astrid*` (about 80 lines), `astrid-reigh-*`, `reigh-astrid-*`, `REIGH_APP_*`. `rename.py --report-merges` flags every new `astrid…astrid` or `app…app` token (section 4.2).

**Not old (the zero check must not flag these):**
- The GitHub org `banodoco` in URLs of repos that keep their names: `banodoco-workspace`, `timeline-composition`, `timeline-schema`, `timeline-theme-2rp`, `hivemind`, `runpod-lifecycle`, `Wan2GP`, `Banodoco-website`, `ArtAgents`.
- The `@banodoco/timeline-*` package scope, and `banodoco-timeline-schema` (`astrid/pyproject.toml:53`).
- The Banodoco community, `public/banodoco-gold.png`, and the `banodoco-workspace` repo name (the community workspace, live: Astrid imports `banodoco_social` from it).
- Files such as `astrid/core/timeline/banodoco_schema.py` and `executor/banodoco_catalog.py`: a bare `banodoco` is not an old name. Their env vars (`ASTRID_BANODOCO_*`) are renamed; the module names stay. See Open questions.
- `astrid.haus`: already the new domain.

The zero check therefore uses exact patterns plus one strict rule: a bare `banodoco` passes only where it matches a kept form in `kept-banodoco.txt` (section 4.3). An unclassified use fails instead of slipping through.

## 3. How hard is this?

**Verdict: moderate. Big but mostly mechanical.** About 13k old-name lines and about 2,600 distinct tokens across the three repos (App 5,193 lines in 957 files; Astrid 5,597 in about 698, of which 4,333 are history; Runtime 24 `reigh` lines plus about 400 `banodoco`), plus the satellites. The history part is deleted in Phase 0 before any rename runs.

**The genuinely hard parts**
1. "Reigh" and "Astrid" are today two different things. A blanket `reigh` to `astrid` makes 79 tokens collide with names that already exist (`reighCommit` next to `astridCommit`, `REIGH_ROOT` next to `ASTRID_ROOT`). The same happens in prose: 147 files name both products (App 108, Astrid 35, Runtime 4), and about 200 lines say things like "Treat Astrid and Reigh as peer clients", which a blanket rename turns into "Astrid and Astrid". This is the one XHARD task (N-MAP).
2. "Banodoco" is both the community name (kept) and the Runtime's old product name (renamed), and 160 bare-`banodoco` tokens need a decision (section 2). Also N-MAP.
3. Lockstep cross-repo wire names and three generated copies of one client.
4. Escaped and regex forms of the extension-id prefix that a plain token row misses.
5. Deployed infra and secrets, in the right order (the App's build bakes in a `VITE_` variable, and Railway deploys on merge).
6. Satellite repos and CI pins.
7. R4 is being written at the same time (section 4.5).
8. The plan and its tools must disappear at the end.

**Effort (agent time unless stated)**

| Block | Estimate |
|---|---|
| Phase 0 prep, all tasks in parallel | about 1 day |
| Cutover window (freeze, apply, land, deploy, migrate) | hours to 1 day |
| Phase 2 cleanup | under 1 day |
| Phase 3 review rounds (up to five) and P-FINAL | hours to 1 day |
| Human time | 1 to 2 hours (GitHub, Supabase, Railway, secrets) |
| Waiting | none for the plan. F-WINDOW is a standalone follow-up about 30 days after deploy. |

The plan lives about 4 days.

### Complexity you might be missing

- **Satellite repos.** `reigh-worker` is still fetched by Astrid CI jobs `m7-release-candidate` and `python` at `efc2276d`, and `tests/integrations/test_c12_cpu_runtime_harness.py` imports its code. `m7-release-candidate` gates `m8-publication`. `reigh-worker-orchestrator`, `reigh-workspace` and `banodoco-workspace` also carry or are referenced by old names. (N-SAT)
- **"Banodoco" is the Runtime's product name well beyond the repo name.** Env vars (`BANODOCO_LOCAL_*`, `BANODOCO_RUNTIME_*`, `ASTRID_BANODOCO_*`: 27 names), the support folder, the launcher package `banodoco_local` (12 files), three client packages, two console scripts, and 418 `banodoco` lines in the Runtime.
- **Browser data and the same-origin constraint.** About 20 localStorage keys and 5 IndexedDB databases. Code on a new origin cannot read them. This project therefore must not change the App's origin.
- **Extension ids.** `com.reigh.*` (about 150 literals) becomes `haus.astrid.*`. The id appears in plain form, in three escaped regex forms and in a Supabase CHECK constraint. A plain row misses the escaped forms and the result is silent: the client drops every analytics event and the edge validator rejects them (gap E3, handled by N-MAP).
- **The live film stack.** `astrid-local/live-main/env.sh` points the Runtime at the 1.4 GB film realm through `BANODOCO_LOCAL_DATA_ROOT`. Renamed code ignores that variable and would fall back to the default support folder and an empty realm. The env file and the code must switch in one step (C-MIGRATE M4).
- **Agent-facing names.** The wire tags `<reigh_live_scene_request>`, and skill text under `~/.local/state/astrid/skills`. The 22 retired capability ids `reigh.*` are deleted, not renamed (D-AS).
- **Local folders and agent configs.** `astrid-local/reigh-app`, `~/.codex/config.toml` trust keys, Hivemind scripts, review-tooling scripts.
- **R4 docs and Otto records.** About 90 old-name lines in R4 planning docs, which R4 workers will read.
- **Generated and digest-bound artifacts.** `SCHEMA_DIGEST`, pinned digests in the parity test and in the App's `client.test.ts:384`, the capability census lock, and the registry hash in `release_identity.py`.
- **A tracked build artifact.** `banodoco_workspace_runtime.egg-info/` (5 files) is tracked in the Runtime.
- **Content-hash gates.** The App's `scripts/quality/check-astrid-contract-freeze.mjs` checks the SHA-256 of every source file listed under `sourceEvidence` in `config/contracts/astrid-plan-a-c1.json` and `c2.json`, then a canonical digest of each contract (`:60-62`, `:79-80`, `:95`). Renaming those sources breaks every hash. C-APP re-hashes them with the checker's own exported `computeContractDigest`.
- **Pinned old commits.** The App's `scripts/astrid-landing/prepare.py:20-22` pins `ASTRID_COMMIT` and `APP_COMMIT` (25 Sep) plus git blob ids, and builds output from those old blobs. No script, Makefile or workflow runs it (only a doc mentions it). D-APP deletes it as a finished release pipeline unless a reader turns up.
- **The film's own launcher.** The App's `scripts/dev-local-workspace.mjs:23-28` attaches to `../Astrid/.astrid-data/runtime/discovery.json` when it exists. Run from `astrid-local/`, a test would therefore attach to the film's realm. Every test run in this plan uses fresh clones under `$WORK` (section 7.1).
- **The plan's own deletion.**
- **Hivemind knowledge content** probably mentions Reigh. Out of scope beyond its scripts. Flagged in Open questions.

## 4. Approach

### 4.1 The map is data
One machine-readable file, `tools/astrid-rename/rename-map.tsv` (in the Astrid repo), maps old to new for contents and paths. N-MAP produces it with every collision resolved by hand. Workers never invent names. A missing name is a change to the map, made by the map owner only (7.7).

**Format.** Tab-separated, one header row: `kind`, `old`, `new`, `scope`, `note`.

| `kind` | Meaning |
|---|---|
| `token` | Exact literal, case-sensitive. |
| `word` | Like `token`, plus generated case variants: lower to lower, Title to Title, UPPER to UPPER. Other casings of the old word are reported, not replaced. Used only for last-resort rows such as `reigh` to `astrid`. |
| `regex` | A Python `re` pattern in `old` (written exactly as Python should read it, no extra escaping) and a replacement in `new` (`\1` groups allowed). Used for escaped forms and for context, such as "only inside a URL". |
| `prose` | A whole product word. It matches only where neither side touches a letter, digit, `_`, `-`, `.` or `/`. So `Reigh's` and `Reigh and` match; `Reigh-app`, `ReighExtension` and `com.reigh.` do not. |
| `path` | A file or directory path. The file moves, and the same string is also replaced in contents. |

**Scope.** One of:
- `all`;
- a repo (`astrid`, `runtime`, `app`);
- `<repo>:<glob>` for named files only, for example `app:scripts/quality/lib/astrid-contract-schema.mjs`;
- for `prose` rows only, `mixed`: the files that contain the whole word `Astrid` before the rename.

**Precedence, in one pass per file.** Rows are sorted by:
1. kind group: `regex` first, then `path`, then all others;
2. longer `old` first;
3. narrower scope first (a file glob, then a repo, then `all`, then `mixed`).

The first matching row wins at each position. Replaced text is never matched again. All patterns, here and in `check-zero`, use Python `re` syntax.

```
kind	old	new	scope	note
token	reighCommit	appCommit	all	collision: astridCommit exists
token	REIGH_ROOT	ASTRID_APP_ROOT	all	collision: ASTRID_ROOT exists
path	src/tools/video-editor/adapters/reigh/	src/tools/video-editor/adapters/app/	app	collision rule
prose	Reigh	Astrid App	mixed	file also names Astrid (rule 4)
prose	Reigh	Astrid	all	rule 4
word	reigh	astrid	all	last resort, after every collision row
```

N-MAP also owns these files beside the map:
- `map-notes.md`: every judgment call, and every token kept or deleted, with its reason.
- `intended-merges.txt`: one accepted merge per line, `new<TAB>old1,old2<TAB>reason`. Read by `rename.py --report-merges --intended`.
- `kept-banodoco.txt`: one Python regex per line for each kept bare-`banodoco` form (for example `github\.com/banodoco/(?!reigh|banodoco-workspace-runtime)`, `@banodoco/timeline-`, `banodoco_social`), with a `# reason` comment. Read by `check-zero`.
- `map_selfcheck.py`: the mechanical checks in N-MAP's acceptance.

### 4.2 `rename.py`
`tools/astrid-rename/rename.py (--repo <path> | --path <file-or-dir>... [--as <repo>] | --text [--as <repo>]) [--apply] [--report-merges --repos <path>... [--intended <file>]]`

Each repo is named `astrid`, `runtime` or `app` from its `origin` URL, old or new. `--as` names the repo for `--path` and `--text`. Without `--as`, only `all` and `mixed` rows apply. Both scripts are executable Python files with a `#!/usr/bin/env python3` line.

- **`--repo <path>`.** The file list comes from `git ls-files`, which only reads `.git`. Moves are plain file moves, **never `git mv`**, so the script runs inside a Codex sandbox where `.git` is read-only. Whoever commits stages with `git add -A`, and git detects the renames.
- **`--path`.** Files or directories without git, walked recursively, skipping `.git/`. Used for P-LOCAL, P-R4 and the satellite scrubs, so those are not hand edits either.
- **`--text`.** Reads stdin and writes the renamed text to stdout. Used to map baseline test ids (7.8) and for quick checks.
- **Behaviour.**
  - Dry run by default: it prints counts per file and one summary line per repo. `--apply` writes.
  - It skips binary files (a NUL byte in the first 8 KB), symlinks, `.git/`, and every path in `rename-skip.txt`.
  - It is idempotent: a second `--apply` changes nothing.
  - A move whose target already exists is an error, never an overwrite. A case-only move goes through a temporary name, because the Mac's file system ignores case.
- **`--report-merges`.** Runs before applying, over all the repos given with `--repos`: the three together in Phase 0 and in the freeze, or just `.` in the 4.5 recipe. Output lines are sorted and stable, and `intended-merges.txt` entries match on `new` plus the set of olds. It splits every text file into words (`[A-Za-z0-9_]+`) and compounds (`[A-Za-z0-9_.-]+`), simulates the rename and prints four lists. It exits non-zero if any item in lists 1 to 3 is not in `--intended`:
  1. `new <- old`: a new token that already existed, unchanged, somewhere in the repos;
  2. `new <- old1, old2`: two different old tokens that become one new token;
  3. `stutter: new`: a new token matching `(?i)astrid[-_.]?astrid` or `(?i)(?<![a-z])app[-_.]?app(?![a-z])` that did not exist before;
  4. `mixed: path`: each file where a `mixed` prose row fired. This list feeds the taste review in C-INT and is not a failure.

### 4.3 `check-zero`
`tools/astrid-rename/check-zero (--repo <path> | --path <file-or-dir>... | --stdin) [--profile main|keep|local] [--allow <file>] [--kept <file>]`

`--kept` defaults to `kept-banodoco.txt` beside the script; tests pass their own fixture.

It fails (exit 1) on any old-name pattern in file contents or in path names, and prints `path:line:match` for each. In `--repo` mode it scans `git ls-files --cached --others --exclude-standard`: tracked files plus new untracked ones, but not a file already staged for deletion. The patterns are Python `re` and case-insensitive unless marked:

```
reigh
banodoco[-_]workspace[-_](runtime|client)
banodoco_workspace
banodoco[ _-](local|runtime)
@banodoco/workspace-client
Application Support/Banodoco
Banodoco Workspace
peteromallet/Astrid(?!-agent)
case-sensitive:  \w*BANODOCO_
case-sensitive:  /Astrid-agent
strict:          banodoco   (fails unless the match lies inside a kept form from kept-banodoco.txt)
```
It also checks the repo-key hits N-MAP lists for bare `workspace-runtime`. It never treats a kept form as old.

**Profiles.**
- `main`: the three repos, every pattern.
- `keep`: kept satellites such as `banodoco-workspace`. Only references to renamed repos and the Runtime product forms count, so it omits `BANODOCO_` and `strict`.
- `local`: local tooling. Every pattern; it takes `--path`.

**List file format.** One path per line, relative to the repo root; a trailing `/` means a directory; `fnmatch` globs are allowed; `#` starts a comment. A line applies in whichever repo has that path.

**Lists, two jobs, never mixed.**
- `rename-skip.txt`: what `rename.py` never edits. That is `docs/plans/astrid-naming/`, `tools/astrid-rename/`, `src/migrations/astridRenameBrowserMigration.ts`, `src/migrations/astridRenameBrowserMigration.test.ts`, and `tests/fixtures/timeline_visualize/desert_slice/`. N-CHAIN's script changes the fixtures.
- `allowlist.txt`: what `check-zero` ignores until P-FINAL. That is this plan folder, `tools/astrid-rename/`, and the browser migration module and its test.
- `allowlist-final.txt`: only the browser migration module and its test. P-FINAL uses it, running from the pinned copy `$WORK/tools` after the plan and tools are deleted from the index (section 10).

### 4.4 Regenerate, do not edit
Generated and digest-bound artifacts are regenerated from their source after `rename.py`. They are never hand-renamed:
- Runtime OpenAPI to clients: `contract/openapi/workspace-v1.yaml` through `generators/generate.py` (output paths hard-coded at `generate.py:23`). `SCHEMA_DIGEST` changes (the OpenAPI `title` is renamed and the file's bytes are hashed, `generate.py:51-60`; `COMPONENT_MANIFEST_SHA256` also changes because `contract/component-manifest.json:6-8` holds the client package paths). Regenerate the Runtime copies in C-RT. Astrid's vendored copy and the App's copy (`src/integrations/runtime/generated.ts`, `generated-contract-metadata.ts`) are copied once from the merged Runtime SHA.
- `config/astrid-capability-census.lock.json` through `python -m astrid.core.execution.capability_ledger approve` (`capability_ledger.py:636-665`). Regenerated twice: in D-AS after the retired rows are deleted, and in C-AS after the rename.
- The hash-chained fixture `tests/fixtures/timeline_visualize/desert_slice/assembly.jsonl` (N-CHAIN).
- `release_identity.py` registry digests: recomputed, not pinned as literals (verified: `component_registry_sha256` has no literal pin in Astrid; Runtime has a duplicate definition at `runtime_protocol/release_identity.py:107` and `:194`, the second shadows the first).
- The pinned values in `tests/stage1/test_vendored_workspace_client_parity_luna.py:35-39`, `banodoco_workspace_client/contract_metadata.py:4-5`, and **the App's `src/integrations/runtime/client.test.ts:384`** (a literal `SCHEMA_DIGEST` pin). All three take the regenerated value.
- The App's client copies are byte copies of the Runtime's `packages/typescript/src/` (verified with `cmp` on 17 Oct):

  | Runtime source at `RUNTIME_SHA` | App destination |
  |---|---|
  | `packages/typescript/src/generated.ts` | `src/integrations/runtime/generated.ts` |
  | `packages/typescript/src/contract-metadata.ts` | `src/integrations/runtime/generated-contract-metadata.ts` |
- The App's contract freeze (`config/contracts/astrid-plan-a-c1.json`, which pins 53 source files: 39 in Astrid, 9 in the Runtime, 5 in the App). Recompute every `sourceEvidence[].sha256` against the renamed file in its own repo, then the root `digest`, with a short script that imports `computeContractDigest` from `scripts/quality/check-astrid-contract-freeze.mjs` (exported at `:60`). Do this as the last step of C-APP, after C-AS has pushed its final branch. Never type a hash. Then check it with all three roots: `node scripts/quality/check-astrid-contract-freeze.mjs --astrid-root $ASTRID --runtime-root $RUNTIME` (the flags exist, `:19`).

### 4.5 R4 and other open branches
**R4 is running.** On 17 Oct, Codex pushed integration branches `codex/handover/timeline-r4-20261017` (plus `-a110-*` variants) to all three repos. In Astrid the branch is 422 commits ahead of `main` and 108 behind, with about 120k added lines in 724 files. The App branch is 186 commits ahead (about 41k lines) and the Runtime branch 72 (about 28k). Commits were landing within the hour. R4 does not stop for the rename:
- the rename lands on `main` during a short freeze (section 6);
- each R4 integration branch, and any other branch opened before the rename, then catches up with the recipe below;
- R4's card branches merge into their integration branch first (R4's normal flow), so the recipe runs once per integration branch per repo.

**Tested on the real R4 branches (17 Oct).** In throwaway clones, a stand-in rename was committed on `main`, and the recipe was then run on `codex/handover/timeline-r4-20261017` in each repo:

| Repo | Conflicts with `main`, no rename | Extra conflicts from the rename | Old names left | R4 files kept |
|---|---|---|---|---|
| Astrid | 38 files | 0 | 0 | 686 |
| App | 44 | 0 | 0 | 388 |
| Runtime | 17 | 0 | 0 | 125 |

The first column is R4's ordinary catch-up with `main`, which it owes with or without the rename.

**The rename commit is pure.** In each repo, C-RT, C-AS and C-APP commit the raw `rename.py --apply` output as one commit of its own, titled `Apply the Astrid rename (rename.py)`, before any fix-up commit. Call it R.
- **Purity check.** On a clean checkout of `R~1`, run `rename.py --apply`, then `git add -A && git diff --cached --quiet R`. It succeeds only if the re-run reproduces R exactly.
- **What goes elsewhere.** History deletions are in the earlier D-* commits. Tests, regeneration and fixes come in later commits.
- **Landing.** All three rename branches land with a merge commit, never a squash, so R survives on `main`.
- **Tag.** Each repo tags R as `astrid-rename-commit`. The tag is annotated, and its message is the recipe below, so the recipe can still be found after the plan is gone.

**If the map changes after R exists:**
- **In a repo that has not landed (Astrid or the App):** rebuild R.
  1. `git switch -C rename/astrid R~1`.
  2. Re-run `rename.py --apply`, then commit as the new R.
  3. `git cherry-pick` the fix-up commits from the old branch.
  4. Move the tag.
- **In the Runtime, which has landed:** run `rename.py --repo $RUNTIME` (a dry run) on the merged `main`. Zero changes means the Runtime is unaffected. Anything else is a stop (7.7).

**The recipe.** It works for any branch, in any repo, at any time, including after P-FINAL. The tools always come from Astrid, so the same commands work in all three repos.

```
git fetch origin --tags
T=$(mktemp -d)
REF=astrid-rename-done                    # this tag exists after P-FINAL; before that use REF=origin/main
git -C <astrid checkout> fetch origin --tags
git -C <astrid checkout> archive "$REF" tools/astrid-rename | tar -x -C "$T"
R="$T/tools/astrid-rename"
git merge astrid-rename-commit~1          # main up to just before R; an ordinary merge
python3 "$R/rename.py" --report-merges --repos . --intended "$R/intended-merges.txt"   # new names the map doesn't know?
python3 "$R/rename.py" --repo . --apply
git add -A && git commit -m "Apply the Astrid rename (rename.py)"
git merge -X ours astrid-rename-commit    # see below
git merge origin/main                     # the fix-ups after R; an ordinary merge
"$R/check-zero" --repo . --allow "$R/allowlist.txt"   # then the repo's tests
```

**Why `-X ours` is safe on R, and only on R:**
- After the branch has run the rename itself, R and the branch make the identical change to every line the branch didn't otherwise touch, so those merge cleanly.
- The only conflicts are lines that the branch edited **and** that held an old name. In those, R's side is just the rename, which the branch's side already contains. Keeping the branch's side is therefore correct.
- Paths renamed on both sides are the same rename, so git pairs them.
- Never use `-X ours` on any other commit.

**If `--report-merges` flags something,** the branch has introduced a name the map doesn't know (for example a new `reighFoo` beside an existing `astridFoo`).
- Before P-FINAL, this is a map change by the map owner (7.7).
- After P-FINAL, the person running the recipe adds a row to the extracted copy of the map and records it in the commit message.

Expect minutes per branch, not a hand merge of a 13k-line commit.

**For R4 specifically,** the human sends the R4 integrator (Codex) one message at the freeze:
- stop merging into the three mains until told;
- after the rename lands, run the recipe once on each integration branch;
- write only new names from then on (P-R4 updates the R4 cards);
- before every merge to `main` until P-FINAL, run `check-zero`.

### 4.6 History policy
- Before the first deletion PR in each repo, tag the last pre-deletion commit `pre-astrid-rename` and push the tag. That tag is the archive.
- History in the working tree is **deleted, not rewritten**, by ordinary PRs on `main` in Phase 0 (D-APP, D-AS, D-RT). That covers `.oracle/`, `.megaplan/` done initiatives, dated plans, run logs, audits, release evidence of shipped releases, failed rc folders, `docs/slot-first-audits/`, `docs/local-runtime/reviews/`. Rewriting dated evidence would falsify it.
- If a live gate, test or script reads a history item, the reader is edited in the same PR, or deleted together with the gate when the gate guards a finished release.
- Git history itself stays. It is not residue in the tree.
- GitHub redirects from old repo names stay. They are invisible in code, and the only way to kill them is a placeholder repo under the old name, which is worse residue.

### 4.7 Persisted-data policy
Migrate only what the evidence says users have. Everything else is an accepted, stated effect.
- **Browser storage (App).** One small isolated module `src/migrations/astridRenameBrowserMigration.ts` (N-BROWSER) runs at App start. It is a generic copier: for each key under a short literal list of old prefixes it copies old to new, verifies, deletes old. Same for three IndexedDB databases. The zero check allowlists the module and its test. F-WINDOW deletes them about 30 days after deploy.
- **Runtime realms. No migration.** Evidence: there is no public Runtime install (the only path is a producer wheelhouse, both wheel names `PENDING_PRODUCER_HANDOFF`, `astrid:docs/setup/README.md:49-50`, `:23` forbids public registries). This Mac has 4 realms, none containing `com.reigh.`, `reigh-fnv1a64-v1:`, `reigh.transcript` or `reigh-browser` (byte census). The other targets do not need one: idempotency rows expire after 24 h (`runtime_protocol/store.py:41`); a lost `project_selections` row for actor `reigh-browser` only forgets which project was selected (`store.py:1385-1409`); a clip whose `clipType` does not match is skipped, not failed (`store.py:1559-1560`). Each team machine runs the byte census at cutover (C-MIGRATE M1). If it finds a targeted string, an operator script is written then, in `tools/astrid-rename/`, and deleted with the plan. Append-only ledgers, receipts and event history are never edited.
- **Supabase rows.** A forward migration (N-SQL), no old name in it. A one-off operator script only if `extension_operational_events` has rows.
- **Support folder.** Moved with the Runtime's `relocate` command, run by the **old** install while it is still running, once per machine. No code fallback.
- **Env vars and secrets** on dev machines, CI and deployments: added under the new names before C-LAND and the old ones removed after verification (human checklist P1 and D9).

**Accepted effects (decided, not open):**
- Old `reigh.editor.timeline.<hex>` revision ids sit inside the film realm's hash-chained ledgers and are not touched. Astrid labels a revision's source by prefix (`astrid:astrid/sdk/timeline/revisions.py:18`, `astrid/packs/timeline/cli_history.py:23`). After the rename, old revisions show source "other" instead of "app". Recognising the old prefix would be a dual read.
- Dev-only extension settings stored in browsers (the extension-state stores, the dev-disable list, extension ids inside keys) are not migrated. Production has the extension host off, so only team members lose anything.
- The per-user preference that holds the `reigh.transcript` data-lane kind id resets to default.
- A Runtime clip of type `com.reigh.astrid.liveScene` saved before the cutover is skipped by the new Runtime, not failed.
- Old capability ids and wire tags remain inside stored agent transcripts (see Open questions).

### 4.8 How the plan deletes itself
P-FINAL runs after a clean review round (V-REVIEW).
1. It tags every repo `astrid-rename-done` at the current `main`. In Astrid that commit still holds the plan and the tools.
2. It stages the deletion of `docs/plans/astrid-naming/` and `tools/astrid-rename/` in Astrid.
3. It runs the final `check-zero` from the pinned copy `$WORK/tools` with `allowlist-final.txt` on all three repos and the local tooling. The staged deletion means the plan folder is no longer in the index.
4. It commits the deletion with the passing output in the commit message.
5. It records the F-WINDOW follow-up as a GitHub issue in the App repo.

The tag keeps the plan and tools reachable, and the recipe in 4.5 reads the tools from it.

---

## 5. Mapping rules

These are the binding rules. N-MAP turns them into `rename-map.tsv`.

1. **Reigh means the App.** Default: `reigh` to `astrid`, case preserved (`Reigh` to `Astrid`, `REIGH` to `ASTRID`).
2. **Collisions use `app`.** 79 tokens already exist with the new name and a different meaning (full table: [inventory.md section 7](inventory.md#7-collision-table)). Wherever the App and the agent repo are distinct concepts in the same context, the App becomes `app` / `App` / `ASTRID_APP_` / `astrid-app`. Examples: `reighCommit` to `appCommit`, `REIGH_ROOT` to `ASTRID_APP_ROOT`, `--reigh-commit` to `--app-commit`, `integrations/reigh` to `integrations/app`, `ReighElementKind` to `AppElementKind`, `checkReigh` to `checkApp`, `github.com/banodoco/Reigh` to `github.com/banodoco/astrid-app`, `peteromallet/reigh` to `banodoco/astrid-app` (it redirects to the App today; the blanket rule would give `peteromallet/astrid`, which is the agent repo). Repo references: `reigh-app` to `astrid-app`.
3. **Env vars.** `REIGH_*` to `ASTRID_APP_*`, `VITE_REIGH_*` to `VITE_ASTRID_APP_*` (collision-safe everywhere; 58 + 1 names). `BANODOCO_LOCAL_*` and `BANODOCO_RUNTIME_*` to `ASTRID_RUNTIME_*`. `ASTRID_BANODOCO_CATALOG_URL` to `ASTRID_RUNTIME_CATALOG_URL`.
   - Same-suffix pairs N-MAP must resolve (verified): `BANODOCO_LOCAL_OWNER_TOKEN` and `BANODOCO_RUNTIME_OWNER_TOKEN`; `BANODOCO_LOCAL_RUNTIME_CHECKOUT` and `BANODOCO_RUNTIME_CHECKOUT`. `ASTRID_RUNTIME_ENDPOINT` already exists (`astrid/packs/runpod/worker_process.py:1049`) and meets `BANODOCO_RUNTIME_ENDPOINT`. `ASTRID_RUNTIME_CUSTODY_*` exists and is kept.
   - The other five `ASTRID_BANODOCO_*` names (`AGENT_EXECUTORS`, `DEFAULT_EXECUTORS`, `EXECUTOR_CACHE`, `MANDATORY_EXECUTORS`, `REFRESH`) follow the same rule (`ASTRID_RUNTIME_*`) unless it collides. Flagged in Open questions.
   - `BANODOCO_URL` (App `HeroSection.tsx:15`), `BANODOCO_ASTRID_SOURCE_CHECKOUT`, `BANODOCO_RELEASE_RECEIPT_ROOT`, `BANODOCO_TIMELINE_SCHEMA_ROOT`: N-MAP decides. If a meaning is unclear, escalate; do not guess.
   - `BANODOCO_LOCAL_DATA_ROOT` is read by the live film stack's `env.sh`. Its new name must be recorded in `map-notes.md` first, because C-MIGRATE M4 needs it.
4. **Prose.** In a file that also contains the word "Astrid", the word "Reigh" becomes "Astrid App" (`prose` row, scope `mixed`), so "Treat Astrid and Reigh as peer clients" becomes "Treat Astrid and Astrid App as peer clients". Elsewhere "Reigh" becomes "Astrid". On 17 Oct this rule covered 147 files. Opus reviews the changed lines in those files and rewords any line that reads badly (C-INT), as a fix-up commit after R. A fix-up never changes a name.
   - **4a. Banodoco.** The community and org are "Banodoco" and stay so. Runtime-product uses of "Banodoco" become "Astrid Runtime", or `astrid_runtime` / `astrid-runtime` in identifiers. Every bare `banodoco` token is classified one way or the other (N-MAP step 5a); there is no third option.
5. **Specific names**
   - `ReighExtension` to `AstridExtension`; `@reigh/editor-sdk` to `@astrid/editor-sdk` (tsconfig alias: `tsconfig.json:15`, `tsconfig.app.json:23`, `config/vite/vite.config.ts:170`); `reigh-extension.json` to `astrid-extension.json` (23 tracked files on 17 Oct, plus `config/contracts/reigh-extension.schema.json`).
   - Extension ids `com.reigh.*` to `haus.astrid.*` (reverse DNS of astrid.haus). `com.reigh.astrid.liveScene` to `haus.astrid.liveScene`. `com.reigh.astrid.live-scenes` to `haus.astrid.live-scenes`. The Supabase CHECK `^com[.]reigh[.]` becomes `^haus[.]astrid[.]`. **Escaped forms get their own rows** (a plain `com.reigh.` row does not match them): `com\.reigh\.` to `haus\.astrid\.`, `com[.]reigh[.]` to `haus[.]astrid[.]`, `com\\.reigh\\.` to `haus\\.astrid\\.`. **The `com.reigh.astrid` prefix needs its own rows in all four forms, ahead of the `com.reigh.` rows**, or it stutters into `haus.astrid.astrid` (about 80 lines; for example `com.reigh.astrid-runaway-timeline`). `--report-merges` list 3 catches any that are missed. Known hits: App `extensionOperationalAnalytics.ts:43` and `supabase/functions/extension-operational-events/validator.ts:36` (`/^com\.reigh\.[a-z0-9.-]{1,100}$/`), the CHECK at migration `20260823100000...sql:31`, `ExtensionManager.test.tsx:3574-3687`, `scripts/runtime/verify-extension-runtime-rollout.test.mjs:43`, `tests/e2e/timeline/extension-performance-budget.spec.ts:146`.
   - Wire tags `<reigh_live_scene_request|result|context>`, `<reigh_editor_context>`, `<reigh_element_operation>`, `<reigh_element_result>` to `<astrid_...>`. Schema ids `reigh.<x>/v1` to `astrid.<x>/v1` (keep `/v1`; after a lockstep cutover no reader of the old id exists).
   - Runtime control version `reigh.local-worker-control/v1` to `workspace.local-worker-control/v1` (neutral protocol family, `local_worker_composition.py:43`). It is sent and compared on a local control socket and not stored (verified).
   - Fingerprint prefix `reigh-fnv1a64-v1:` to `astrid-fnv1a64-v1:`. Verified: the prefix is prepended after hashing (`src/sdk/video/timeline/sourceMap.ts:223`), so the hash input is unchanged. Equality checks at `:315-316` compare full strings. Stored fingerprints with the old prefix are not migrated (4.7).
   - Runtime packaging: distribution `banodoco-workspace-runtime` to `astrid-runtime`; launcher package `banodoco_local` to `astrid_runtime`; Python client `banodoco_workspace_client` to `astrid_runtime_client` (distribution `banodoco-workspace-client` to `astrid-runtime-client`) in every copy: Runtime `packages/python/`, Astrid root `banodoco_workspace_client/`, generated code; TS client `@banodoco/workspace-client` to `@astrid/runtime-client`.
   - CLI: keep `astrid-runtime` (launcher). Delete `banodoco-local`, which maps to the same entry point (`pyproject.toml:14-15`). Rename `banodoco-runtime` (`runtime_protocol.cli:main`) by the rule "one command per entry point, prefixed `astrid-runtime`": `astrid-runtime-protocol`.
   - Support folder `~/Library/Application Support/Banodoco/` to `~/Library/Application Support/Astrid Runtime/` (`banodoco_local/paths.py:41,53,73`).
   - Actor ids `reigh-browser` (App `src/integrations/runtime/client.ts:349`), `reigh-product-connector`, `reigh-app:local-editor`, idempotency-key prefixes (`reigh.task.cancel-`, `reigh.render:v1/v2:`, `reigh.runtime.*`), `reigh.editor.timeline.*` revision ids (`dataProvider.ts:1593`, with the label code at `revisions.py:18` and `cli_history.py:23`), CustomEvent names, `window.__REIGH_*` globals, localStorage keys and IndexedDB names follow rules 1 and 2.
   - Files: `scripts/reigh-acp-bridge.ts` to `scripts/astrid-acp-bridge.ts` (pin this name now for R4 project H), and the other `scripts/reigh-*` files; `adapters/reigh/` to `adapters/app/` (collision rule: `integrations/reigh` exists beside `integrations/astrid`).
   - Edge function `reigh-data-fetch` has no caller and is deleted in D-APP (so it needs no map row). `project_id = "reigh"` in `supabase/config.toml:3` becomes `astrid-app` (local id only).
   - **Retired capability ids `reigh.*` are deleted, not renamed** (D-AS). They are marked dead in code (`capability_ledger.py:234-261`, `:455-457`). Renaming them would invent ids that never existed (`astrid.open_in_astrid`) inside the namespace agents see. So the map has no `reigh.*` capability rows.
   - Composition package `@banodoco/timeline-composition` is **unchanged** (not an old name). R4 project G pins it as is.
6. **The map is data** (section 4.1).

---

## 6. Sequencing and the cutover window

**This revises the 11 Oct order.** On 11 Oct the plan was "naming last, after R4 is completed and accepted" (`production/review/merge/CODEX-REPLY.md:321-325`). The user has now decided to rename now. R4 is in flight, but it neither waits nor stops: its branches catch up with the recipe in 4.5, which was tested on them with zero rename conflicts. Renaming after R4 would be the same work, plus every old name written in the meantime.

**Phase 0 (now, no freeze).**
- D-APP goes first; its step 1 is the security fix.
- Then the other deletion PRs, and the GitHub renames (O-GITHUB) as soon as the three `pre-astrid-rename` tags are pushed. Redirects make the renames zero-downtime whenever they happen, and doing them early surfaces Railway, Supabase and webhook breakage days before the freeze.
- Then the prep tasks, and the rehearsal on throwaway copies (N-REHEARSE).
- The human answers the day-one questions (7.4) and does the Phase 0 items of section 9.

**Cutover window.** A merge freeze on the three mains, hours rather than days. Order:

1. **Pre-checks pass.**
   - All Phase 0 tasks are done and merged, including the tools and the map on Astrid `main`.
   - N-REHEARSE reports no open map problem.
   - The human's pre-land items P1 to P4 (section 9) are done: new-name secrets and variables set beside the old ones, merge commits allowed, the new Railway domain live, automated merges paused.
2. **Freeze starts.** Nothing else merges into the three mains: not the hourly merge check (the `production/review/merge/HOURLY-CHECK.md` loop), no Codex merge session, not the R4 integrator (the message in 4.5).
3. **Pin the tools.** The manager copies `tools/astrid-rename/` from Astrid `main` to `$WORK/tools` and records the commit. Every later step runs the tools from that pinned copy.
4. **Baselines** (7.8) on the frozen mains, in the background, all three repos in parallel.
5. **C-RT.** The Runtime lands first, on its own. It reports the merged `RUNTIME_SHA`.
6. **C-AS and C-APP,** in parallel, each pinned once to `RUNTIME_SHA`.
7. **C-INT.** The live handshake, the Astra sense check of the diffs, and the Opus taste review of user-visible text and mixed-prose lines.
8. **C-LAND.** Merge Astrid, then the App.
9. **O-DEPLOY** (human). Deploy and verify, then remove the old-name secrets and variables.
10. **C-MIGRATE,** per machine.
11. **Unfreeze.** The human tells the R4 integrator to run the recipe.

**Why the Runtime can land alone.** Consumers take the Runtime only by pinned SHA and copied generated files (`astrid:.github/workflows/ci.yml:61,220`; the App CI checked out Astrid and the App by name in `bridge-latency.yml:34-39`, since deleted). Old pins stay fetchable through the GitHub redirect. Landing the Runtime early therefore breaks nobody, and Astrid and the App pin the final SHA once. There is no re-regenerate loop and no squash-pin loop.

**Phase 2** follows: local tooling, R4 docs, satellites. **Phase 3** is V-REVIEW (up to five rounds) and then P-FINAL. F-WINDOW is separate and later.

---

## 7. How to run this

This section is for the manager. Read it whole before starting.

**Manager goal.** The human gives the manager exactly this:

> Drive the Astrid rename to completion: reigh-app → astrid-app, banodoco-workspace-runtime → astrid-runtime, Astrid-agent → astrid-agent. It is a clean break: no old name anywhere, no aliases.
> 
> The plan is docs/plans/astrid-naming/README.md in github.com/peteromallet/astrid-agent. Read section 7 first and follow it exactly.
> - Run the tasks in the order of 7.3. Brief each worker with the 7.5 preamble plus its task block, verbatim.
> - Models: Luna (gpt-6-luna) for normal tasks, Sol (gpt-6-sol, xhigh) for XHARD, Astra (gpt-6-astra) for reviews, Opus for wording.
> - You do every git and GitHub step; workers never write .git.
> - Send me the 7.4 questions on day one.
> - Track all state in ~/Developer/astrid-rename/STATUS.md.
> - Never touch ~/Developer/astrid-video or the film's data. Never guess a name.
> - When stuck, follow 7.7: log it in QUESTIONS.md, tell me, keep going on other tasks.
> 
> You are done when section 10 holds, after up to five V-REVIEW rounds end in a clean round.

### 7.0 Models

| Use | Model | Command |
|---|---|---|
| **Normal** tasks, and every fan-out worker inside any task | **Luna**, `gpt-6-luna` | `codex exec -m gpt-6-luna --skip-git-repo-check -C <dir> -s workspace-write -o $WORK/reports/<ID>.md "<brief>" < /dev/null` |
| **XHARD** lead: N-MAP, and every later map change | **Sol**, `gpt-6-sol` at reasoning `xhigh`. Use `gpt-6.1-sol` if the account accepts it; on 17 Oct it was rejected ("not supported when using Codex with a ChatGPT account"). | the same, plus `-c model_reasoning_effort='"xhigh"'` |
| **Sense checks**: the C-INT diff review and every V-REVIEW round | **Astra**, `gpt-6-astra` at `xhigh` | the same; `-s read-only` when it only reads, `-s workspace-write` in `$WORK/review/` when it runs tests |
| **Taste**: the names in the map, all user-visible text (UI strings, README and install text, extension-author docs), the mixed-prose lines | **Opus**, `claude-opus-5-5` | `claude -p --model claude-opus-5-5 --allowedTools Read,Grep,Glob,Agent "<brief>"` |
| `Route: human` | the person with credentials | |

- **Senior agents fan out.** Sol, Astra and Opus keep the judgment and hand the legwork (searching, reading, running, simple edits) to as many parallel workers as the work splits into.
  - Codex seniors use `spawn_agent` with `model: "gpt-6-luna"`. Say so in the brief: Sol starts Sol sub-agents if the brief does not.
  - Opus uses the Agent tool with `model: "haiku"`.
- **The manager can be Luna.** It must run where git and GitHub writes work (7.2).
- **Reviewers give evidence, not orders.** The manager acts on an Astra or Opus finding only if it passes the triage rule in V-REVIEW.

### 7.1 Workspace

All work happens in fresh clones under one folder. Nothing in this plan runs inside `~/Developer/astrid-video/`: the film, `production/` and the live stacks are there.

```
WORK=~/Developer/astrid-rename
git clone https://github.com/peteromallet/astrid-agent.git    $WORK/astrid    # $ASTRID
git clone https://github.com/banodoco/astrid-runtime.git      $WORK/runtime   # $RUNTIME
git clone https://github.com/banodoco/astrid-app.git          $WORK/app       # $APP
```
Before O-GITHUB the old URLs work too. Afterwards, set each clone to the new URL with `git remote set-url origin`.

- **`$TOOLS`.** Until the freeze it is `$ASTRID/tools/astrid-rename` on the branch `prep/astrid-rename-tools`. From the freeze it is the pinned copy `$WORK/tools` (section 6, step 3).
- **Dependencies.** Install them the way each repo's CI does: copy the install steps from its `.github/workflows/*.yml`.
  - Python repos: one venv per repo (`python3 -m venv $WORK/venv-<repo>`), then the CI's `pip install` lines.
  - The App: `npm ci`. Run tools with `npx --no-install`, so a missing package fails instead of being downloaded.
  - **After the rename, create a new venv** for Astrid and the Runtime and reinstall. Never reuse a pre-rename venv: a stale `banodoco_local` install can make a missed import pass.
- **Test environment.** Copy the `env:` blocks of the CI jobs, with `$RUNTIME` and `$ASTRID` as the paths. After the rename, CI's `BANODOCO_RUNTIME_CHECKOUT` has the map's new name.
- **Data. Every Runtime or App this plan starts uses a data root under `$WORK` and a non-default port.**
  - Before the first request, `astrid-runtime status`, or the launcher's printed discovery path, must show a path under `$WORK`.
  - Set `ASTRID_CHECKOUT` explicitly when running the App's `npm run dev:local`. Otherwise it attaches to `../Astrid/.astrid-data` (`scripts/dev-local-workspace.mjs:23-28`).
- **Manager files**, all in `$WORK`, outside the repos so they are not residue:
  - `STATUS.md` (7.10);
  - `QUESTIONS.md` (7.7);
  - `reports/<ID>.md`, one per task;
  - `baseline/` (7.8);
  - `review/` (V-REVIEW).
- **`gh`.** It must be installed and logged in for whoever opens and merges PRs (`brew install gh`, then `gh auth login`). On 17 Oct it was not on this Mac's PATH.

### 7.2 Git and the sandbox

Codex workers run with `-s workspace-write`, where `.git` is read-only. They cannot commit, `git mv`, fetch, push or open PRs. Therefore:
- **Workers** edit the working tree and write a report. They never run a git command that writes.
- **The manager, or the human, does every git and GitHub step:** branch, `git add -A`, commit, push, tag, PR, merge. This is also the manager's review point: it reads `git status`, `git diff --stat` and the worker's report before each commit.
- **`rename.py` uses plain file moves** for this reason (4.2).
- **The manager runs where git and GitHub writes work:** a Claude Code session, or a Codex session the human started with full access.
- **Network.** A worker that must install packages gets `-c 'sandbox_workspace_write.network_access=true'`.
- **Merges** use `gh pr merge --merge <number>`. Never `--squash` or `--rebase` a `rename/astrid` branch. For simplicity, merge every PR in this plan the same way.

### 7.3 Phases and parallelism

| Phase | Tasks | Starts when |
|---|---|---|
| 0 | D-APP (PR 1 first), D-AS, D-RT, N-MAP, N-TOOL, N-SAT | now, in parallel (N-SAT's two shared files wait, 7.9) |
| 0 | O-GITHUB | as soon as the three `pre-astrid-rename` tags are pushed (D-* step 0) |
| 0 | N-BROWSER, N-SQL, N-CHAIN | N-MAP's first map commit on `prep/astrid-rename-tools`. N-SQL also needs Q1 and Q2. |
| 0 | N-REHEARSE | D-APP, D-AS and D-RT merged; N-TOOL's tests pass; `map_selfcheck.py` passes |
| end of 0 | merge `prep/astrid-rename-tools` into Astrid `main` | N-MAP accepted and N-REHEARSE reports no open map problem |
| 1 | freeze, C-RT, then C-AS and C-APP, C-INT, C-LAND, O-DEPLOY, C-MIGRATE | in the order of section 6 |
| 2 | P-LOCAL, P-R4, P-SAT | C-LAND; in parallel |
| 3 | V-REVIEW (up to five rounds), then P-FINAL | Phase 2 done |
| later | F-WINDOW | about 30 days after deploy |

**Where the files live in Phase 0.**
- **Tools and map:** on the Astrid branch `prep/astrid-rename-tools`. Before N-MAP and N-TOOL start, the manager creates the branch from `main` and gives each worker a checkout of it under `$WORK` (`git worktree add`). N-MAP and N-TOOL produce them; the manager commits and pushes. Readers take a named commit, for example `git show <commit>:tools/astrid-rename/rename-map.tsv`.
- **N-BROWSER and N-SQL:** their own App branches, `prep/astrid-rename-<task>`. C-APP merges them after R.
- **D-* tasks:** ordinary PRs to the three mains.

### 7.4 Day-one questions for the human

Ask all of these in one message on day one, and record the answers in `STATUS.md`. Phase 0 starts without waiting; each answer unblocks only the task named.
1. Who merges PRs on the three repos, and are merge commits allowed (Settings, General, Pull Requests)? (D-* and C-LAND)
2. The outputs of Q1 and Q2 (section 9). (N-SQL)
3. Does any live deployment use `banodoco/reigh-worker`, such as a RunPod template or a worker pool? Is `banodoco-workspace/banodoco-worker/` deployed on Railway? If the answer is unknown, the default is "deprecated", as the user said on 17 Oct. (N-SAT, P-SAT)
4. The new Railway domain for the App (section 9, P3). (C-APP)
5. Which machines run a Runtime: this Mac, any others? (C-MIGRATE)
6. Are R4's cards also stored as Otto records, beside `.otto/runs/timeline-platform-r4/`? If so, who updates those? (P-R4)
7. Any objection to the decided defaults in section 11? Until the answer comes, tasks follow the defaults. Nothing irreversible depends on a default before the freeze, so an objection only means revising a map row or a PR.

### 7.5 Briefing a worker

A brief is three parts, in order:
1. the worker preamble below;
2. the task block, verbatim;
3. the paths: the `$WORK` checkouts, this README, and the map at a named commit.

Do not summarise the block.

> **Worker preamble.** You are executing one task of the Astrid rename plan (`<README path>`). Read sections 2, 4 and 5 of the plan before you start.
>
> Rules:
> - Never guess a name. The map decides; a missing name is a question for the manager.
> - Never add an alias, shim, dual read, fallback env var or re-export, even temporarily.
> - Never edit a generated file by hand. Never rewrite dated evidence.
> - Never run a git command that writes. The manager commits. Where your block lists one (a tag, `git rm`, a push), stop at that step and list it in your report under "for the manager"; the manager runs it and tells you to continue. A plain file deletion with `rm` is fine.
> - Never touch `~/Developer/astrid-video/`, or any Runtime data root outside `$WORK`.
> - In tests, you may change an expected value only where it is itself an old name becoming its mapped new name. Any other change to an assertion is a question for the manager.
> - Compare test results with the baseline in `$WORK/baseline/`, not with "all green".
>
> Write your report to `$WORK/reports/<ID>.md`: what you did, every acceptance command with its real output, every deviation and every open question. If you are stuck, stop and say so. Do not work around it.

### 7.6 Fan-out inside a task

Route `normal` means one Luna worker. A task fans out more Luna workers when its block says so (for example the C-APP failure triage).
- Split by folder, one folder per worker, using the folder lists in the block. Never put two workers on the same file. Root-level files and any folder not on the list (`config/`, `public/`, files directly under `src/`) go to one extra worker.
- Workers run only the tests for their own folder. Full-suite runs (tsc, vitest, build, pytest) are run by the task lead alone, and never by two agents in one checkout at the same time.
- A failure that needs a map change goes back to the lead, unfixed.
- The task lead (the manager for `normal`, the Sol lead for `XHARD`) reviews every diff before the manager commits it.
- Route `XHARD` means a Sol lead. It keeps the design and the invariant, hands the legwork to parallel Luna workers, reviews every diff against the invariant, and lists each sub-agent in its report.

### 7.7 Stop rules and the map owner

**How to stop:**
1. Write the question in `$WORK/QUESTIONS.md`: the task, the exact question, the evidence and the options.
2. Notify the human.
3. Mark the task `blocked` in `STATUS.md`.
4. Keep running every task that does not depend on it. Never halt the whole plan for one question.

**Stop and escalate when:**
- a name has no entry in the map and is not obviously covered by a rule in section 5;
- `--report-merges` or a test shows a collision the map does not list;
- a check that "must pass" still fails after one correction cycle (two failed cycles mean a root-cause decision, not a third try);
- a task would delete a file that a live gate reads, and the block does not authorise it;
- `supabase_migrations.schema_migrations` has a column that looks like a hash or checksum (N-SQL);
- a byte census finds a targeted string in a realm (C-MIGRATE M1). Write the operator script only after the manager has seen the counts;
- a step would touch the `banodoco` org name, a kept satellite name, `workspace.v1` or the `@banodoco/timeline-*` scope;
- a step would run renamed code with an old env file, run `relocate` in a shell where `BANODOCO_LOCAL_DATA_ROOT` is set, write to or clean up the film's realm (`astrid-local/Astrid/.astrid-data`), or touch anything under `~/Developer/astrid-video/production/`;
- `RUNTIME_SHA` would change a second time (7.9).

**Always:**
- Never guess a name.
- Never add an alias, shim, dual read, fallback env var or re-export, even temporarily, even "just for tests".
- Never edit a generated file by hand.
- Never rewrite dated evidence.
- Never touch `.github/workflows/slot-first-quality.yml` (D-APP). It is the App's only test CI.

**The map owner** is the N-MAP Sol lead. After N-MAP is done, a map change is a new Sol session, given the N-MAP block, `map-notes.md` and the question. Then the manager:
1. re-runs `rename.py` (idempotent) on every repo already renamed;
2. re-runs N-BROWSER's literal check;
3. follows the "if the map changes after R exists" rule in 4.5.

### 7.8 Baselines

Test acceptance is relative to a baseline, because some suites may not be green on `main` today. The App's CI runs no full vitest, no tsc and no build.
- At freeze start (section 6, step 4), run each repo's acceptance commands on the frozen `main`. Save the failing test ids to `$WORK/baseline/<repo>.txt`, and map them through `rename.py --text` so they compare with renamed ids.
- A C-* task passes when its failures are a subset of the mapped baseline. A new failure is fixed, never added to the baseline.
- N-REHEARSE does the same earlier on throwaway copies, so most failures are known before the freeze.

### 7.9 One writer per file, and the Runtime SHA

Each file or area has exactly one owner task, given on its **Owns** line. Tasks that share a file are ordered by **Depends on** and never run in parallel.
- Only N-MAP writes the map files listed in 4.1. Only N-TOOL writes `rename.py`, `check-zero` and the three list files.
- The D-* tasks own only the paths they delete or edit in Phase 0.
- **D-AS owns Astrid's `.github/workflows/ci.yml` in Phase 0.** N-SAT's `ci.yml` edit starts after the D-AS PR merges.
- **D-APP owns the App's `README.md` in Phase 0.** N-SAT's README edit starts after D-APP PR 1 merges.
- During the freeze, only a repo's apply task writes that repo's tree.

**Runtime SHA, once.** C-RT merges to Runtime `main` and reports `RUNTIME_SHA`, the merged commit. C-AS and C-APP copy their client files from that SHA and pin it. If C-INT finds a Runtime bug, fix it once:
1. Open a new Runtime PR and merge it.
2. Set `RUNTIME_SHA` to that merge.
3. Re-copy the client files into Astrid and the App, and check them with `cmp`.
4. Update the pins and re-run C-AS's and C-APP's acceptance.

A second change is a stop.

### 7.10 Status

`$WORK/STATUS.md` holds:
- one table: task, route, model, state (`todo`, `doing`, `done (commit)`, `blocked (reason)`), commit, and a link to its report;
- the day-one answers;
- `RUNTIME_SHA`, the pinned tools commit, and R for each repo.

This plan file is never edited while the plan runs.

---

## 8. Tasks

Template: **ID**, **Route** (`normal`, `XHARD`, `review`, `human`), **Depends on**, **Owns**, **Outcome**, **Steps**, **Acceptance**. XHARD adds **Invariant**, **Plausible mistake**, **Why it looks right**.

Conventions for every block:
- **Variables.** In commands, `$ASTRID`, `$RUNTIME` and `$APP` are the clones under `$WORK` (7.1). `$TOOLS` is the tools folder: on `prep/astrid-rename-tools` until the freeze, then `$WORK/tools`.
- **Git.** "Commit", "push", "tag", "open the PR" and "merge" are done by the manager (7.2). A worker stops at a clean working tree plus its report.
- **"Passes."** In Phase 0 it means no test fails that did not already fail on `origin/main`; run both. From the freeze it means relative to the baseline (7.8).
- **Human steps.** "The human" is the person with credentials. "Owner" in a command name (`owner.token`, "a running owner") means the Runtime's own owner process, not a person.

### Phase 0: prep

#### D-APP
- **Route:** normal
- **Depends on:** none. Do this first.
- **Owns:** the deleted and edited paths below in `$APP`, and the App's `README.md` in Phase 0
- **Outcome:** two ordinary PRs merged to App `main`. PR 1 removes every reference to the three dead domains (a security fix). PR 2 deletes the App's history and dead code. Tag `pre-astrid-rename` exists on the App before PR 1.
- **Steps:**
  0. Tag: `git fetch origin && git tag pre-astrid-rename origin/main && git push origin pre-astrid-rename`. Do this before any PR.
  1. **PR 1: the domains (security, merge first).** A third party holds `reigh.art`. Remove every `reigh.art`, `reigh.ai` and `reigh.app` reference:
     - `README.md:3` ("For usage, go to reigh.art"): the production URL becomes `https://astrid.haus`.
     - `config/vite/policy.ts:6-11` (`PREVIEW_ALLOWED_HOSTS`): remove `reigh.art` and `www.reigh.art`. Keep `astrid.haus` and, for now, the Railway host (the new Railway host comes in C-APP).
     - `supabase/functions/huggingface-upload/index.ts:594`: it writes `https://reigh.ai/` into every uploaded LoRA README. Replace with `https://astrid.haus/`.
     - `config/contracts/reigh-extension.schema.json:3` and `config/contracts/astrid-plan-a-diagnostic-c2.schema.json:3` (`$id` hosts `reigh.ai` and `reigh.app`): replace the host with `astrid.haus` and update every reference by `$id` found by `git grep`.
     - Any other hit from `git grep -niE 'reigh\.(art|ai|app)' -- . ':!docs'`.
     The README's other lines (`:16-17`, `git clone https://github.com/peteromallet/reigh`) are mapped by `rename.py` later, not here.
  2. **PR 2: deletions.** Start from `inventory.md` section 6. Delete:
     - `docs/extensions/evidence/` (137 files; rc1 to rc3 are `failed-*.json` only, rc4 and rc5 are superseded);
     - `docs/slot-first-audits/` (8 files), `docs/local-runtime/reviews/` (2), dated 2026-09 files in `docs/local-runtime/` (`02-reigh-plan.md`, `04e-reigh-worker-cutover-lane.md`, `2026-09-09-state-audit.md`, `05-next-stage-execution-20260909.md`), `docs/video-editor/reigh-branch-census-and-convergence.md`, `docs/state_management_context_audit.md`, `docs/sqlite-only-local-runtime-plan.md`, `docs/video-editor-sprint3-followups.md`;
     - the finished-release verifiers `scripts/release/verify-rc4*` and `verify-rc6*` with their tests, and their `package.json` scripts (`package.json:29,56,58,98`). No workflow runs them (no `.github/` file references them);
     - `CHECKPOINT.md` and `LOCAL_REVIEW_CHECKPOINT.json` at the repo root (review checkpoints of 14 Oct; `git grep -n 'LOCAL_REVIEW_CHECKPOINT\|CHECKPOINT.md'` first);
     - `scripts/astrid-landing/` (the Plan A candidate C public-source pipeline, pinned to 25 Sep commits at `prepare.py:20-22`). No `package.json` script, Makefile target or workflow runs it; only `docs/astrid-data-dash-app-handoff.md` mentions it. Delete it with that doc unless a reader turns up. If one does, keep it and record it in the PR: after C-LAND it must be re-pinned to the renamed commits, which is the human's call;
     - the edge function `supabase/functions/reigh-data-fetch/`, its `[functions.reigh-data-fetch]` section (`supabase/config.toml:128`), its test glob entry (`vitest.edge.config.ts:35`) and tests, and `_shared` helpers used only by it. It has no caller: confirm with `git grep -n 'reigh-data-fetch'` in all three repos and the satellites first; if a caller turns up, stop and report;
     - other readers: edit them in the same PR. Known: `scripts/quality/check-extension-ship-evidence.mjs:393-439` (sha256 against committed HEAD blob), `scripts/quality/lib/extension-external-evidence.mjs`, `scripts/quality/capture-extension-external-evidence.mjs:287`, `scripts/quality/check-extension-release-preflight.mjs:161`, `.gitattributes:6`, `.gitignore:69,70`, `config/contracts/astrid-plan-a-c1.json:1222` (references `docs/plans/astrid-default-packs-and-skills/PLAN.md`). For each, choose: (a) keep the folder and remove only the old-name files; (b) delete the folder and edit the reader; (c) delete the reader too, only when it guards a finished release. Record the choice in the PR description. The generator `verify-paired-release-e2e.mjs:3892` writes `reigh-build.log` and similar names; with the verifiers gone, `rename.py` renames its output names later.
  3. **Do not touch `.github/workflows/slot-first-quality.yml`.** It is not a docs guard: it runs `make slot-first-audit` (vitest unit, edge, db and Playwright e2e; `Makefile:124`) on `src/**`, `supabase/**` and more. The `docs/slot-first-audits/**` entry in its path filters has no old name and may stay as a dead filter.
  4. Keep `docs/design/*-2026-10-05.md` (7 files, live-ish): `rename.py` renames them; they are not history.
- **Acceptance (run locally; App CI runs no `tsc`, build or full vitest, so a green check proves little):**
  - After PR 1: `git grep -niE 'reigh\.(art|ai|app)' -- . ':!docs'` prints nothing.
  - After PR 2: `git grep -niE 'reigh\.(art|ai|app)'` prints nothing; `npx tsc -p tsconfig.app.json --noEmit` exits 0; `npx vitest run src/sdk` passes; `npm run test:extension-ship-verifier` passes or is removed together with its verifiers.
  - `git diff origin/main -- .github/workflows/slot-first-quality.yml` is empty on both PRs.
  - `git ls-remote --tags origin pre-astrid-rename` prints one line.

#### D-AS
- **Route:** normal
- **Depends on:** none (the `reigh-worker` CI removal belongs to N-SAT)
- **Owns:** the deleted and edited paths below in `$ASTRID`, and Astrid's `.github/workflows/ci.yml` in Phase 0
- **Outcome:** one ordinary PR merged to Astrid `main`: history deleted, the retired Reigh capability rows deleted, the Reigh absence assertions deleted, hard-coded home-directory paths replaced. Tag `pre-astrid-rename` exists on Astrid before the PR.
- **Steps:**
  0. Tag: `git fetch origin && git tag pre-astrid-rename origin/main && git push origin pre-astrid-rename`.
  1. **History.** Start from `inventory.md` section 6. Delete: `.oracle/` (534 files, 4,097 old-name lines; no verified reader), `.megaplan/` done initiatives (27 files), `receipts/` (8), `findings/` (5), `docs/projects/` (58 files; handover and publication docs), the dated or finished plans under `docs/plans/` that contain old names (about 26 files; live plans stay and are renamed by `rename.py`; never delete `docs/plans/astrid-naming/`, which is this plan), `docs/megaplan/loose-work-consolidation-plan.md`, `CHECKPOINT.md` and `LOCAL_REVIEW_CHECKPOINT.json` at the root (they hold the `/Astrid-agent` URLs N-MAP step 6 assumes are gone), `artifacts/` old-name files (`artifacts/m4/reigh-external-gate-disposition.json` and the six others). For every candidate, `git grep -nF '<path>'` outside the folder. Known live readers to handle: `scripts/reshape/check_repo_hygiene.py:37-39,82-84` (`ROOT_DIR_ALLOWLIST`, `.megaplan` paths), `scripts/reshape/m4_gate.py:75`, `m7_gate.py:43` (`DEFAULT_PLAN`), `tests/reshape/test_repo_hygiene.py:139,150,187`, `.github/workflows/ci.yml:34,35,42,91,97` (`artifacts/m7/`), `pyproject.toml:196`, `installed_artifact.py:458`. Per reader choose (a) keep the folder and remove only the old-name files, (b) delete the folder and edit the reader, or (c) delete the reader too, only if it guards a finished release. If (c) is chosen for anything under `m4`, `m7` or `m8`, stop and escalate. Record each choice in the PR description.
  2. **Retired capability rows.** Delete the `reigh.*` rows of `_HISTORICAL_EXECUTOR_ROWS` (`astrid/core/execution/capability_ledger.py:234-261`), `_LEGACY_REIGH_IDS` (`:280-299`) and its `_legacy_ids` use (`:445-458`, called at `:523`). First `git grep -n 'historical_only\|_legacy_ids' tests` and fix any count assertion. Then regenerate the lock with `python -m astrid.core.execution.capability_ledger approve`. Only `capability_ledger.py` reads the lock (`:21`).
  3. **Absence test.** In `tests/stage1/test_reigh_authority_absence.py` delete the Reigh-specific assertions (`:12-41`). Keep the non-Reigh markers (`:63-86`). (The file's own name is renamed later by the map.)
  4. **Hard-coded home paths.** `tests/fixtures/runaway_release/audio-reactive-v1.json:467` and the `/Users/peteromalley/.../reigh-workspace/...` paths in `tests/integrations/test_generic_host_*.py`: replace with relative or `tmp_path` paths.
- **Acceptance:**
  - `python3 -m pytest -q tests/reshape` and the subset CI runs in job `python` (copy it from `ci.yml`) pass.
  - `grep -ci reigh config/astrid-capability-census.lock.json` prints 0, and a second `approve` run leaves `git diff --exit-code config/astrid-capability-census.lock.json` clean.
  - `git ls-remote --tags origin pre-astrid-rename` prints one line.
  - Every deleted path has "readers: none" or a matching edit in the PR description.

#### D-RT
- **Route:** normal
- **Depends on:** none
- **Owns:** the deleted and edited paths below in `$RUNTIME`
- **Outcome:** one ordinary PR merged to Runtime `main`. Tag `pre-astrid-rename` exists on the Runtime before the PR.
- **Steps:**
  0. Tag: `git fetch origin && git tag pre-astrid-rename origin/main && git push origin pre-astrid-rename`.
  1. `git rm -r banodoco_workspace_runtime.egg-info/` (5 tracked files: PKG-INFO, SOURCES.txt, dependency_links.txt, entry_points.txt, top_level.txt), and add `*.egg-info/` to `.gitignore`.
  2. `CHECKPOINT.md`, `LOCAL_REVIEW_CHECKPOINT.json` (GitHub URLs to the old repos, branch `codex/combined-local-review-20261014`): delete both unless a reader exists; `git grep -n 'LOCAL_REVIEW_CHECKPOINT\|CHECKPOINT.md'` first.
  3. `contract/schemas/timeline-config.schema.provenance.json:12` (path `reigh-main-role-slice-20261009`, a historical receipt path): delete or replace with a neutral path; `git grep` the schema's readers first.
  4. `tests/test_astrid_activation_join.py:44-45`: hard-coded `/Users/peteromalley/Documents/reigh-workspace/...` path. Replace with a `tmp_path` fixture.
- **Acceptance:** `python3 -m pytest -q` passes; `git ls-files | grep -i egg-info` prints nothing; `git ls-remote --tags origin pre-astrid-rename` prints one line.

#### O-GITHUB
- **Route:** human
- **Depends on:** the three `pre-astrid-rename` tags pushed (D-* step 0). Then do it at once; nothing else waits for it before the freeze.
- **Owns:** GitHub settings
- **Outcome:** the three repos renamed, and merge commits allowed on all three. See the human checklist (section 9), items G1 to G7.
- **Acceptance:**
  - `gh repo view banodoco/astrid-app --json name,url`, `gh repo view banodoco/astrid-runtime --json name,url` and `gh repo view peteromallet/astrid-agent --json name,url` succeed.
  - `git ls-remote https://github.com/banodoco/reigh-app.git` still answers (the redirect).
  - `gh api repos/<each>/ --jq .allow_merge_commit` prints `true` for all three.
  - The next Railway deploy after D-APP PR 1 comes from `banodoco/astrid-app` (Q3), which proves Railway followed the rename.

#### N-MAP
- **Route:** XHARD (Sol lead, Luna workers; Opus reviews the names)
- **Depends on:** none to start. The final dry run (step 9) needs D-APP, D-AS and D-RT merged and N-TOOL's scripts.
- **Owns:** in `tools/astrid-rename/` on `prep/astrid-rename-tools`: `rename-map.tsv`, `map-notes.md`, `intended-merges.txt`, `kept-banodoco.txt`, `map_selfcheck.py` (formats in 4.1)
- **Outcome:** the complete map, every collision resolved, every old token covered, kept or marked deleted, and every bare `banodoco` classified.
- **Steps:**
  1. **Inputs.** Load `old-tokens.txt` (2,602 tokens) and `collisions.tsv` (79 collisions), both in this folder. They date from 17 Oct, so re-grep before relying on any count. A token that occurs only in paths the D-* PRs delete is listed in `map-notes.md` as `deleted` and needs no row. Do this classification after those PRs merge, against fresh `main`.
  2. **Rules to rows.** Write the rules of section 5 as rows in the 4.1 format. Resolve the collisions one by one with rule 2. The last-resort `word reigh astrid all` row comes last, after every collision is covered.
     - Rule 2 is for **identifiers and repo names**. `reighCommit` becomes `appCommit` beside `astridCommit`.
     - Prose follows rule 4 (the `mixed` rows), never rule 2.
  3. **Env var pairs.**
     - Read each use before deciding: `generic_host.py:7377-7378`, `tests/stage1/test_final_cold_launch_matrix_luna.py:1377`, Runtime `banodoco_local/cli.py:196,203,417`.
     - Two old names may become one new name only if both are read for the same value. Record each such merge in `intended-merges.txt` with that evidence.
     - Known pairs that must stay distinct: the two checkout variables (`tests/stage1/test_cold_launch_autobootstrap.py:489` sets them to different paths); `BANODOCO_LOCAL_DATA_ROOT` (the launcher's support tree, `paths.py:47`) and the protocol CLI's root (`runtime_protocol/cli.py:45`).
     - Record the new name of `BANODOCO_LOCAL_DATA_ROOT` in `map-notes.md` first. C-MIGRATE M4 needs it.
  4. **Paths.** Add path rows for the old paths in inventory section 2. Examples: `banodoco_local/` to `astrid_runtime/`, `src/tools/video-editor/adapters/reigh/` to `.../adapters/app/`, the 23 `reigh-extension.json` files, `scripts/reigh-*`, `ReighLoading.tsx`, and `tests/stage1/test_reigh_authority_absence.py` to a neutral name. A path row also replaces the same string in contents (4.1), so absolute imports follow the move. Check that no relative import names a collision-renamed folder (none did on 17 Oct).
  5. **Repo keys.** Add scoped rows (`<repo>:<file>`) for the repo keys in `scripts/quality/lib/astrid-contract-schema.mjs:10`, `check-astrid-contract-freeze.mjs:71,96,218` and `config/contracts/astrid-plan-a-c1.json` / `c2.json`. The keys are `'reigh-app'`, `'Astrid'` and `'workspace-runtime'`, and they become `astrid-app`, `astrid-agent` and `astrid-runtime`. Never add an unscoped row for `Astrid`: it is the product name everywhere else.
  - **5a. Bare `banodoco`.**
    - List every bare-`banodoco` token in the three repos that is neither a section 2 pattern nor already kept. On 17 Oct there were 160, including `x-banodoco-*` OpenAPI keys, `banodoco.*.v1` schema ids, `//banodoco.dev/...` URLs, `enqueueBanodocoRenderTimeline`, `delegateToBanodocoAgent`, `worker-banodoco`, and 114 uses of the word "Banodoco".
    - Classify each, from its uses, as community or org (add a regex to `kept-banodoco.txt` with a reason) or Runtime product (add a map row, rule 4a). Split the list across Luna workers by repo and folder; the lead decides every token.
    - If a token's meaning is unclear after reading its uses, it is a question for the human (7.7).
  - **5b. Stutter.** Give every `ASTRID_REIGH_*`, `com.reigh.astrid*`, `astrid-reigh-*`, `reigh-astrid-*` and `REIGH_APP_*` form an explicit row (rule 5 has the extension-id rule).
  6. **`Astrid-agent` URLs.** Add the `Astrid-agent` to `astrid-agent` row as a `regex` that matches only inside `github.com/peteromallet/` URLs. Targets: `README.md:19`, `docs/getting-started.md:42`, `docs/setup/README.md:31`, `docs/setup/release-recipe.md:35`, and any other `git grep -n '/Astrid-agent'` hit. D-AS deletes the root `CHECKPOINT.md`.
  7. **Rows a token row would miss.**
     - The three escaped extension-id forms, and the four `com.reigh.astrid` forms ahead of them (rule 5).
     - `peteromallet/reigh` to `banodoco/astrid-app` (rule 2).
     - `astrid/core/timeline/banodoco_schema.py:6,89` ("Banodoco workspace", meaning the community repo): an explicit `<repo>:<file>` row to "the banodoco-workspace repo". Without a row the zero check fails on "Banodoco Workspace".
  8. **Decisions folded in from the open questions.**
     - **The `astrid-runtime` command.** The Runtime defines it (`pyproject.toml:15`, `banodoco_local.cli`). Astrid also has `astrid/runtime_cli.py` with `prog="astrid-runtime"` (`:319`) and no console script. Decide whether they are one command or two, and record it, before C-RT deletes `banodoco-local`.
     - **`reigh-product-connector`.** Re-grep it; the findings disagreed.
     - **`ASTRID_BANODOCO_*` and `banodoco_catalog.py`.** The variables become `ASTRID_RUNTIME_*` unless they collide; the module keeps its community name (section 11 default).
  9. **Dry run, over writable copies of all three repos taken after the D-* PRs** (the manager makes them under `$WORK/dry/`):
     ```
     python3 $TOOLS/map_selfcheck.py
     python3 $TOOLS/rename.py --report-merges --repos $WORK/dry/astrid $WORK/dry/runtime $WORK/dry/app --intended $TOOLS/intended-merges.txt
     for r in astrid runtime app; do python3 $TOOLS/rename.py --repo $WORK/dry/$r --apply; done
     for r in astrid runtime app; do $TOOLS/check-zero --repo $WORK/dry/$r --allow $TOOLS/allowlist.txt; done
     ```
     Every flagged merge is either resolved by a row or listed in `intended-merges.txt`.
  10. Write `map-notes.md`: every judgment call, and every token deliberately left out or deleted, with the reason.
  11. **Taste review.** Opus reads `rename-map.tsv`, `map-notes.md`, `kept-banodoco.txt` and a sample of the `mixed` files. Resolve every name it questions and note the outcome in `map-notes.md`.
- **Invariant:** after the map is applied, no two distinct old names produce the same new name and no new name equals a pre-existing different name in the same scope, unless the merge is listed in `intended-merges.txt` with evidence.
- **Plausible mistake:** accepting the blanket `reigh` to `astrid` for a token that has an `astrid` twin in a context where both appear (a struct with both `astridCommit` and `reighCommit`; a sentence naming both products). The result compiles, the tests pass, and two things have silently merged.
- **Why it looks right:** the collisions are only visible by joining the old-token list against the new-token set across all three repos. Each hit reads fine alone.
- **Acceptance:**
  - `python3 $TOOLS/map_selfcheck.py` exits 0. It checks that no two different `old` values produce the same `new` in one scope unless listed in `intended-merges.txt`, that no `(kind, old, scope)` appears twice, and that every token in `old-tokens.txt` and in the 5a list matches a row, a `kept-banodoco.txt` regex, or a `kept` or `deleted` line in `map-notes.md`.
  - `rename.py --report-merges` over the three dry copies exits 0.
  - `check-zero` over the three renamed dry copies prints only allowlisted files.
  - Opus's questions are all resolved in `map-notes.md`.

#### N-TOOL
- **Route:** normal
- **Depends on:** none. Start with the stub map in step 1. The final test run needs N-MAP's map.
- **Owns:** in `tools/astrid-rename/` on `prep/astrid-rename-tools`: `rename.py`, `check-zero`, `tests/`, `rename-skip.txt`, `allowlist.txt`, `allowlist-final.txt`
- **Outcome:** the two scripts exactly as specified in sections 4.1 to 4.3. The tests below are the contract; where the prose and a test disagree, ask.
- **Steps:**
  1. **Stub map for development:** the six example rows in 4.1, plus one row of each remaining kind (`regex`, a `<repo>:<glob>` scope), in `tests/fixtures/stub-map.tsv`.
  2. **`rename.py`** as in 4.2:
     - `--repo`, `--path`, `--text`, `--apply`, `--report-merges --repos ... --intended`;
     - the 4.1 precedence and scopes;
     - plain file moves, deepest first, with an error if the target exists and a temporary name for case-only moves;
     - the skips (binary, symlinks, `.git/`, `rename-skip.txt`).
  3. **`check-zero`** as in 4.3:
     - the patterns, with `BANODOCO_` and `/Astrid-agent` case-sensitive;
     - `strict` with `kept-banodoco.txt`;
     - `--repo` (scans what `git ls-files` lists), `--path` (files or directories), `--stdin`, `--profile`, `--allow`;
     - exit 1 and `path:line:match` on any hit.
  4. **The three list files,** with the initial entries in 4.3. N-BROWSER and N-CHAIN tell you their exact paths.
  5. **Tests** in `tools/astrid-rename/tests/`, runnable with no network and no git writes (use `git init` in a temp dir only inside the tests):
     - **`rename.py` basics:**
       - apply twice and the second run changes nothing;
       - case variants for `word` rows;
       - a mixed casing such as `rEigh` is reported, not replaced;
       - longest match first (`reigh-app` before `reigh`);
       - `regex` before `path` before `token`, and a narrower scope wins.
     - **Prose rule:**
       - in a file that also contains "Astrid", "Reigh and Astrid" becomes "Astrid App and Astrid", and "Reigh's" becomes "Astrid App's";
       - in a file without "Astrid", "Reigh" becomes "Astrid";
       - `Reigh-app`, `ReighExtension` and `com.reigh.` are not touched by the prose row.
     - **Paths:**
       - a move also replaces the same string in contents;
       - a target that already exists is an error;
       - a case-only rename works.
     - **Skips and modes:**
       - binary files, symlinks and `rename-skip.txt` entries are skipped;
       - `--path` works on a non-git folder and on a single file;
       - `--text` works on stdin.
     - **`--report-merges`** flags each case on seeded inputs:
       - a pre-existing `astridCommit` beside `reighCommit`;
       - two old tokens that map to one new token;
       - `ASTRID_REIGH_X` becoming `ASTRID_ASTRID_X` (stutter);
       - and it passes once the merge is listed in `--intended`.
     - **Untouched:** `@banodoco/timeline-schema`, `banodoco-workspace` (the repo), `banodoco-timeline-schema`, `banodoco_social` and `astrid-agent` are not changed.
     - **Rewritten:** `peteromallet/Astrid-agent` becomes `peteromallet/astrid-agent`.
- **Acceptance:**
  - `python3 -m pytest -q $TOOLS/tests` passes.
  - `printf 'banodoco-workspace @banodoco/timeline-schema banodoco_social banodoco_schema banodoco_timeline_schema\n' | $TOOLS/check-zero --stdin` exits 0 with the stub `kept-banodoco.txt`.
  - `printf 'astrid-agent peteromallet/astrid-agent\n' | $TOOLS/check-zero --stdin` exits 0.
  - `printf 'banodoco-workspace-runtime BANODOCO_LOCAL_HOME\n' | $TOOLS/check-zero --stdin` exits 1.
  - `printf 'https://github.com/peteromallet/Astrid-agent\n' | $TOOLS/check-zero --stdin` exits 1.
  - `printf 'the Banodoco runtime\n' | $TOOLS/check-zero --stdin` exits 1, and `printf 'x-banodoco-owner\n' | $TOOLS/check-zero --stdin` exits 1 (it is not a kept form).
  - The final run against N-MAP's real map also passes.

#### N-BROWSER
- **Route:** normal
- **Depends on:** N-MAP (first map commit)
- **Owns:** new file `src/migrations/astridRenameBrowserMigration.ts` plus its test, the fixture list `tools/astrid-rename/browser-old-prefixes.txt`, and one call site in the App entry (`src/app/main.tsx`; verify it), on branch `prep/astrid-rename-browser`
- **Outcome:** a small one-time App-start migration that copies the old persisted browser keys and databases to their new names, verifies, and deletes the old.
- **Steps:**
  1. Build `browser-old-prefixes.txt` from `inventory.md` section 3 and re-verify each `path:line` against `$APP`. It lists only: the exact localStorage keys and the prefixes `reigh-hidden-shots:`, `reigh:transcript-draft:`, `reigh.runtime.media-import.v1:`, plus the three IndexedDB names `reigh.timeline-drafts`, `reigh.sync-ledger`, `reigh.local-media` (store `reigh.local-media-handles`). Read the new names from the map (do not compute them).
  2. Implement:
     - **localStorage:** for each key that starts with a listed old prefix (or equals a listed key), copy to the new name, read back and compare, delete the old key.
     - **IndexedDB:** one generic copier (schema plus records) for the three databases. `reigh.local-media` holds `FileSystemHandle`s: structured-clone them as they are stored. If a handle cannot be cloned, keep the entry and mark it as needing re-import (the user is already told to drop the file again, `resolveTaskInputMedia.ts:50-60`). Never drop silently.
     - **Not migrated (accepted, section 4.7):** extension-id rewriting inside keys and values, the extension-state stores, `reigh.ext-proposals`, `reigh.dev-extensions.disabled`, the `showDataLanesByKind` value, the Cache Storage `reigh-v3`. The service worker already deletes every cache whose name differs from `CACHE_NAME` on activate (`public/sw.js:89-93`), so the renamed `CACHE_NAME` removes `reigh-v3` for free.
  3. Order per store: read old, write new, read new back and compare, then delete old. Only after **every** store has succeeded, record the completion marker `astrid.rename-migration.v1` (itself a new-name key). If any step fails, leave the old data in place, set no marker, and retry on the next start. No dual read: after the marker is set, no code reads an old name.
  4. Tests with jsdom and `fake-indexeddb`: seed **every** literal from `browser-old-prefixes.txt`; a populated old state migrates to equal new state; running twice is a no-op; a failure mid-way leaves old data intact.
  5. Give N-TOOL the module's and its test's paths for `rename-skip.txt`, `allowlist.txt` and `allowlist-final.txt`, with the removal date in a comment.
     - **5a. Completion signal for M5.** After a run, `localStorage.getItem('astrid.rename-migration.v1')` returns a value; a human can check it in the browser console. If a store failed, it logs one console warning naming the store.
  6. The App's origin must not change in this release. Add an assertion test that `PREVIEW_ALLOWED_HOSTS` still contains `astrid.haus` and write the same-origin constraint into the module header comment.
- **Invariant:** every value a user stored under a listed old name is readable under the new name after the first start, and no code path reads an old name after the marker is set.
- **Plausible mistake:** writing the migration to read the "old key" from the key constants that `rename.py` rewrites, so the migration reads the new names and copies nothing.
- **Why it looks right:** the tests pass if they seed the new names. The mistake is mechanically caught: the literal grep and the seeded test below fail if the module does not hold the old literals.
- **Acceptance:**
  - `npx vitest run src/migrations` passes.
  - `while read p; do grep -qF -- "$p" src/migrations/astridRenameBrowserMigration.ts || echo "MISSING $p"; done < $TOOLS/browser-old-prefixes.txt` prints nothing.
  - `$TOOLS/check-zero --repo $APP --allow $TOOLS/allowlist.txt` passes after `rename.py` on a copy, and the migration file and its test are the only allowlisted files containing `reigh`.
  - `git grep -n "reigh" -- src ':!src/migrations'` on the renamed copy prints nothing.

#### N-SQL
- **Route:** normal
- **Depends on:** N-MAP (first map commit); the human's queries Q1 and Q2 (section 9)
- **Owns:** the new forward migration `supabase/migrations/<timestamp>_astrid_extension_id_prefix.sql` and a second forward migration for the route prose (App, prep branch `prep/astrid-rename-sql`); in the rows-exist case only, the operator script `tools/astrid-rename/extension-id-rows.sql`
- **Outcome:** old names removed from the five migration files that contain them (by `rename.py` through the map), the CHECK and the production prose changed by forward migrations that contain no old name, and the CLI question settled with one query.
- **Steps:**
  1. **Checksum question, one read-only query.** The human runs `\d supabase_migrations.schema_migrations` (Q1) and returns the output. Columns such as `version`, `name` and `statements` are expected and are not checksums. If no column looks like a hash or checksum, in-place edits of old migrations are safe. If one does, **stop and report**.
  2. **In-place edits come from `rename.py`,** not by hand: `20260506115000_seed_section3a_mode_aware_route_metadata.sql` (lines 4, 25, 26, 79, 80: comment and seed text; check that the seed strings are not looked up by value elsewhere), `20260524000000_revert_route_backend_gating_in_claim_and_counts.sql:44,49`, `20260524010000_drop_tasks_assert_claimable_trigger.sql:12`, `20260918000000_retire_legacy_generation_methods.sql:1,3`, and the CHECK at `20260823100000_create_extension_operational_analytics.sql:31` (`com[.]reigh[.]` to `haus[.]astrid[.]`, via the escaped-form map row). Fresh databases then get the new constraint.
  3. **Route prose (E11).** The seed inserted prose such as `'...through the Reigh travel child adapter...'` into `route_backend_capabilities` (`20260506115000...sql:25-26,79-80`). Editing the file leaves the production rows unchanged. Write a forward `UPDATE ... WHERE route_key = '<key>'` for each affected row, setting the text that the renamed seed now contains. The migration contains no old name.
  4. **Extension ids, by row count (Q2).** The human runs `select count(*) from extension_operational_events where extension_id is not null;` and returns the number.
     - **0 rows (expected: the production host is off):** a forward migration drops the CHECK on `extension_operational_events.extension_id` and re-adds it with `^haus[.]astrid[.]`. It contains no old name and goes out through the normal `db push`.
     - **Rows exist:** the data `UPDATE` needs the old prefix as a literal, so it cannot live in a migration. Write `tools/astrid-rename/extension-id-rows.sql`, run once by the human: one transaction that drops the old CHECK, runs `UPDATE ... SET extension_id = regexp_replace(extension_id, '^com\.reigh\.', 'haus.astrid.')`, re-adds the CHECK with the new prefix, prints row counts before and after. The script is deleted with the plan (P-FINAL). Never put it in a migration file. Human step D3 becomes active.
  5. `supabase/config.toml:3` `project_id` is handled by C-APP. The `[functions.reigh-data-fetch]` section is already deleted by D-APP.
  6. Name the new migration files with a timestamp later than every migration on App `main`. When C-APP merges this branch, it re-checks that and renames the files if a later migration has landed since.
- **Acceptance:**
  - `git grep -niE 'reigh' -- supabase/migrations` on the renamed copy prints nothing.
  - The new migration files contain no old name: `grep -il reigh supabase/migrations/<new files>` prints nothing.
  - The report states the Q1 result and the Q2 count, each in one sentence.
  - If a local Supabase stack is already available: `insert ... extension_id = 'haus.astrid.x'` succeeds and `'com.reigh.x'` fails after the migration. Starting a stack just for this is not required.

#### N-CHAIN
- **Route:** normal
- **Depends on:** N-MAP (first map commit)
- **Owns:** `tools/astrid-rename/regen_desert_slice.py` (Astrid), and during the freeze the fixture files under `tests/fixtures/timeline_visualize/desert_slice/` and the frozen constants in `tests/core/timeline/test_timeline_visualize_hashes.py:42-44`
- **Outcome:** a script that rewrites the 145 old-name event lines of `assembly.jsonl` with the new actor id and recomputes `prev_hash` and `hash` for every line using the real hash code, plus updated companion files.
- **Steps:**
  1. Read the canonical hash code: `astrid/core/timeline/events/schema/serialize.py` (`canonical_json_bytes`, `sha256_hex` `:60-61`, `hash_embedded` `:64-77`, `with_event_hash` `:80-82`). Confirm in `types.py:360` (`to_json_obj`) whether `actor` is emitted and so hashed (unverified; assume yes).
  2. Write `regen_desert_slice.py`: parse each line into the event type, replace `actor` (`reigh-app:local-editor` to the map's new id) and display name (`Reigh local editor`), reset `prev_hash` to the chain's genesis or the previous line's new hash, recompute `hash` with `with_event_hash`, emit the line in the same canonical form. Use the library; never reimplement the hash.
  3. Update `assembly.head.json` (`head_last_hash`) and `assembly.identity.json`, and any digest the tests freeze (`test_timeline_visualize_hashes.py:42-44`; canonical digests of `assembly.json` and `registry.json` at `:66-79`). Search every consumer of the timeline ULID `01KYPVKMW5STB4W6FE05ED8242` and of the chain's hashes: `desert_truth.json`, `negative/*/fixture.json`, `tests/fixtures/v10/m7_representative.json`, and **`tests/stage1/test_zero_shim_timeline_cutover_luna.py:100,112,151`**.
  4. Verify the whole chain, not just the last hash: write an assertion (in the script and as a new test) that recomputes every `hash` and `prev_hash` from line 1. The existing test checks only the last hash (`:82-97`), so it would pass over a broken middle. This `--check` is the guard: no whole-chain verifier exists in the repo, and a worker cannot pass it while leaving broken inner hashes.
  5. `rename.py` must skip these fixture files. Give N-TOOL their paths for `rename-skip.txt`; only this script changes them.
- **Invariant:** every line's `hash` equals the hash of its content and every `prev_hash` equals the previous line's `hash`, from genesis to head.
- **Plausible mistake:** string-replacing the actor in the file and fixing only the last hash and the frozen constants so `test_timeline_visualize_hashes.py` goes green, leaving 145 broken inner hashes.
- **Why it looks right:** the existing test does not recompute the chain, so it passes.
- **Acceptance:**
  - `python3 tools/astrid-rename/regen_desert_slice.py --check` exits 0 (recomputes the full chain).
  - `python3 -m pytest -q tests/core/timeline tests/packs/rendering tests/stage1/test_zero_shim_timeline_cutover_luna.py -k "timeline_visualize or snapshot or zero_shim"` passes.
  - `grep -ci reigh tests/fixtures/timeline_visualize/desert_slice/assembly.jsonl` prints 0.

#### N-SAT
- **Route:** normal
- **Depends on:** none to start. Its Astrid `ci.yml` edit waits for D-AS to merge, and its App `README.md` edit waits for D-APP PR 1 (7.9).
- **Owns:** `tools/astrid-rename/satellites.md`; ordinary PRs in Astrid and App that remove references (merged to `main` in Phase 0 when the verdict says retire); prepared scrub PRs for the kept satellites (merged in P-SAT)
- **Outcome:** a verdict for each satellite and the reference-removal PRs.
- **Steps:**
  1. **`banodoco/reigh-worker`.** Decide whether any live deployment still uses it. Check: RunPod templates and images that clone it; the orchestrator's pod startup (`reigh-worker-orchestrator/gpu_orchestrator/runpod/worker_startup.template.sh:254-266` clones `banodoco/Reigh-Worker`); and the human's answer to day-one question 3 (7.4). **Default: deprecated.** The user said so on 17 Oct. Only a "yes, something live uses it" from the human changes the verdict. Evidence so far: Astrid CI fetches it at `efc2276d30c22ac0cbe54f735a1129cef79583ef` in `ci.yml:64` (job `m7-release-candidate`) and `:223` (job `python`), with `REIGH_WORKER_CHECKOUT` at `:52,211`; `tests/integrations/test_c12_cpu_runtime_harness.py:36,44-45` imports `source.runtime.supervisor` and `source.runtime.worker.preflight` with no skip guard.
     - If **nothing live** uses it: open and merge an ordinary Astrid PR that deletes `tests/integrations/test_c12_cpu_runtime_harness.py`, the two fetch steps and the `REIGH_WORKER_CHECKOUT` env lines (`ci.yml:52,63-65,211,222-224`), the comment at `astrid/packs/wan2gp/src/compiler.py:26`, and any remaining `REIGH_WORKER_CHECKOUT` use (9 lines). Check that no `needs:` in `ci.yml` (notably `m8-publication` at line 740) depends on a job that this empties. The repo is then archived (P-SAT, human).
     - If **something live** uses it: rename it to `banodoco/astrid-worker`, treat it as a fourth repo in the codemod run, and update the pod template URL, the `REIGH_*` pod env contract (about 40 names) together with the orchestrator, RunPod volume names (`reigh-livetest-prebuilt-*`) and Astrid's pin. Escalate: this adds a C-WORKER task and the plan must be extended.
  2. **`banodoco/reigh-worker-orchestrator` and `banodoco/reigh-workspace`:** deprecated. Remove references in ordinary PRs: App `README.md:31` (links to both worker repos), Astrid `planning/gen_fal_storyboard.py:23` and `planning/gen_park24_storyboard.py:26` (read a key from a `reigh-workspace/reigh-worker/this.env` path: repoint or delete the scripts), `planning/build_park24_slice.py`, `astrid/packs/blender/deploy.py:391`. (The hard-coded `/Users/peteromalley/...` test paths belong to D-AS.) The orchestrator is blocked from archiving only if `banodoco-workspace/banodoco-worker/` is still deployed on Railway (day-one question 3).
  3. **`banodoco/banodoco-workspace`:** live, name stays. List its old-name hits that refer to renamed repos (`REIGH_SUPABASE_URL` in `banodoco-worker/README.md:33` and `worker_jwt.py:9`, `banodoco-worker/README.md:4-6`, stale Reigh-DB deployment docs, `README.md:82`). Prepare a PR to scrub them, using `rename.py --path` where the map applies. Do not touch `BANODOCO_*` env vars that belong to the community workspace itself.
  4. **`timeline-schema`, `timeline-composition`, `timeline-theme-2rp`:** names stay. Scrub the comment hits (`timeline-schema/typescript/src/schemas.ts:118`, `tests/test_materialize_output.py:105`, `typescript/tests/resolveTheme.test.ts:58`; `timeline-composition/scripts/gen-registry.ts:13,38,55,184`; `timeline-theme-2rp` README:31). `provider: "reigh"` in timeline-schema is a data value: check whether anything persists it before changing it; if so, escalate.
  5. Wan2GP submodule branch `reigh-sprint-3` (`reigh-worker/.gitmodules`): list it; only matters if the worker is kept.
- **Acceptance:**
  - `satellites.md` has one verdict per satellite with `path:line` evidence.
  - After the Astrid PR (if the worker is retired): `git -C $ASTRID grep -nE 'reigh-worker|REIGH_WORKER_CHECKOUT|reigh-workspace' -- . ':!.oracle' ':!.megaplan'` prints nothing, and `python3 -m pytest -q tests/integrations` passes.
  - The ci.yml diff keeps `m8-publication` reachable: `grep -n "needs:" .github/workflows/ci.yml` shows no dangling job name.

#### N-REHEARSE
- **Route:** normal (fan-out by repo and folder)
- **Depends on:** D-APP, D-AS and D-RT merged; N-TOOL's tests pass; `map_selfcheck.py` passes
- **Owns:** throwaway copies under `$WORK/rehearse/`, and the report `$WORK/reports/N-REHEARSE.md`
- **Outcome:** the whole apply rehearsed before the freeze. Map problems are found while they are cheap, the expected fix-ups are listed, and the setup commands are proven.
- **Steps:**
  1. **Copies.** The manager makes fresh copies of the three current mains under `$WORK/rehearse/` and installs their dependencies the CI way (7.1).
  2. **Before.** In each copy, run the C-* acceptance commands and save the failures as the rehearsal baseline.
  3. **Rename.** Apply `rename.py` to all three copies, do C-RT step 4's regeneration, copy the clients (4.4) and run N-CHAIN's script. Use new venvs.
  4. **After.** Re-run the same commands. Classify every new failure:
     - **map problem** (a name is missing or wrong, a merge, a stutter): it goes to N-MAP;
     - **fix-up** (code that needs a hand change after the rename): list it with `path:line` and the change, for C-* to apply.
  5. **Repeat** steps 3 and 4 on fresh copies after each map change, until no map problem remains.
- **Acceptance:**
  - The report lists, per repo, the before and after failure counts, every map problem with its resolution, and every expected fix-up.
  - The last rehearsal shows no open map problem.
  - `check-zero` on the three renamed copies prints only allowlisted files.

### Phase 1: cutover (freeze)

**Pre-condition:**
- All Phase 0 tasks are done and merged, and O-GITHUB is done.
- The human's pre-land items P1 to P4 (section 9) are done.
- The tags `pre-astrid-rename` already exist (D-* step 0).

There is no separate tag gate and no rule that SHAs must equal any prep SHA. The apply run is the real run; its acceptance is the tests against the baseline, plus `check-zero` and the purity check.

**Every apply task (C-RT, C-AS, C-APP) does these, in addition to its own steps:**
- **Step 0.** Its baseline (7.8) has been saved, and it uses a new venv after the rename.
- **R first.** The first commit on `rename/astrid` is the raw `rename.py --apply` output, R. Its purity check (4.5) passes before any fix-up is committed.
- **Rehearsal fix-ups.** It applies the fix-ups N-REHEARSE listed for its repo, as later commits.
- **Tag at landing.** The manager tags R `astrid-rename-commit`, annotated with the recipe from 4.5, and pushes the tag.

#### C-RT
- **Route:** normal (fan-out by folder allowed)
- **Depends on:** O-GITHUB, D-RT, N-TOOL, N-MAP, N-SAT, N-REHEARSE, the freeze steps 1 to 4 (section 6)
- **Owns:** the whole `$RUNTIME` tree during the freeze
- **Outcome:** the Runtime renamed and regenerated, with no failure beyond the baseline, **merged to Runtime `main` on its own**, and `RUNTIME_SHA` reported.
- **Steps:**
  1. The manager runs `git switch -c rename/astrid`.
  2. `python3 $TOOLS/rename.py --repo $RUNTIME --apply`, then the manager commits R (`git add -A`, then `git commit -m "Apply the Astrid rename (rename.py)"`) and runs the purity check (4.5). This renames `banodoco_local/` to `astrid_runtime/`, `packages/python/banodoco_workspace_client/` to `packages/python/astrid_runtime_client/`, and rewrites `pyproject.toml` (`:3` name, `:12-15` scripts, `:15,21` packages), `packages/python/pyproject.toml:2`, `packages/typescript/package.json:2`, env vars, paths (`paths.py:41,53,73`), `CONTROL_VERSION` (`local_worker_composition.py:43`), the clip type (`store.py:1559`, `visual_seam.py:23`), and `README.md` (keep the neutrality sentence true).
  3. Delete the `banodoco-local` script line; rename `banodoco-runtime` per rule 5.
  4. Regenerate: update `generators/generate.py` output paths (`:23`, `:178-190`) via the map, then run it. Regenerate `runtime_protocol/contract_metadata.py`, `packages/python/astrid_runtime_client/{generated,contract_metadata}.py`, `packages/typescript/src/{generated,contract-metadata}.ts`, `clients/typescript/{generated,contract-metadata}.ts`. Never edit them by hand. Update `contract/manifest.json`, `contract/component-manifest.json` and `clients/typescript/component-manifest.json` generator config via the map.
  5. Apply N-REHEARSE's Runtime fix-ups, then fix new failures against the baseline, by folder.
  6. The manager commits, opens the PR and merges it with `gh pr merge --merge`. Report the merged commit as `RUNTIME_SHA`.
- **Acceptance:**
  - `python3 -m pytest -q` in `$RUNTIME`, in a new venv: failures are a subset of the mapped baseline.
  - The purity check of R passes.
  - `python3 generators/generate.py && git diff --exit-code` (regeneration is a no-op).
  - `$TOOLS/check-zero --repo $RUNTIME --allow $TOOLS/allowlist.txt` passes.
  - `git ls-files | grep -iE 'egg-info|banodoco_local|reigh'` prints nothing.
  - `grep -n 'astrid-runtime\|banodoco' pyproject.toml` shows one `astrid-runtime` script and no `banodoco-local`.
  - `git -C $RUNTIME log -1 origin/main` shows the merge.

#### C-AS
- **Route:** normal (fan-out by folder allowed)
- **Depends on:** C-RT (`RUNTIME_SHA`, merged), N-CHAIN, D-AS, N-SAT, N-MAP, N-REHEARSE
- **Owns:** the whole `$ASTRID` tree during the freeze
- **Outcome:** Astrid renamed and pinned once to `RUNTIME_SHA`, with no failure beyond the baseline, and branch `rename/astrid` pushed.
- **Steps:**
  1. The manager runs `git switch -c rename/astrid`. Then `python3 $TOOLS/rename.py --repo $ASTRID --apply` (it skips the desert_slice fixture files), and the manager commits R and runs the purity check (4.5). This moves `banodoco_workspace_client/` to `astrid_runtime_client/`, rewrites 37 importing `.py` files, `pyproject.toml:84` (`include = ["astrid*", "astrid_runtime_client*"]`), `ci.yml`, env vars (`journey.py:599,617`, `generic_host.py:13497`, `autobootstrap.py:127,143`, `docs/reference/env-vars.md:15`, `.env.example:20-21`), `release_identity.py:81,183`, `skills/view.py:43`, docs and SKILL text.
  2. Re-vendor the client: copy `astrid_runtime_client/{__init__,generated,contract_metadata}.py` from the Runtime at `RUNTIME_SHA` (`cmp` must show identical). Update the pinned values at `tests/stage1/test_vendored_workspace_client_parity_luna.py:35-39` and `astrid_runtime_client/contract_metadata.py:4-5` (renamed file) from the regenerated output.
  3. CI: in `ci.yml`, set the Runtime fetch URL to `https://github.com/banodoco/astrid-runtime.git` and the SHA to `RUNTIME_SHA` (lines 61, 220); rename env `BANODOCO_RUNTIME_CHECKOUT` as the map says. The worker fetch is already gone if N-SAT retired it.
  4. Regenerate `config/astrid-capability-census.lock.json` with `python -m astrid.core.execution.capability_ledger approve`. There are no `reigh.*` rows left to rename (D-AS).
  5. Run N-CHAIN's `$TOOLS/regen_desert_slice.py`; the manager commits the fixture changes.
  6. `ASTRID_RUNTIME_CUSTODY_*` stay (both ends in this and the Runtime repo; no old name).
  7. Apply N-REHEARSE's Astrid fix-ups, then fix new failures by folder (fan-out, 7.6). Change an assertion only as the preamble allows (7.5); otherwise fix the code, or return the case to the map owner.
  8. The manager commits and pushes `rename/astrid`. Do not merge yet (C-INT first).
- **Acceptance:**
  - `python3 -m pytest -q`, the full suite in a new venv: failures are a subset of the mapped baseline.
  - The purity check of R passes.
  - `python3 -m pytest -q tests/stage1/test_vendored_workspace_client_parity_luna.py tests/core/timeline/test_timeline_visualize_hashes.py` passes.
  - `python3 $TOOLS/regen_desert_slice.py --check` exits 0.
  - `$TOOLS/check-zero --repo $ASTRID --allow $TOOLS/allowlist.txt` passes.
  - `cmp -s $ASTRID/astrid_runtime_client/generated.py $RUNTIME/packages/python/astrid_runtime_client/generated.py && echo same` prints `same`.

#### C-APP
- **Route:** normal (fan-out by folder: the failure triage is the large part)
- **Depends on:** C-RT (`RUNTIME_SHA`, merged), D-APP, N-BROWSER, N-SQL, N-SAT, N-MAP, N-REHEARSE, the human's P3 (Railway domain)
- **Owns:** the whole `$APP` tree during the freeze
- **Outcome:** the App renamed, typed, tested, built; branch `rename/astrid` pushed.
- **Steps:**
  1. The manager runs `git switch -c rename/astrid`. Then `python3 $TOOLS/rename.py --repo $APP --apply`, and the manager commits R and runs the purity check (4.5). This covers the 71 renamed paths (inventory section 2), identifiers (`ReighExtension` 283 uses, `ReighRuntimeClient` 146), tsconfig aliases, `vite` and vitest aliases (`config/vite/vite.config.ts:170`, `config/testing/*`), wire tags, schema ids, extension ids in all four forms (plain and the three escaped), env vars, storage keys, workflow, contracts, README.
  2. Copy the client from the Runtime at `RUNTIME_SHA` using the table in 4.4: `packages/typescript/src/generated.ts` to `src/integrations/runtime/generated.ts`, and `packages/typescript/src/contract-metadata.ts` to `src/integrations/runtime/generated-contract-metadata.ts`. `cmp` must show them identical. **Update the literal `SCHEMA_DIGEST` pin at `src/integrations/runtime/client.test.ts:384`** to the new value.
  3. The manager merges `prep/astrid-rename-browser` and `prep/astrid-rename-sql`. This happens after R, so `rename.py` never touches the migration module (it is in `rename-skip.txt` anyway). Re-check N-SQL's migration timestamps (N-SQL step 6).
  4. Rename `_shared/reighAppendService.ts` and its env vars (`ASTRID_APP_APPEND_SERVICE_URL`, `ASTRID_APP_APPEND_SERVICE_INTERNAL_TOKEN`; the map is authoritative). Set `project_id` in `supabase/config.toml:3`. (`reigh-data-fetch` is already deleted by D-APP.)
  5. `config/vite/policy.ts:6-11`: replace the old Railway host with the new one from the human's P3 answer, recorded in `STATUS.md`. Never guess it. `astrid.haus` stays. The dead domains are already gone (D-APP).
  6. Historical, nothing to do: `.github/workflows/bridge-latency.yml` (the `repository:` and `path:` lines at 34-39,47,53) was deleted with the bridge-latency gate, so there is no workflow to rename.
  7. Contracts: the repository keys in `config/contracts/astrid-plan-a-c1.json` and `c2.json`, the enum at `scripts/quality/lib/astrid-contract-schema.mjs:10`, and `check-astrid-contract-freeze.mjs:71,96,218` (N-MAP's scoped rows do this in R). These are gate inputs: the enum and the data change together.
  8. Apply N-REHEARSE's App fix-ups. Then the lead runs `npx --no-install tsc -p tsconfig.app.json --noEmit`, `npx --no-install vitest run` and `npm run build` in the background, and triages new failures by folder with parallel Luna workers (7.6). The folders are `src/tools/video-editor/runtime`, `components`, `examples`, `hooks`, `lib`, `contexts`, `data` and `dev`, then `src/sdk`, `src/integrations`, `scripts`, `docs`, `supabase`, plus one worker for root files, `config/`, `public/` and files directly under `src/`. Workers fix only their folder.
  9. **Last, after C-AS has pushed its final branch:** re-hash the contract freeze as in 4.4, using the C-AS checkout and the Runtime at `RUNTIME_SHA`.
  10. The manager commits and pushes `rename/astrid`. Do not merge yet (C-INT first).
- **Acceptance. This local run is the real gate.** App CI runs no `tsc`, no `npm run build` and no full vitest suite (the workflows are `dockerfile-check`, `slot-first-audit`, `test` and `direct-journey`; `bridge-latency` is deleted), so a green CI check does not prove these:
  - `npx --no-install tsc -p tsconfig.app.json --noEmit`, `npx --no-install vitest run` and `npm run build`: failures are a subset of the mapped baseline. A baseline of zero means these must exit 0.
  - The purity check of R passes.
  - `node scripts/quality/check-astrid-contract-freeze.mjs --astrid-root $ASTRID --runtime-root $RUNTIME` exits 0, with `$RUNTIME` checked out at `RUNTIME_SHA`.
  - `$TOOLS/check-zero --repo $APP --allow $TOOLS/allowlist.txt` passes.
  - `git ls-files | grep -i reigh` prints nothing.

#### C-INT
- **Route:** normal (the checks), review (the Astra sense check), taste (the Opus review)
- **Depends on:** C-RT (merged), C-AS, C-APP
- **Owns:** nothing. These are read-only checks; the fixes are commits on the C-AS and C-APP branches.
- **Outcome:** proof that the renamed Astrid and App work with the merged Runtime, plus an independent review, before Astrid and the App land. This is their pre-merge check.
- **Steps:**
  1. **Cold launch.** In `$ASTRID` (`rename/astrid`, new venv), with the Runtime checkout variable (its new name from the map) set to `$RUNTIME` at `RUNTIME_SHA`: `python3 -m pytest -q -rs tests/stage1/test_cold_launch_autobootstrap.py`. No test may be skipped. (`test_final_cold_launch_matrix_luna.py` needs a release input manifest, `:19-27`, that no CI job provides; it is not run here.)
  2. **Bridge.** Retired: `make bridge-latency-check`, `scripts/bridge-latency-*` and `bridge-latency.yml` are deleted, so there is no bridge acceptance step. The App-side behaviour check is the direct journey (`npx playwright test -c playwright.direct.config.ts`), under the journey lock.
  3. **Live smoke, safely.**
     - Start the renamed Runtime with its data root inside the fresh clone, `$WORK/astrid/.astrid-data` (the layout `dev-local-workspace.mjs:23-28` expects), on a non-default port.
     - `astrid-runtime status` must show that path before any request.
     - Then, in `$APP`: `ASTRID_CHECKOUT=$WORK/astrid npm run dev:local`.
     - In a browser, load the App, create a timeline, save it and reload. Run a live-scene request if the dev setup offers one, and confirm the actor id `astrid-browser` and the `<astrid_live_scene_*>` tags in the Runtime's events.
     - If the manager has no browser tool, the human does this five-minute check.
     - Record the exact commands used (launch, port, data root, status) in `STATUS.md`. V-REVIEW reuses them.
  4. **Astra sense check.**
     - **Input:** the merged Runtime diff and the Astrid and App `rename/astrid` diffs against `main`; the map, `map-notes.md`, `intended-merges.txt` and the `--report-merges` output.
     - **The claim to test:** "these diffs rename without merging distinct things, without aliases or fallbacks, and without hand-edited generated files". Give it the N-MAP invariant, not a conclusion.
     - **Method:** it fans out Luna sub-agents by area. Every finding needs a `path:line`.
  5. **Opus taste review** of the user-visible text in the diffs (UI strings, README and install text, extension-author docs) and of every line changed in the `mixed` files (`--report-merges` list 4). Rewording goes in as fix-up commits and never changes a name; names go to the map owner (7.7).
  6. **Fixes.**
     - Astrid and App findings that pass the triage rule (V-REVIEW) are fixed before C-LAND.
     - A Runtime finding follows the once-only procedure in 7.9.
     - After any Astrid fix-up, re-run C-APP step 9 (the contract re-hash).
- **Acceptance:**
  - Steps 1 and 2 pass against the baseline.
  - The step 3 smoke is recorded in `STATUS.md` as succeeded, with the data-root path shown.
  - Every Astra finding is either fixed or rejected with a one-line reason in `STATUS.md`.
  - Opus's rewording is committed.
  - The contract freeze check with all three roots passes.

#### C-LAND
- **Route:** human (merge rights), or the manager if it has them
- **Depends on:** C-INT, and the human's pre-land items P1 (the new-name secrets and variables set beside the old) and P2 (merge commits allowed). The App deploys on merge, so P1 must come first.
- **Owns:** the Astrid and App mains, and the `astrid-rename-commit` tags
- **Outcome:** `rename/astrid` merged into Astrid `main` and then App `main`. The Runtime is already on `main` (C-RT).
- **Steps:**
  1. `gh pr merge --merge` for Astrid, then the App. Each gets a merge commit; **never squash**, so R survives on `main` for the recipe (4.5).
  2. In all three repos, tag R `astrid-rename-commit`, annotated with the recipe from 4.5, and push the tags.
  3. Re-run C-APP's acceptance commands once on the merged App `main`.
- **Acceptance:**
  - `git -C <each> log -1 origin/main` shows the merge, and `git ls-remote --tags origin astrid-rename-commit` prints one line in each repo.
  - Astrid CI is green on `main`.
  - C-APP's `tsc`, `vitest run` and `build` pass against the baseline on the merged App `main`. A green App CI alone is not evidence; it does not run them.

#### O-DEPLOY
- **Route:** human
- **Depends on:** C-LAND
- **Owns:** Supabase, Railway, secrets, CI variables
- **Outcome:** deployed under the new names (human checklist D1 to D9). The old-name secrets and variables are removed only after verification.
- **Acceptance:**
  - The App loads on `https://astrid.haus`.
  - A request to the append service succeeds with the new secrets.
  - No request hits an old function URL.
  - The old-name secrets and variables are gone.

#### C-MIGRATE
- **Route:** human (runs the commands). The manager prepares the exact command lines per machine.
- **Depends on:** O-DEPLOY, and the list of machines (day-one question 5)
- **Owns:** per-machine data
- **Outcome:** each machine's support folder moved, the live film stack on renamed code with its env file switched, and the browser copier run once. Human checklist items M1 to M5.
- **Steps (the agent prepares these for each machine; section 9 holds the checklist):**
  1. **Census.** Before anything moves, list every realm file on the machine, then scan each one with its name in the output:
     ```
     find "$HOME/Library/Application Support/Banodoco" "$HOME/Developer/astrid-video/astrid-local" -name 'realm.sqlite3*' -not -path '*/node_modules/*' 2>/dev/null | sort > realms.txt
     [ -s realms.txt ] || echo "STOP: no realm files found"
     while read -r f; do echo "== $f"; LC_ALL=C grep -a -o -e 'com\.reigh\.' -e 'reigh-fnv1a64-v1:' -e 'reigh\.transcript' -e 'reigh-browser' "$f" | sort | uniq -c; done < realms.txt
     ```
     Check the list against the realm paths in the support folder's `catalog.json` and against every data root set in `astrid-local/*/env.sh`. A realm missing from `realms.txt` is a stop. Expect only `==` lines. If a targeted string appears, stop (7.7); an operator script is written only after the manager has seen the counts.
  2. **Relocate with the old install, in a clean shell.** Open a new terminal that has not sourced any `env.sh`. Check with `if env | grep -qE 'BANODOCO_|REIGH_'; then echo "STOP: old env set"; fi`; it must print nothing. Then `command -v astrid-runtime` must point at the machine's old install (the one serving the support folder). `relocate` takes its source from the path the running code computes (`relocation.py:244-253`). With the film's `BANODOCO_LOCAL_DATA_ROOT` set, that source would be the film's `.astrid-data`, and relocate would move the film.
     - It needs a running Runtime owner process (`relocation.py:257-259`), so run it with the **old** install running.
     - Run `astrid-runtime backup --destination "$HOME/astrid-rename-backup-$(date +%Y%m%d)"`, a new folder outside the support folder, and check that it is not empty.
     - Run `astrid-runtime relocate --plan --destination "$HOME/Library/Application Support/Astrid Runtime"`. The source in its output must equal the expanded path `$HOME/Library/Application Support/Banodoco`. **If it is anything else, stop.** The output also names the realm id for the next step. If relocate refuses (an existing or conflicting destination, or another file system, `relocation.py:166-178`), stop.
     - Run `astrid-runtime relocate --confirm "RELOCATE <selected-realm-id>" --destination "$HOME/Library/Application Support/Astrid Runtime"`. `--destination` is required on both calls (`cli.py:104-109`).
     - Use `relocate`, not `mv`: `catalog.json` stores absolute realm paths and relocate rewrites them (`:75`, `:322`).
     - `upgrade --destination` is not a shortcut. It migrates and relocates, but it neither installs the renamed code nor switches the env (`operator_upgrade.py:198-199,261-283`).
  3. **Switch code and env names together,** after the relocation, not before. The agent writes the exact commands per machine, after finding how that machine's Runtime is installed (`command -v astrid-runtime`, then `pip show` in its venv). They include a rollback: reinstall the old install from the `pre-astrid-rename` tag and restore the backup.
     - Stop the old Runtime and install the renamed one.
     - Update shells and launch configs: `BANODOCO_LOCAL_*` and `BANODOCO_RUNTIME_*` become `ASTRID_RUNTIME_*`, and `REIGH_*` becomes `ASTRID_APP_*`, per `map-notes.md`.
     - Start it.

     Old code reads old names, so the env change must not come before the code change.
  4. **The live film stack is never relocated.** `astrid-local/live-main/env.sh` sets `BANODOCO_LOCAL_DATA_ROOT` to the 1.4 GB film realm under `astrid-local/Astrid/.astrid-data`. Rename only that variable in `env.sh`, **in the same step** that moves the live stack onto renamed code. That step, in order:
     1. Stop the live stack's Runtime.
     2. In `live-main/Runtime` and `live-main/Astrid`, run the 4.5 recipe on their branches.
     3. Install into new venvs.
     4. Rename the variable in `env.sh` (the new name is in `map-notes.md`).
     5. Start the stack.
     6. Check that `astrid-runtime status` shows the film root.

     Only then send traffic.
     - Never run renamed code with the old env file. It would ignore the old variable, fall back to the default support folder (`paths.py:15,47,53`) and find or create a different, empty realm.
     - No clean-up touches that realm.
  5. **Browser.** Open the App once in each browser profile used with Astrid. In the console, `localStorage.getItem('astrid.rename-migration.v1')` must return a value (N-BROWSER step 5a).
- **Acceptance:**
  - The census output is recorded per file for each machine.
  - The relocate plan output named the old support folder as its source.
  - `astrid-runtime status` is healthy.
  - `ls "$HOME/Library/Application Support/Astrid Runtime"` shows `runtime/` and `credentials/`, and the old folder is gone.
  - On the live film stack, before any traffic: `astrid-runtime status` reports the film data root, and `du -sh astrid-local/Astrid/.astrid-data` is still about 1.4 GB.
  - Each browser profile shows the marker.

### Phase 2: after

#### P-LOCAL
- **Route:** normal
- **Depends on:** C-LAND
- **Owns:** the local files listed below
- **Outcome:** local tooling uses the new names. Verify each entry, then do it, in one pass.
- **Steps:** all paths are on the human's Mac. Verify each entry, then execute it. Use `rename.py --path` where the map applies.
  - **Skills.** `~/.local/state/astrid/skills/claude/` and `.../codex/` hold 5 identical files each:
    - `packs/rendering/references/live-scenes-authoring.md` (12 hits);
    - `pack-builder/SKILL.md` (9 hits, links to `github.com/peteromallet/Astrid/blob/main/...`);
    - `packs/rendering/SKILL.md` (3);
    - `references/document-checkout.md` (2);
    - `references/placeholder-voiceover.md` (1).

    These are generated from the Astrid repo (`astrid/skills/view.py:43`, `_PACK_BUILDER_DOC_PREFIX`). Rebuild them from the renamed Astrid; do not edit them. Find the rebuild command in `astrid/skills/` and record it. `~/.codex/skills/astrid` is a symlink to the codex tree.
  - **`~/.codex/config.toml`.** The project-trust keys at lines 170, 188, 362, 401 and 425 (`[projects."…/reigh-…"]`) are keyed on directory paths. Update a key when its folder is renamed; delete it when the folder no longer exists.
  - **Hivemind** (`~/Developer/hivemind`). `hivemind_scripts/rehearse_embedding_pilot.py:47` and `rehearse_historical_backfill.py:90` default `VIBECOMFY_ROOT` to `/Users/peteromalley/Documents/reigh-workspace/vibecomfy`, a path that does not exist. That is a pre-existing bug: make it a required env var. History files there stay.
  - **`~/Developer/astrid-video/astrid-local/`:**
    - **Live stack files.** The `LOCAL_REVIEW_CHECKPOINT.json` URLs in `live-main/Runtime/` and `live-main/Astrid/`; `live-main/Runtime/contract/manifest.json`, `contract/component-manifest.json` and `clients/typescript/component-manifest.json` (generator config); the top-level `*.sh`. `live-main/` catches up with the recipe in 4.5.
    - **Vendored copies.** `labs/*/app/supabase/config.toml` and `vendor/timeline-schema/python/pyproject.toml`: regenerate them from source.
    - **The directory `reigh-app`.** Before renaming it to `astrid-app`, run `grep -rl 'astrid-local/reigh-app' ~/Developer/astrid-video/astrid-local --include='*.sh' --include='*.json'` and update every hit in the same step. The rename itself needs the human's go: it sits beside the live stacks.
    - **`live-main/env.sh`** follows the rule in C-MIGRATE step 4. If C-MIGRATE has not already switched it, it is switched in the same step that moves `live-main` onto renamed code, never later.
    - **Older stacks** (`combined-*`, `checkpoint-*`, `main-*`, other `labs/*`) are checkouts of old commits, not residue. This plan does not edit them. Updating or deleting one needs the human's explicit go.
  - **Review tooling.** `~/Developer/astrid-video/production/review/merge/watch-codex.sh`, `watch-codex-once.sh`, and 9 of the 11 `*.md` notes there. Edit those named files only. Do not delete or move anything under `production/`, any runtime data root, or the film.
  - **Otto and portfolio records,** and `~/Developer/otto-program` projects that name the repos: list them only. This plan does not edit Otto records (section 11).
  - **Shell profiles.** `~/.zshrc`, `~/.zprofile` and `~/.config`, for `BANODOCO_*` and `REIGH_*`.
  - **Git remotes.** For each local clone whose `origin` URL names an old repo, run `git remote set-url origin <new URL>`.
- **Acceptance:**
  - `$TOOLS/check-zero --profile local --path ~/.local/state/astrid/skills --path ~/.codex/config.toml --path ~/Developer/hivemind/hivemind_scripts --path ~/Developer/astrid-video/astrid-local/live-main` exits 0.
  - Dated history files in those trees go into an allowlist file that must be empty for P-FINAL. Each one is therefore deleted or fixed, never from `production/` or runtime data.

#### P-R4
- **Route:** normal
- **Depends on:** C-LAND
- **Owns:** the planning docs in `~/Developer/astrid-video/.otto/runs/timeline-platform-r4/` (a git repo of its own)
- **Outcome:** R4 workers write the new names from now on.
- **Steps:**
  - Apply `rename.py --path` to the cards and briefs workers execute (about 90 lines):
    - `cards.md` lines 145, 299, 480, 1065, 1078 and 1091 (start-from paths `banodoco_workspace_client/generated.py`, `P/scripts/reigh-acp-bridge.ts`);
    - `spec-rendering.md`;
    - `briefs/WS-SAVE.md` (`BANODOCO_LOCAL_DATA_ROOT`, `banodoco-local`);
    - `agent_goal.md`, `status.md`, `open-questions.md`, `northstar.md`, `manager-brief.md`.
  - **Delete `reviews/*.md`** instead of rewriting them: they quote dated review history (section 4.6).
  - Pin the names R4 introduces: `scripts/astrid-acp-bridge.ts`, and the composition package `@banodoco/timeline-composition` (unchanged).
  - If R4's cards are also Otto records (day-one question 6), hand their owner the `rename.py --text` output for the same text.
- **Acceptance:** `$TOOLS/check-zero --profile local --path ~/Developer/astrid-video/.otto/runs/timeline-platform-r4` exits 0.

#### P-SAT
- **Route:** human
- **Depends on:** N-SAT, C-LAND
- **Owns:** the GitHub settings of the satellites
- **Outcome:** per N-SAT's verdicts:
  - `reigh-workspace` and `reigh-worker-orchestrator` are archived;
  - `reigh-worker` is archived, or renamed if something live uses it;
  - the `banodoco-workspace` and `timeline-*` scrub PRs are merged.

  See human checklist S1 to S5.
- **Acceptance:** `gh repo view banodoco/reigh-workspace --json isArchived` prints `true`, and the scrub PRs are merged.

### Phase 3: review rounds

#### V-REVIEW
- **Route:** review. The Astra lead hands its legwork to Luna workers. Fixes go to Luna (mechanical), Sol (map or merged-concept fixes) or Opus (wording).
- **Depends on:** P-LOCAL, P-R4 and P-SAT; O-DEPLOY and C-MIGRATE done
- **Owns:** `$WORK/review/round-<n>/`. Each fix is a small ordinary PR, opened and merged by the manager.
- **Outcome:** up to five rounds of independent gap-finding over the finished rename, ending in a clean round.
- **Each round, `n` = 1 to 5:**
  1. **Fresh clones.** The manager makes fresh clones of the three current mains and the kept satellites (`banodoco-workspace`, `timeline-schema`, `timeline-composition`, `timeline-theme-2rp`) under `$WORK/review/round-<n>/`, installs the three repos' dependencies the CI way (7.1), and writes each clone's SHA into `round-<n>/SHAS.txt`.
  2. **A fresh Astra session** (`gpt-6-astra`, reasoning `xhigh`, `-s workspace-write -C $WORK/review/round-<n> -o $WORK/review/round-<n>/astra-final.txt`, with `-c 'sandbox_workspace_write.network_access=true'` for read-only network checks) gets the brief below. It also gets the launch commands C-INT recorded in `STATUS.md`, and the manager's read-only outputs of `npx supabase functions list --project-ref <ref>` and the Railway domains, because Astra has no credentials.
     - From round 2 on, the brief also includes every earlier `findings.md` with each finding's outcome, plus the earlier "areas checked" lists.
     - Astra first re-verifies each fixed finding, then looks where earlier rounds did not.
  3. **Triage.** The manager applies the triage rule to each finding.
  4. **Fix.** The manager opens and merges the fixes, then re-runs `check-zero` (main profile, all three repos) and the baseline test commands on the new mains.
  5. **Stop or continue.**
     - **Stop with success** after the first round with no `blocker` or `major` finding that passes triage, provided the mains have not moved since that round's clones (`SHAS.txt`). If they have, the next round runs on the new mains.
     - **Stop and escalate** after round 5 if any remain: write them to `QUESTIONS.md` for the human, and do not run P-FINAL.
- **Astra brief (give it verbatim, with the paths filled in):**
  > You are an independent reviewer looking for gaps in a finished rename of three repositories. Test this claim: "every old name is gone from the three repos, the kept satellites, the local tooling and the deployed services; there is no alias or fallback; nothing distinct was merged; and everything still works."
  >
  > The requirements are sections 2, 4.7, 5 and 10 of `<README path>` and the clean-break rule in its Summary. Do not trust the plan's own checks: they are part of what you are testing.
  >
  > Fan out Luna sub-agents (`spawn_agent` with `model: "gpt-6-luna"`; not Sol) by area, as many as the work splits into, and keep the judgment yourself. Use tools and run things. Reading is not enough: every finding needs a command you ran and its output, or a `path:line`.
  >
  > Cover at least these areas:
  > 1. **Residue the zero check cannot see:** binary files and images (view them: logos, screenshots, favicons, PDFs, fonts); generated and vendored files; lock files; split, encoded or URL-encoded strings; file names; tags and branch names on each origin; GitHub repo descriptions, topics, homepages and templates (`gh api`); CI workflow and job names.
  > 2. **Meaning:** identifiers or prose where two concepts now share one name (sample the `mixed` files, `intended-merges.txt`, the env vars); stutter such as `astrid…astrid` or `app…app`.
  > 3. **Behaviour:** the full test suites, `tsc`, the build, `tests/stage1/test_cold_launch_autobootstrap.py` and the App's direct journey (the bridge-latency check is deleted). Run a Runtime only with the launch commands given (from C-INT), on a data root inside your folder and a non-default port, and confirm its status shows that root before any request.
  > 4. **Deployed surfaces, read-only:** the production App at https://astrid.haus (page text, `https://astrid.haus/runtime-config/v1/extensions.json`, the served JS bundles); the Supabase function list and Railway domains you were given; the README text the HuggingFace upload function writes (read its source, never invoke it).
  > 5. **Aliases and fallbacks:** code that reads two names for one thing, re-exports, compatibility shims, `|| process.env.<old>`.
  > 6. **Local tooling and satellites,** as listed in P-LOCAL and N-SAT.
  > 7. **Anything the plan forgot.**
  >
  > Never write to any timeline, data root or service outside your folder. Network checks use GET only: `curl` without `-X`, `-d` or `-F`; `gh api` without `-X`, `-f` or `-F`. Never invoke a function, deploy or upload anything.
  >
  > Start `findings.md` with the SHAs from `SHAS.txt`. In "areas checked", list every area with the commands you ran, including the ones that found nothing.
  >
  > Write `<folder>/findings.md`. For each finding give:
  > - an id;
  > - a severity: `blocker` (breaks something, or leaves an old name users or agents see), `major` (an old name or merged concept anywhere in a tree or a deployed config) or `minor` (style or wording);
  > - the requirement it violates, with its plan section;
  > - the evidence;
  > - the smallest fix.
  >
  > Then add an "areas checked" list with the method used for each. Put anything that does not violate a stated requirement under a separate "suggestions" heading. New mechanisms belong there, never among the findings.
- **Triage rule, applied mechanically by the manager.** A finding is acted on only if:
  1. it names a stated requirement;
  2. its evidence reproduces when the manager runs it;
  3. its fix adds no mechanism, alias or scope.

  A real violation whose smallest fix is unclear is not rejected: it goes to `QUESTIONS.md`. Everything else goes into `STATUS.md`, as a rejected finding with a one-line reason or as a suggestion for the human. Name changes go to the map owner (7.7); wording goes to Opus.
- **Acceptance** (on the success path; the escalation path ends in `QUESTIONS.md` instead):
  - The last round's `findings.md` has no `blocker` or `major` that passes triage.
  - Every finding that was acted on has a merged fix.
  - Every rejected finding has its reason in `STATUS.md`.
  - After the last fix, `check-zero` and the baselines pass on the current mains.

#### P-FINAL
- **Route:** normal (the manager runs it), after the human approves (F1)
- **Depends on:** V-REVIEW ending in a clean round
- **Owns:** `docs/plans/astrid-naming/`, `tools/astrid-rename/`, the `astrid-rename-done` tags and the follow-up issue
- **Outcome:** the final zero, the completion tags, the F-WINDOW issue recorded, the plan deleted, and the plan's branches gone.
- **Steps:**
  1. Run the steps of section 10, in order.
  2. Delete the branches `prep/astrid-rename-*` and `rename/astrid`, locally and on each origin. Their content is on `main`.
- **Acceptance:** section 10.

### Standalone follow-up

#### F-WINDOW
- **Route:** normal (a three-line job; schedule it as a reminder)
- **Depends on:** a date, about 30 days after O-DEPLOY and C-MIGRATE. It does **not** depend on the plan, the map, the tools or `check-zero`, which are gone by then.
- **Owns:** the browser migration module in the App
- **Outcome:** the browser copier is deleted.
- **Steps:** delete `src/migrations/astridRenameBrowserMigration.ts`, its call site in `src/app/main.tsx` and its test.
- **Acceptance:** `git -C <app> grep -il reigh` prints nothing; the App's tests still pass.
- **How it is recorded.** P-FINAL opens a GitHub issue in the App repo, worded without any old name, for example: "Delete `src/migrations/astridRenameBrowserMigration.ts`, its call site in `src/app/main.tsx` and its test after <date>. Then a case-insensitive grep for the App's old product name returns no files." The issue is the reminder.

---

## 9. Human checklist

All items are human actions with credentials. Do them in this order. The manager pastes the exact commands. Phase 0 items can be done now.

**Phase 0 (now)**

*GitHub (O-GITHUB)*
- [ ] G1. As org admin of `banodoco`: rename `banodoco/reigh-app` to `astrid-app`. Settings, General, Repository name. Or `gh repo rename astrid-app -R banodoco/reigh-app`.
- [ ] G2. Rename `banodoco/banodoco-workspace-runtime` to `astrid-runtime`.
- [ ] G3. As owner of `peteromallet/Astrid-agent`: rename to `astrid-agent` (case-only; unverified that GitHub accepts a case-only change in one step. If not, rename via a temporary name, then back; do not create a repo at the old name).
- [ ] G4. Confirm the targets were free first: `gh repo view banodoco/astrid-app`, `banodoco/astrid-runtime`, `peteromallet/astrid-agent` must report not found before the rename.
- [ ] G5. Do not create any repo under an old name; that would kill the redirect. Leave redirects alone.
- [ ] G6. Re-check integrations bound to the old repos, now rather than in the freeze: Railway's GitHub connection for the App, Supabase's GitHub integration (reconnect), webhooks, deploy keys, branch protection, Actions secrets and variables (secrets stay with the repo on rename; reconfirm). Workflow `uses:` lines are not redirected on rename; there are none to the old repos today (verify with `grep -rn 'uses: *\(banodoco\|peteromallet\)/' .github`).
- [ ] G7. Allow merge commits on all three repos (Settings, General, Pull Requests, "Allow merge commits"). The rename branches must land with a merge commit (4.5). Check: `gh api repos/<each> --jq .allow_merge_commit` prints `true`.

*Read-only queries for N-SQL*
- [ ] Q1. Against the production Supabase project, in the dashboard's SQL editor or with `psql` and the project's connection string: `\d supabase_migrations.schema_migrations` (in the SQL editor, `select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';`). Return the output. (No hash column is expected.)
- [ ] Q2. `select count(*) from extension_operational_events where extension_id is not null;`. Return the number. (0 is expected.)

*Security follow-through for D-APP*
- [ ] Q3. After D-APP PR 1 merges: confirm Railway deployed `main`, and redeploy the edge function that wrote the dead domain: `npx supabase functions deploy huggingface-upload --project-ref <ref>`.
- [ ] Q4. Do not point anything at `reigh.art`, `reigh.ai` or `reigh.app`. A third party holds `reigh.art`; `reigh.ai` and `reigh.app` do not resolve. Their DNS and registration are the owners' call (D7), but no code references them any more.

**Pre-land, before the freeze ends in C-LAND** (each adds or prepares; nothing old is removed yet)
- [ ] P1. Add every new-name secret and variable **beside** the old one: Supabase secrets `ASTRID_APP_APPEND_SERVICE_URL` and `ASTRID_APP_APPEND_SERVICE_INTERNAL_TOKEN` (the values of the `REIGH_*` ones); the Railway build variable `VITE_ASTRID_APP_APPEND_SERVICE_URL`; any CI repository variables (D6). Railway builds the App on merge and bakes in the `VITE_` value, so without P1 the first renamed build ships without the append URL. Having both set briefly is configuration, not an alias: no code reads both.
- [ ] P2. G7 is done (merge commits allowed).
- [ ] P3. Add a new Railway domain for the App service (for example `astrid-production.up.railway.app`) beside `reigh-production.up.railway.app`, and give the manager the exact host. C-APP writes it into `PREVIEW_ALLOWED_HOSTS`. Remove the old domain in D5.
- [ ] P4. At freeze start, pause everything that merges into the three mains: the hourly merge check (the `production/review/merge/HOURLY-CHECK.md` loop), Codex merge sessions, and the R4 integrator (send the message in 4.5). Resume at unfreeze.

**External names, in cutover order** (this replaces the old N-INFRA list; the manager pastes exact values)
- Supabase secrets: `REIGH_APPEND_SERVICE_URL`, `REIGH_APPEND_SERVICE_INTERNAL_TOKEN` (`supabase/functions/_shared/reighAppendService.ts:7-8`) become `ASTRID_APP_APPEND_SERVICE_URL`, `ASTRID_APP_APPEND_SERVICE_INTERNAL_TOKEN`.
- Railway: build var `VITE_REIGH_APPEND_SERVICE_URL` becomes `VITE_ASTRID_APP_APPEND_SERVICE_URL`; service `reigh-production` (host `reigh-production.up.railway.app`, `config/vite/policy.ts:7`) gets a new host that goes into `PREVIEW_ALLOWED_HOSTS`. The repo shows only `Dockerfile:31 ARG VITE_APP_ENV`, so list what the Railway dashboard holds.
- CI variables `BANODOCO_RUNTIME_CHECKOUT`, `REIGH_WORKER_CHECKOUT` (workflow `env`, so likely nothing to do), and shell and launch-config `BANODOCO_*`.
- Supabase hosted project: confirm its ref is not named after the old name (only the local `project_id` is). It is not renamed.
- Public install surface: URLs in `src/pages/Home/publicAstridLinks.ts:4` (`REPOSITORY_URL`), `PublicAstridHeroCta.tsx:8` (`git clone https://github.com/banodoco/reigh-app.git`), `HeroSection.tsx:13` (`https://github.com/banodoco/Reigh`, capital R, probably dead), `README.md:16-17` (`git clone https://github.com/peteromallet/reigh`), `scripts/astrid-landing/prepare.py:249,306`, `prepare-public.py:132` (pinned `APP_COMMIT`). Map rows rewrite them; the human reviews the result in the C-APP diff.

**Deploy (after landing)**
- [ ] D1. Supabase: confirm the new secrets from P1 are set; deploy the functions (D2). Unset the old ones in D9.
- [ ] D2. Supabase: deploy the App's edge functions. Delete the deployed edge function `reigh-data-fetch` (its code was deleted by D-APP; no caller): `npx supabase functions delete reigh-data-fetch --project-ref <ref>`.
- [ ] D3. **Only if Q2 returned rows:** run `tools/astrid-rename/extension-id-rows.sql` once in the SQL editor or `psql`, in the cutover window, and keep the printed counts. If Q2 returned 0, there is no D3.
- [ ] D4. Supabase: `npx supabase db push --linked`. It applies the new forward migrations (the CHECK change if Q2 was 0, and the route prose `UPDATE`). The in-place comment edits to old migrations are not re-run.
- [ ] D5. Railway: confirm the build after C-LAND used `VITE_ASTRID_APP_APPEND_SERVICE_URL` (from P1). Rename the service `reigh-production` if wanted, and remove the old domain once the new host (P3) serves. Keep the public origin `astrid.haus` unchanged: the browser copier cannot move data across origins.
- [ ] D6. GitHub Actions / CI variables and secrets: rename `BANODOCO_RUNTIME_CHECKOUT` and `REIGH_WORKER_CHECKOUT` if they are set as repository variables (verify).
- [ ] D7. Domains: decide what `reigh.art`, `reigh.ai`, `reigh.app` do (the owners' call: redirect, keep, let lapse). Code no longer references them (D-APP), so the plan does not need an answer to finish.
- [ ] D8. Verify production: load the App, create and save a timeline. (The extension host is off in production, so there is no extension step.)
- [ ] D9. After D8 passes: remove the old-name secrets and variables (`REIGH_APPEND_SERVICE_*` in Supabase, `VITE_REIGH_APPEND_SERVICE_URL` in Railway, old CI variables).

**Per machine (C-MIGRATE)**
- [ ] M1. Census: run the byte census over every realm (C-MIGRATE step 1). Record the output. If it shows a targeted string, stop and tell the manager.
- [ ] M2. In a new terminal where `env | grep -E 'BANODOCO_|REIGH_'` prints nothing (never the film's shell), with the **old** install running: `astrid-runtime backup --destination <dir>`; `astrid-runtime relocate --plan --destination "$HOME/Library/Application Support/Astrid Runtime"`. **The plan's source must equal `$HOME/Library/Application Support/Banodoco` (expanded); if it is anything else, stop.** Use a backup folder outside the support folder, such as `$HOME/astrid-rename-backup-<date>`. Then `astrid-runtime relocate --confirm "RELOCATE <selected-realm-id>" --destination "$HOME/Library/Application Support/Astrid Runtime"`. Verify that `credentials/owner.token`, `discovery.json` and the catalog moved.
- [ ] M3. Stop the old Runtime, install the renamed one, and switch shells and launch configs to the new env names in the same step: `BANODOCO_LOCAL_*` and `BANODOCO_RUNTIME_*` to `ASTRID_RUNTIME_*`, `REIGH_*` to `ASTRID_APP_*`, per `map-notes.md`. Start it. `astrid-runtime status` must be healthy.
- [ ] M4. Live film stack (never relocated): switch `astrid-local/live-main/env.sh` to the new data-root variable in the same step as moving the stack onto renamed code. Check the film data root and its size before any traffic (C-MIGRATE acceptance).
- [ ] M5. Open the App once in each browser profile used with Astrid so the browser copier runs; in the console, `localStorage.getItem('astrid.rename-migration.v1')` returns a value.

**Satellites (Phase 2)**
- [ ] S1. Archive `banodoco/reigh-workspace` (Settings, Danger zone, Archive).
- [ ] S2. Archive `banodoco/reigh-worker-orchestrator` (after the human confirms `banodoco-worker/` is not deployed on Railway, day-one question 3).
- [ ] S3. `banodoco/reigh-worker`: archive if N-SAT found nothing live; otherwise rename to `astrid-worker` and extend the plan.
- [ ] S4. Merge the scrub PRs in `banodoco-workspace`, `timeline-schema`, `timeline-composition`, `timeline-theme-2rp`.
- [ ] S5. Optional and the owners' call: delete instead of archive. Archiving is reversible and is the default.

**Final**
- [ ] F1. Approve P-FINAL (it deletes the plan) after V-REVIEW ends in a clean round. It does not wait 30 days.
- [ ] F2. Put the F-WINDOW date in a calendar. The GitHub issue P-FINAL opens is the reminder.

---

## 10. Done when

P-FINAL runs these in order. The plan is complete when all of them hold.
1. **V-REVIEW ended in a clean round,** and the human approved P-FINAL (F1).
2. **Tests and builds pass on `main`** in all three repos, against the baseline. For the App that means `tsc`, the full `vitest` and `build`, run locally. The deployed App, Supabase and Railway run under the new names.
3. **The human has finished** P1 to P4, D1 to D9 (D3 only if Q2 returned rows), M1 to M5 and S1 to S5.
4. **Tag `astrid-rename-done`** on the current `main` of all three repos, and push the tags. In Astrid this commit still holds the plan and the tools, and the recipe in 4.5 reads them from this tag.
5. **Stage the deletion in Astrid:** `git rm -r docs/plans/astrid-naming tools/astrid-rename`, including any operator script.
6. **Run the final zero check from the pinned copy,** with the final allowlist:
   ```
   for r in astrid runtime app; do $WORK/tools/check-zero --repo $WORK/$r --allow $WORK/tools/allowlist-final.txt || exit 1; done
   ```
   Then run it with `--profile keep` on `banodoco-workspace`, `timeline-schema`, `timeline-composition` and `timeline-theme-2rp`, and with `--profile local` on the paths in P-LOCAL's acceptance. Also check these in each repo:
   - `git ls-files | grep -iE 'reigh|banodoco_local|banodoco_workspace'` prints nothing;
   - `git grep -niE 'reigh\.(art|ai|app)'` prints nothing.
7. **Commit the deletion in Astrid,** with the output of step 6 in the commit message, and push it. After it, `git grep -il reigh` in Astrid prints nothing.
8. **Open the F-WINDOW issue** in the App repo, with a date and no old name in it.
9. **Delete the branches** `prep/astrid-rename-*` and `rename/astrid`, locally and on each origin.

Complete later, standalone: F-WINDOW. After it, `git grep -il reigh` in the App prints nothing and no allowlist exists.

The pre-rename tags `pre-astrid-rename` stay; they are the archive. `astrid-rename-commit` and `astrid-rename-done` stay too; they hold the recipe and the tools for late branches.

---

## 11. Decided defaults and open questions

**Decided defaults.** They apply unless the human objects on day one (7.4, question 7).
1. **Satellites.** `reigh-worker-orchestrator` and `reigh-workspace` are deprecated and archived. `reigh-worker` is deprecated too, as the user said on 17 Oct, unless the human answers day-one question 3 with "something live uses it". In that case N-SAT escalates and the plan gains a C-WORKER task.
2. **Other machines.** Each machine runs the C-MIGRATE census. If a targeted string turns up, an operator script is written then, not before.
3. **The support folder** becomes `~/Library/Application Support/Astrid Runtime`, moved by `relocate` with the old install running (C-MIGRATE step 2). Verified on 17 Oct: `upgrade --destination` does not install code or switch the env, so it is not a shortcut.
4. **`ASTRID_BANODOCO_*`** env vars become `ASTRID_RUNTIME_*`. The module `banodoco_catalog.py` keeps its community name.
5. **Kept satellites keep their own `BANODOCO_*` env vars.** Profile `keep` omits that pattern.
6. **`reigh-product-connector`** is re-grepped by N-MAP before anything relies on it.
7. **The Runtime's neutrality sentence** is reworded in C-RT. The protocol and fixtures stay product-free; the packaging may say Astrid.
8. **`astrid-runtime` command ownership** is decided by N-MAP, step 8.
9. **Saved agent transcripts and prompts** are not migrated. Old capability ids and wire tags inside them stay as they are.
10. **Hivemind's knowledge content and Otto's records** are out of scope beyond Hivemind's scripts (P-LOCAL) and the R4 cards (P-R4).
11. **The App's dated design docs** `docs/design/*-2026-10-05.md` are live docs and are renamed, not deleted.
12. **Accepted losses** (section 4.7): team members lose dev-only extension settings; the `showDataLanesByKind` preference resets; old revisions in the film realm show source "other"; a pre-cutover `com.reigh.astrid.liveScene` clip is skipped by the new Runtime.
13. **Browser local-media handles** that cannot be cloned are kept and marked for re-import (N-BROWSER). They are never dropped silently.
14. **The domains** `reigh.art`, `reigh.ai` and `reigh.app` are the owners' call (D7). The plan only removes the references.
15. **The landing pipeline** `scripts/astrid-landing/` is deleted in D-APP unless a reader turns up.
16. **The prose rule for files naming both products** is "Astrid App" (rule 4), polished by Opus in C-INT.

**Open questions:** the day-one list in 7.4. No other question blocks the plan.
