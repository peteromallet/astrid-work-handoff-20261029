# I1: fresh-install VibeComfy qualification

Linux x86_64, CPU only, 2026-10-24. **Lock repair and installed-package
preflight pass. Full fresh-install qualification is blocked by the container's
GitHub archive restrictions; live readiness without a restart is not proven.**
No API keys, GPU, ComfyUI, provider calls, cloud sessions, pushes, or PRs were used.

## Pins and lock repair

- Agent: `9ac48459a5ddab687bb9a1d8ed15e079044b1b1d` (lock-fix commit).
- Runtime: `36aea8957ebd1d74b66bc06d177705fd62cff8b5` (current HEAD when tested).
- VibeComfy: the revision pinned in `vibecomfy_dependency.py` at the time (A5 pin).

Added `huggingface_hub[hf_xet]>=0.32.0` to `pyproject.toml`, then ran:

```sh
PATH=/root/.local/bin:$PATH make lock-runtime
PATH=/root/.local/bin:$PATH make lock-proof
make lock-validate PY=/home/user/banodoco/astrid-agent/.venv/bin/python
```

Both locks retain SHA-256 hashes and now include `huggingface-hub==2.3.0`,
`hf-xet==1.7.0`, `fsspec==2026.9.0`, and `packaging==26.3`. uv pruned unused
keyring dependencies, retaining the other existing versions. Updated the
proof-lock test's package-count floor and added VibeComfy dependency coverage.

## Real installer attempts

Used `.qualification/` inside this worktree because the task's write-only-in-
worktree rule conflicts with its `/home/user/e2e/install` destination. Reference
repositories and other worktrees were read only.

```sh
curl -fsSL https://astrid.haus/install -o .qualification/install.sh
curl -fsSL https://astrid.haus/install-manifest.json \
  -o .qualification/release-install-manifest.json
python3 -m http.server 17605 --bind 127.0.0.1 \
  --directory .qualification/install/serve
sh .qualification/install.sh \
  --root "$PWD/.qualification/install/program" \
  --data-root "$PWD/.qualification/install/data"
```

Copied the release manifest to `serve/local-install-manifest.json`, retaining
its schema and tool versions/assets. Set full source SHAs above and local repos:
agent=this worktree, runtime=`/home/user/banodoco/astrid-runtime`,
vibecomfy=`/home/user/banodoco/ext/VibeComfy`. A Python launcher supplied an empty
HOME, private TMPDIR/uv cache, the loopback `ASTRID_INSTALL_MANIFEST_URL`, and a
free `ASTRID_RUNTIME_DOOR_PORT` (59779 on the second attempt). No developer
Python paths, VibeComfy checkout override, or provider credentials were inherited.
The bootstrap downloaded uv 0.11.32 and Python 3.11.13; the installer consumed
hashed requirements and installed VibeComfy with its normal `--no-deps` path.

1. First attempt installed Python packages, then failed fetching the release's
   OMP archive from `https://codeload.github.com/peteromallet/oh-my-pi/tar.gz/9e282751c0059e37d2f6fbc14ffa0b450710bd23`:
   `urllib.error.HTTPError: HTTP Error 403: Forbidden`.
   Bootstrap output: `Astrid couldn't finish. Your work is kept.` plus the
   disposable home's `install.log` path. Installed VibeComfy imports passed.
2. Git transport worked, so ran `git clone --no-checkout --depth 1 https://github.com/peteromallet/oh-my-pi.git .qualification/omp-source`.
   Verified HEAD `9e282751c0059e37d2f6fbc14ffa0b450710bd23`; changed only
   `tools.omp.source.repo` to this local clone. Retried with another empty HOME,
   program/data directories, temporary directory, and uv cache. OMP staging passed.
