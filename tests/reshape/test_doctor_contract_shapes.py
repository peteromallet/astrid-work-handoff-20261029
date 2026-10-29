"""Doctor prints two payload shapes; the doctor gates must accept both and reject real violations."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from astrid.core.gateway import diagnostics as d
from scripts.reshape import ci_doctor

REPO = Path(__file__).resolve().parents[2]


def _failed_report() -> dict:
    return d.build_diagnostic(
        mode="local", facts={}, problem_code="runtime_unavailable", failure_boundary="runtime-contact",
        next_actions=[{"commandId": "runtime-up", "arguments": [], "effects": d.COMMAND_EFFECTS["runtime-up"],
                       "authorizationRequired": True, "executable": True}],
    )


# Observed report without "ok" (what doctor prints once a data root resolves) and the error shape with it.
SHAPES = {
    "observed-without-ok": lambda: {"healthy": False, "issues": ["catalog_missing"], "diagnostic": _failed_report()},
    "observed-with-ok": lambda: {"ok": False, "problem_code": "runtime_unavailable", "diagnostic": _failed_report()},
}


@pytest.mark.parametrize("shape", sorted(SHAPES))
def test_ci_doctor_accepts_both_payload_shapes(shape: str) -> None:
    assert ci_doctor.contract_errors(SHAPES[shape](), 1) == []


def test_ci_doctor_rejects_a_disagreeing_exit_code() -> None:
    assert ci_doctor.contract_errors(SHAPES["observed-without-ok"](), 0)
    assert ci_doctor.contract_errors(SHAPES["observed-without-ok"](), 2)


def _smoke_lane() -> str:
    source = (REPO / "scripts" / "smoke_wheel_install.sh").read_text("utf-8")
    return re.search(r'DOCTOR_LANE = """(.*?)"""', source, re.S).group(1)


@pytest.mark.parametrize("shape", sorted(SHAPES))
def test_smoke_doctor_lane_accepts_both_payload_shapes(shape: str) -> None:
    done = subprocess.run(
        [sys.executable, "-I", "-c", _smoke_lane(), json.dumps(SHAPES[shape]()), "1"],
        capture_output=True, text=True, cwd=REPO, env={"PYTHONPATH": str(REPO)}, check=False,
    )
    assert done.returncode == 0, done.stderr[-600:]
    assert "doctor contract: OK" in done.stdout
