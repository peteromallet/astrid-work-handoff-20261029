from __future__ import annotations

import multiprocessing
import subprocess
from pathlib import Path

import pytest
from runtime_protocol import platform

from astrid.sdk import autobootstrap


@pytest.fixture
def launcher_data_root(monkeypatch, tmp_path):
    data_root = tmp_path.resolve() / "runtime-support"
    monkeypatch.setenv("ASTRID_RUNTIME_DATA_ROOT", str(data_root))
    monkeypatch.delenv("ASTRID_RUNTIME_SOURCE_MANIFEST", raising=False)
    monkeypatch.setenv("ASTRID_RUNTIME_LAUNCHER", "/usr/bin/astrid-runtime")
    return data_root


def _launcher_result(status: str, *, ok: bool = True) -> str:
    return (
        '{"ok":false,"error":{"code":"conflict","message":"owner busy"}}'
        if not ok
        else '{"status":"' + status + '","realm_id":"realm-1",'
        '"endpoint":"http://127.0.0.1:1","actor_id":"astrid-owner"}'
    )


def _hold_acquisition_lock(data_root: str, entered, release) -> None:
    with autobootstrap._acquisition_file_lock(Path(data_root), timeout=2.0):
        entered.set()
        assert release.wait(5.0)


def _contend_for_acquisition_lock(data_root: str, attempted, acquired) -> None:
    lock_path = autobootstrap._acquisition_lock_path(Path(data_root))
    with lock_path.open("a+") as lock_file:
        try:
            platform.lock_file(lock_file.fileno(), blocking=False)
        except BlockingIOError:
            attempted.set()
        else:
            raise AssertionError("nonblocking acquisition succeeded while holder owned lock")
    with autobootstrap._acquisition_file_lock(Path(data_root), timeout=2.0):
        acquired.set()


def test_thin_launcher_accepts_restarted_owner_and_preserves_normal_command(monkeypatch, launcher_data_root):
    seen: list[list[str]] = []
    monkeypatch.setattr(
        autobootstrap.subprocess,
        "run",
        lambda command, **kwargs: seen.append(command)
        or subprocess.CompletedProcess(command, 0, _launcher_result("restarted"), ""),
    )

    result = autobootstrap.ensure_runtime(start_pack_host=False)

    assert result["status"] == "restarted"
    assert seen == [[
        "/usr/bin/astrid-runtime", "up", "--profile", "astrid",
        "--data-root", str(launcher_data_root), "--json"
    ]]


def test_acquisition_lock_is_canonical_and_cross_process_serialized(launcher_data_root):
    assert autobootstrap._acquisition_lock_path(launcher_data_root) == (
        launcher_data_root / "runtime" / "acquisition.lock"
    )

    context = multiprocessing.get_context("spawn")
    entered = context.Event()
    contender_started = context.Event()
    contender_acquired = context.Event()
    release = context.Event()
    holder = context.Process(
        target=_hold_acquisition_lock,
        args=(str(launcher_data_root), entered, release),
    )
    holder.start()
    contender = None
    try:
        assert entered.wait(5.0)
        contender = context.Process(
            target=_contend_for_acquisition_lock,
            args=(str(launcher_data_root), contender_started, contender_acquired),
        )
        contender.start()
        assert contender_started.wait(5.0)
        assert not contender_acquired.is_set()
        release.set()
        assert contender_acquired.wait(5.0)
    finally:
        if contender is not None:
            contender.join(5.0)
        release.set()
        holder.join(5.0)
        if holder.is_alive():
            holder.terminate()
            holder.join(5.0)
    assert holder.exitcode == 0
    assert contender.exitcode == 0


@pytest.mark.parametrize(
    "completed, message",
    [
        (subprocess.CompletedProcess([], 1, _launcher_result("conflict", ok=False), ""), "bootstrap was not ready"),
        (subprocess.CompletedProcess([], 0, "", "launcher interrupted"), "bootstrap returned invalid JSON"),
    ],
)
def test_thin_launcher_fails_closed_on_conflict_or_interruption(monkeypatch, launcher_data_root, completed, message):
    seen: list[list[str]] = []
    monkeypatch.setattr(
        autobootstrap.subprocess, "run",
        lambda command, **kwargs: seen.append(command) or completed,
    )

    with pytest.raises(autobootstrap.AutoBootstrapError, match=message):
        autobootstrap.ensure_runtime(start_pack_host=False)
    assert seen == [[
        "/usr/bin/astrid-runtime", "up", "--profile", "astrid",
        "--data-root", str(launcher_data_root), "--json"
    ]]


def test_doctor_uses_nonstarting_runtime_observer(monkeypatch, capsys, tmp_path):
    from astrid import runtime_cli
    from astrid.core.gateway import dispatch

    monkeypatch.setattr("astrid.core.rendering.remotion_runtime.remotion_install_problem", lambda _project: None)
    seen: list[str] = []

    class _Runtime:
        def observe(self, command, *, support_root):
            seen.append(command)
            return runtime_cli.RuntimeResult(("astrid-runtime", command), 0, {"ok": True, "state": "ready"})

    monkeypatch.setattr(runtime_cli, "RuntimeCLI", _Runtime)
    monkeypatch.setattr("astrid.sdk.storage_root.resolve_runtime_data_root", lambda: tmp_path / "support")

    assert dispatch._dispatch_doctor(["--json"]) == 0
    # Doctor observes only read-only commands; when its own document carries no
    # compatibility mapping it adds one read-only "status" observation for the
    # Runtime health document, and never "up"/"start".
    assert seen == ["doctor", "status"]
    assert '"state": "ready"' in capsys.readouterr().out