3. npm failed with `SELF_SIGNED_CERT_IN_CHAIN`, then `npm error Exit handler never called!`
   while reporting exit 0. The launcher had omitted the container's
   `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. The installer advanced to uv,
   which failed with `error: Distribution not found at: file://…/a/remotion/node_modules/@banodoco/timeline-schema/python`.
   Independently, curl confirmed the pinned timeline-schema archive returns
   HTTP 403; proxy text: `GitHub access to this repository is not enabled for this session`.
   No exact matching archives were available in the existing npm cache.
   The committed npm lock and integrity hashes were not changed.

## Manual diagnosis and results

Restored Node's CA setting. Cloned timeline-schema tag `v0.0.1`
(`8c797753b38849b2afcbdc35db92de610d4b9883`) inside this worktree, used
`git archive`, and installed its `python/` subtree with the downloaded uv and
`--no-deps` into the candidate. Manually completed the backend's remaining
service/profile/version, workspace, launcher, registration, startup, and
verification steps. This was not a successful unmodified installer transaction;
the full Remotion dependency tree remained absent.

- No systemd: registration printed `There is no systemd user service; run the install line to restart Astrid.`
  Startup automatically used `start_foreground`; no rerun was needed to start
  Runtime. Backend verification passed while pack-host was still `starting`.
- `astrid_runtime status --data-root <data> --json`: healthy Runtime, epoch 1,
  chat running. Pack-host subsequently failed with
  `RemotionValidationError: launch validation needs the installed composition output directory` (historical; launch validation was removed on 26 Oct).
  A later status showed four supervisor retries, so this cannot prove no-restart readiness.
- Candidate `py/bin/python -I`: imports of `vibecomfy`, `vibecomfy.runtime.run`,
  `huggingface_hub.hf_hub_download`, and `hf_xet` passed; `run_sync` and
  `hf_hub_download` were callable. Installed VibeComfy files came from candidate
  `site-packages`; `__init__.py` and `runtime/run.py` matched the pinned archived
  source byte for byte. The manifest recorded all three source SHAs above.
- Installed `GenericPackHost` with the VibeComfy pack and candidate capability
  matrix: `preflight("vibecomfy.run")` returned `ready: true`, packages
  `{"ok": true, "missing": []}`, credentials `{"ok": true, "missing": []}`.
  This direct check does not establish live host startup.
- Patched only `preflight._module_available` to return false and called
  `check_local_generation_readiness(ModelRegistry.load_default().get("z-image"), "t2i")`.
  Hint: `VibeComfy ships with Astrid; if it is missing, run the normal Astrid update in a terminal outside chat: …`.
  Both installer `--update` commands were present; no `pip`. The installed
  package stayed intact.
- Live `WorkspaceClient.list_capabilities` could not establish readiness; it
  ended with `WorkspaceClientError: runtime is not accepting authenticated requests`.
  No task was submitted. A clean production rerun needs pinned GitHub archive
  access and the container's Node CA configuration.

## Tests and cleanup

Luna helpers audited installation paths and ran tests. Initial result:
58 passed / 1 failed (`assert 65 >= 70`, the obsolete proof-lock count).
This was caused by the lock refresh and fixed, not treated as pre-existing.
Final command from the worktree root:

```sh
TMPDIR=$PWD/.qualification PYTHONDONTWRITEBYTECODE=1 \
  /home/user/banodoco/astrid-agent/.venv/bin/python -m pytest -q \
  --basetemp=$PWD/.qualification/pytest-final \
  tests/v10/test_release_reproducibility.py tests/test_installer_sources.py \
  tests/core/generation/test_preflight.py \
  tests/test_installer_service_repair_integration.py
```

**61 passed** in 141.27 seconds; lock validation and `git diff --check` passed.
No unresolved automated-test failures. GPU workflows, provider chat, updates,
and browser interaction were outside this qualification.

Real installer cleanup with `--uninstall --delete-data --root <program>
--data-root <data>` exited 0: `Astrid was uninstalled.` Stopped the manifest
server; ports 17605 and 59779 returned connection refused, and no live process
remained rooted in the qualification tree. Removed disposable homes, environments,
clones, caches, fixtures, and logs. Left the pre-existing untracked `node_modules`
link untouched.
