import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from runtime_protocol.store import RealmStore
from runtime_protocol.cli import main as runtime_cli


def _doctor(root, *options):
    return subprocess.run(
        [sys.executable, "-m", "runtime_protocol", "doctor", "--root", str(root), "--json", *options],
        cwd=Path(__file__).parents[1],
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        timeout=15,
    )


def test_cli_timeout_is_not_checked_and_corruption_still_fails(tmp_path, monkeypatch, capsys):
    healthy_root = tmp_path / "healthy"
    RealmStore.initialize(healthy_root).close()

    # Exercise the real timeout report without wall-clock races. The public
    # CLI keeps its newer positive-finite budget contract.
    seen = []
    def timed_out(root, **kwargs):
        seen.append(kwargs["timeout_seconds"])
        return RealmStore._integrity_not_checked(kwargs["timeout_seconds"])
    with monkeypatch.context() as patch:
        patch.setattr(RealmStore, "inspect_realm", timed_out)
        assert runtime_cli(["doctor", "--root", str(healthy_root), "--timeout", "0.25", "--json"]) == 1
    timeout_report = json.loads(capsys.readouterr().out)
    assert seen == [0.25]
    assert timeout_report["status"] == "not_checked"
    assert timeout_report["state"] == "not_checked"
    assert timeout_report["checks"]["sqlite_integrity"]["result"] == (
        "not checked (timed out after 0.25 s; rerun with --timeout S)"
    )

    corrupt_root = tmp_path / "corrupt"
    corrupt_root.mkdir()
    (corrupt_root / "realm.sqlite3").write_bytes(b"not a sqlite database")
    failed = _doctor(corrupt_root, "--timeout", "5")
    failure_report = json.loads(failed.stdout)
    assert failed.returncode == 1
    assert failure_report["status"] == "failed"
    assert failure_report["state"] == "unhealthy"
    assert failure_report["checks"]["sqlite_integrity"]["reason"] in {"malformed", "unreadable"}


@pytest.mark.parametrize("budget", ["0", "-1", "nan", "inf"])
def test_doctor_cli_still_rejects_nonpositive_or_nonfinite_budget(tmp_path, budget):
    with pytest.raises(SystemExit) as error:
        runtime_cli(["doctor", "--root", str(tmp_path), "--admission-timeout", budget])
    assert error.value.code == 2
