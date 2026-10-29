# Task & Worker Lifecycle

> **Current boundary.** New work follows the canonical Astrid path: Astrid App producer -> Astrid Runtime admission -> Worker `GenericPackHost` execution -> Runtime settlement -> CAS/gallery/timeline readback. Runtime owns task, run, receipt, event-history, and publication authority; Astrid App does not insert or complete task rows. See [`unified_task_creation.md`](unified_task_creation.md) for the contract. The Supabase task queue, `create_task`/`claim_next_task`/`complete_task` edge functions, credit deduction and database triggers were removed 2026-10-18 (tag `pre-cloud-removal`).

## Overview

Astrid App treats generation as asynchronous work: the UI admits a task and reads the result back when Runtime settles it. This decouples the UI from long-running operations and enables distributed processing.

## Worker Types

### Headless-Wan2GP Worker (Cloud/Local GPU)
- Advanced video generation worker: [Headless-Wan2GP](https://github.com/peteromallet/Headless-Wan2GP)
- Specialized for travel-between-images video generation tasks
- Can run locally with GPU or deployed to cloud instances
- Handles computationally intensive video generation workflows

#### Task Types Handled
- **`travel_orchestrator`** - Manages multi-segment travel workflows
- **`travel_segment`** - Creates guide videos and runs WGP generation using VACE
- **`travel_stitch`** - Stitches segment videos with crossfades and timing
- **`individual_travel_segment`** - Standalone segment regeneration (visible in TasksPane, creates variant on parent generation)
- **`image-generation`** - Fallback for basic image generation tasks

#### Deployment Options

**Local Deployment (GPU Required)**
```bash
# Clone the worker repository
git clone https://github.com/banodoco/astrid-app-Worker.git ~/Documents/Astrid-Worker
cd ~/Documents/Astrid-Worker

# Install uv once
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Ubuntu 24.04+ note: install Python 3.10 packages from deadsnakes first
# sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt-get update

# Sync and run
uv sync --locked --python 3.10 --extra cuda124
uv run --python 3.10 python run_worker.py --astrid-access-token <PAT_TOKEN>
```

**Cloud Deployment (RunPod)**

Workers run on RunPod GPU pods (RTX 4090). Code lives on a persistent network volume at `/workspace/`.

| Path | Contents |
|------|----------|
| `/workspace/Astrid-Worker/` | Canonical worker checkout used by the startup template |
| `/workspace/Headless-Wan2GP/` | Legacy fallback checkout still supported during rollout |

**Accessing pods:**
- **SSH**: Pod IP + port from RunPod dashboard or API (`ssh root@<ip> -p <port>`)
- **Jupyter**: `https://<pod_id>-8888.proxy.runpod.net/?token=<token>` (port 8888)
- **RunPod API**: Query `myself { pods { ... } }` GraphQL endpoint with API key from Arnold `.env`

**Worker process lifecycle:**
```bash
# Logs go to /tmp/worker_startup_<worker_id>.log
# Guardian heartbeat log: /tmp/guardian_<worker_id>.log
# Worker ID format: gpu-YYYYMMDD_HHMMSS-<hash>

# Bootstrap / resync (also used for first install)
cd /workspace/Astrid-Worker
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv sync --locked --python 3.10 --extra cuda124

# Start (nohup so it survives SSH disconnect)
nohup uv run --python 3.10 python run_worker.py --astrid-access-token <PAT_TOKEN> > /tmp/worker.log 2>&1 &

# Restart after code change
pkill -f 'python.*run_worker' && cd /workspace/Astrid-Worker && git pull --ff-only && uv sync --locked --python 3.10 --extra cuda124 && nohup uv run --python 3.10 python run_worker.py --astrid-access-token <PAT_TOKEN> > /tmp/worker.log 2>&1 &

# Check status
ps aux | grep python
tail -50 /tmp/worker_startup_*.log
nvidia-smi
```

**Code change workflow:**
1. Edit locally at `~/Documents/Astrid-Worker` (same repo: `banodoco/Astrid-Worker`)
2. `git add . && git commit -m "fix: ..." && git push`
3. SSH to pod: `cd /workspace/Astrid-Worker && git pull --ff-only`
4. Kill + restart worker process (see above)

**Multiple pods** share the same `/workspace/` volume, so `git pull` on one updates all. The startup template still accepts transient Wan2GP subtree drift during rollout, but the canonical runtime dependency set comes from the root `uv.lock`.
Pods can be queried programmatically via RunPod GraphQL API (credentials in `~/Documents/Arnold/.env`).

**Rollback story:**
- There is no runtime pip fallback on the migrated branch.
- If the first uv-based startup fails on a machine with an older virtualenv, restore the latest `venv.pre-uv-*` or `.venv.pre-uv-*` backup and remove `.uv-migrated`.
- If the release must be rolled back, revert the uv rollout commits and return to the pre-uv revision that still bootstraps from `requirements.txt`.

## Debugging

For cross-repo debugging see the collection-level [`debugging.md`](../../../debugging.md). For worker pods, `scripts/debug.py pod worker <pod_id>` prints the start, restart and status commands used above.
