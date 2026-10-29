"""The nested host-survival job owns lease mechanics, not machine capacity."""
from pathlib import Path
from types import SimpleNamespace

from astrid.core.dev import journey
from astrid.sdk import host_bootstrap


def test_nested_host_start_uses_private_one_slot_lease_state(tmp_path):
    calls = []
    runner = SimpleNamespace(command=lambda *args, **kwargs: calls.append((args, kwargs)))
    outer = {"OTTO_HEAVY_LEASE": "outer", "OTTO_HEAVY_DIR": "/machine-wide", "OTTO_HEAVY_CAPACITY": "4"}
    j = journey.Journey(runner=runner, root=tmp_path, env=outer, project="p", timeline="main",
                        start=0, end=4, kill_start=0, checkout=tmp_path)

    j.open_client("replace_host", heavy=True)

    (phase, argv, environment), _ = calls[0]
    assert phase == "replace_host" and argv[0] == str(journey.HEAVY_LAUNCHER)
    private = Path(environment["OTTO_HEAVY_DIR"])
    assert private.is_relative_to(tmp_path) and (private / "capacity").read_text() == "1\n"
    assert "OTTO_HEAVY_LEASE" not in environment and "OTTO_HEAVY_CAPACITY" not in environment
    assert outer == {"OTTO_HEAVY_LEASE": "outer", "OTTO_HEAVY_DIR": "/machine-wide", "OTTO_HEAVY_CAPACITY": "4"}


def test_surviving_host_does_not_inherit_the_jobs_private_capacity(tmp_path, monkeypatch):
    for key in ("OTTO_HEAVY_LEASE", "OTTO_HEAVY_DIR", "OTTO_HEAVY_CAPACITY"):
        monkeypatch.setenv(key, "private-job")
    monkeypatch.setattr(host_bootstrap, "_execution_profile", lambda: "source")
    monkeypatch.setattr(host_bootstrap, "_dependency_pythonpath", lambda: [])
    monkeypatch.setattr(host_bootstrap, "_provision_render_runtime_env", lambda *_args: None)

    environment = host_bootstrap._host_render_environment(tmp_path)

    assert not {"OTTO_HEAVY_LEASE", "OTTO_HEAVY_DIR", "OTTO_HEAVY_CAPACITY"}.intersection(environment)
