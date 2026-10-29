"""The lane registry (tests/lanes.py) agrees with pyproject.toml and with the CI workflow.

A declared skip that no CI job ever runs is still invisible, so every lane that is not manual names the jobs
that run it, and this file checks those jobs in .github/workflows/ci.yml: each sets ASTRID_CI_JOB to its name,
provisions the dependency and selects the lane.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest
import yaml

from tests import lanes

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = [yaml.safe_load((REPO / ".github" / "workflows" / name).read_text(encoding="utf-8")) for name in ("ci.yml", "lanes.yml")]


def _jobs_by_name() -> dict[str, dict]:
    """CI jobs keyed by the ASTRID_CI_JOB they set, a matrix job expanded to one entry per OS."""
    found: dict[str, dict] = {}
    for job in (job for workflow in WORKFLOWS for job in workflow["jobs"].values()):
        name = (job.get("env") or {}).get("ASTRID_CI_JOB")
        if not name:
            continue
        for os_name in job.get("strategy", {}).get("matrix", {}).get("os", [""]):
            found[name.replace("${{ matrix.os }}", os_name)] = job
    return found


def _pytest_commands(job: dict) -> list[str]:
    return [step["run"] for step in job["steps"] if "pytest" in step.get("run", "")]


def _marker_expression(command: str) -> str | None:
    """The ``-m`` expression of a pytest command, or None when it runs the default lane."""
    match = re.search(r"pytest\b.*?\s-m\s+(\"[^\"]*\"|'[^']*'|\S+)", command)
    return match.group(1) if match else None


def _addopts() -> str:
    return tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))["tool"]["pytest"]["ini_options"]["addopts"]


def test_the_default_run_deselects_exactly_the_default_off_lanes() -> None:
    deselected = set(re.findall(r"not (\w+)", _addopts()))
    assert deselected == set(lanes.DEFAULT_OFF)
    assert "--strict-markers" in _addopts()


def test_every_lane_is_manual_or_run_by_a_ci_job() -> None:
    for name, lane in lanes.LANES.items():
        if lane.kind == "manual":
            assert not lane.jobs and lane.default_off, f"{name}: a manual lane has no CI job and is deselected by default"
        elif lane.no_ci:
            assert not lane.jobs, f"{name} says no CI job runs it but names {lane.jobs}"
        else:
            assert lane.jobs, f"{name} is declared but no CI job runs it: give it a job, a no_ci reason, or make it a manual lane"


@pytest.mark.parametrize("name", [name for name, lane in lanes.LANES.items() if lane.jobs])
def test_the_jobs_of_a_lane_provision_and_select_it(name: str) -> None:
    lane = lanes.LANES[name]
    jobs = _jobs_by_name()
    for job_name in lane.jobs:
        assert job_name in jobs, f"{name}: no CI job sets ASTRID_CI_JOB={job_name}"
        job = jobs[job_name]
        assert lane.provision in yaml.safe_dump(job), f"{name}: {job_name} does not provision {lane.provision!r}"
        commands = _pytest_commands(job)
        assert commands, f"{job_name} runs no pytest"
        if lane.default_off:
            assert any(re.search(rf"\b{name}\b", _marker_expression(command) or "") for command in commands), f"{job_name} does not select -m {name}"
        else:
            assert any(_marker_expression(command) is None for command in commands), f"{job_name} must run the default lane to run {name}"


def test_a_platform_lane_runs_on_the_os_of_its_jobs() -> None:
    runs_on = {"posix_native": "ubuntu", "linux_native": "ubuntu", "non_root": "ubuntu", "windows_native": "windows", "windows_installer": "windows", "darwin_native": "macos"}
    for name, expected in runs_on.items():
        for job_name in lanes.LANES[name].jobs:
            assert expected in job_name or job_name == lanes.DARWIN and expected == "macos", f"{name} runs on {expected}, not {job_name}"


def test_windows_native_job_is_blocking() -> None:
    for job_name in lanes.LANES["windows_native"].jobs:
        job = _jobs_by_name()[job_name]
        assert not job.get("continue-on-error", False), f"{job_name} must fail CI when native Windows checks fail"
