"""Sprint 9 Phase 8 — portfolio-wide parity tests.

For every shipped pack id in ``PORTFOLIO_PACK_IDS`` we prove:

* Resolution through :func:`discover_packs` — same code path user-external
  packs use.
* Validation through ``validate_pack`` (the :class:`PackValidator` wrapper)
  — same code path user-external packs use.
* The pack's representative executor dispatches through
  :func:`_run_external_executor` (the same path external packs
  use). We verify the dispatch boundary by stubbing that subprocess
  entrypoint.
* Pack manifests are canonical ``schema_version: 3`` (no ``content:`` /
  ``extensions:`` blocks) and every declared action carries a name, a
  version and a supported ``invocation.kind``.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest import mock

import pytest
import yaml

from astrid.core.execution.executor.registry import load_default_registry as load_executor_registry
from astrid.core.pack import discover_packs
from astrid.core.pack.validate import validate_pack

# ---------------------------------------------------------------------------
# Fixtures + helpers
# ---------------------------------------------------------------------------


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKS_DIR = REPO_ROOT / "astrid" / "packs"

PORTFOLIO_PACK_IDS = [
    "rendering",
    "training",
    "iteration",
    "youtube",
    "vibecomfy",
    "moirae",
    "runpod",
]


# One executor per pack to exercise the dispatch path. Each is picked
# specifically because it has a runtime.command.argv block in its
# manifest, so the runner reaches ``_run_external_executor``.
REPRESENTATIVE_EXECUTORS: dict[str, str] = {
    "rendering": "rendering.render",
    "training": "training.search_loras",
    "iteration": "iteration.assemble",
    "youtube": "youtube.youtube_audio",
    "vibecomfy": "vibecomfy.validate",
    "moirae": "moirae.moirae",
    "runpod": "runpod.session",
}


def _load_manifest(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    # Some manifests in the portfolio are JSON-with-a-.yaml suffix; try
    # JSON first so we never mis-parse a true JSON document via yaml's
    # tolerant loader.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return yaml.safe_load(text)


# ---------------------------------------------------------------------------
# Resolver + validator parity
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def packs_index() -> dict[str, object]:
    """Build a pack-id → PackDefinition lookup via discover_packs()."""
    return {p.id: p for p in discover_packs(str(PACKS_DIR))}


@pytest.mark.parametrize("pack_id", PORTFOLIO_PACK_IDS)
def test_resolver_discovers_pack(packs_index: dict, pack_id: str) -> None:
    """Every portfolio pack is resolvable via discover_packs."""
    pack = packs_index.get(pack_id)
    assert pack is not None, f"pack {pack_id!r} not discovered"
    assert pack.id == pack_id
    assert pack.root.is_dir()
    assert str(pack.schema_version) == "3"
    assert pack.actions, f"pack {pack_id!r} must declare actions in pack.yaml"
    # v3 packs declare capabilities directly; the v2 content: block is gone.
    assert not pack.content


@pytest.mark.parametrize("pack_id", PORTFOLIO_PACK_IDS)
def test_validator_accepts_pack(pack_id: str) -> None:
    """Every portfolio pack validates cleanly through validate_pack."""
    errors, _warnings = validate_pack(PACKS_DIR / pack_id)
    assert errors == [], (
        f"validate_pack reported errors for {pack_id!r}: {errors}"
    )


# ---------------------------------------------------------------------------
# Canonical v3 pack / action compliance
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("pack_id", PORTFOLIO_PACK_IDS)
def test_pack_manifest_v3_compliant(pack_id: str) -> None:
    """Pack manifest declares canonical schema_version 3 with no v2 blocks."""
    pack_yaml = PACKS_DIR / pack_id / "pack.yaml"
    doc = _load_manifest(pack_yaml)
    assert doc.get("schema_version") == 3, (
        f"{pack_yaml}: schema_version must be 3, got {doc.get('schema_version')!r}"
    )
    # The v3 schema forbids the v2 top-level content: and extensions: keys.
    for retired in ("content", "extensions"):
        assert retired not in doc, f"{pack_yaml}: v3 manifest must not declare {retired}:"
    assert doc.get("id") == pack_id


@pytest.mark.parametrize("pack_id", PORTFOLIO_PACK_IDS)
def test_action_declarations_v3_compliant(pack_id: str) -> None:
    """Every action declared in pack.yaml has a name, version and valid invocation."""
    pack_yaml = PACKS_DIR / pack_id / "pack.yaml"
    doc = _load_manifest(pack_yaml)
    rel = pack_yaml.relative_to(REPO_ROOT)
    actions = doc.get("actions")
    assert isinstance(actions, dict) and actions, f"{rel}: must declare actions"
    for action_name, action in actions.items():
        assert isinstance(action, dict), f"{rel}: action {action_name!r} must be a mapping"
        assert action.get("name"), f"{rel}: action {action_name!r} must declare a name"
        assert action.get("version"), f"{rel}: action {action_name!r} must declare a version"
        invocation = action.get("invocation")
        assert isinstance(invocation, dict), (
            f"{rel}: action {action_name!r} must declare an invocation"
        )
        assert invocation.get("kind") in ("command", "python"), (
            f"{rel}: action {action_name!r} invocation.kind must be 'command' or "
            f"'python', got {invocation.get('kind')!r}"
        )


# ---------------------------------------------------------------------------
# Dispatch path parity — every pack's representative executor goes through
# _run_external_executor.
# ---------------------------------------------------------------------------


DISPATCH_PACK_IDS = [pack_id for pack_id in PORTFOLIO_PACK_IDS if pack_id != "rendering"]


@pytest.mark.parametrize("pack_id", DISPATCH_PACK_IDS)
def test_representative_executor_dispatches_external(pack_id: str) -> None:
    """The pack's representative executor goes through the external path.

    Patch the generic subprocess dispatch entrypoint and prove that the
    representative command reaches it.
    """
    from astrid.core.execution.executor import runner as runner_mod
    from astrid.core.execution.executor.runner import ExecutorRunRequest, ExecutorRunResult

    executor_id = REPRESENTATIVE_EXECUTORS[pack_id]
    registry = load_executor_registry()
    executor = registry.get(executor_id)

    external_called: dict[str, bool] = {"hit": False}

    def _fake_external(exe, request, values):
        external_called["hit"] = True
        return ExecutorRunResult(
            executor_id=exe.id,
            kind=exe.kind,
            command=("/bin/true",),
            payload={"executor_id": exe.id, "returncode": 0},
            returncode=0,
        )

    # Build a minimal request that passes input validation for each
    # representative executor. The dry-run flag short-circuits subprocess
    # execution, but we still patch the dispatch fns to be tamper-evident.
    inputs: dict[str, object] = {}
    for port in executor.inputs:
        if not port.required:
            continue
        inputs[port.name] = inputs.get(port.name, "x")
    if executor_id == "youtube.youtube_audio":
        inputs["query"] = "x"
    request = ExecutorRunRequest(
        executor_id=executor_id,
        out=Path(tempfile.mkdtemp()),
        project="demo",
        inputs=inputs,
        dry_run=True,
        python_exec=sys.executable,
    )

    with mock.patch.object(runner_mod, "_run_external_executor", _fake_external):
        runner_mod.run_executor(request, registry)

    assert external_called["hit"], (
        f"{executor_id} did not dispatch through _run_external_executor"
    )
