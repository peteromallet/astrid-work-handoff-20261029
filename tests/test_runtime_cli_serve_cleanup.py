"""Foreground Runtime teardown ordering at the service CLI boundary."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime_protocol import cli


@pytest.mark.parametrize("stop_fails", [False, True])
def test_start_stops_daemon_before_restoring_control_handlers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stop_fails: bool
) -> None:
    events: list[str] = []
    registration = {}

    class FakeDaemon:
        endpoint = "http://127.0.0.1:61000"
        service = SimpleNamespace(realm={"id": "realm-a"})
        credential_path = tmp_path / "credential"
        worker_credential_path = tmp_path / "worker-credential"
        local_worker_profiles = {}
        door_endpoint = None

        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            events.append("start")
            return self

        def stop(self):
            events.append("stop")
            if stop_fails:
                raise RuntimeError("daemon stop failed")

    daemon = FakeDaemon()

    def install_stop_handlers(callback):
        events.append("register")
        registration["callback"] = callback

        def restore():
            assert events[-1] == "stop"
            events.append("restore")

        return restore

    def sleep(_seconds):
        events.append("wait")
        registration["callback"]()

    monkeypatch.setattr(cli, "RuntimeDaemon", lambda *_args, **_kwargs: daemon)
    monkeypatch.setattr(
        "runtime_protocol.services.load_service_configuration",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(cli.platform, "install_stop_handlers", install_stop_handlers)
    monkeypatch.setattr(cli.time, "sleep", sleep)

    if stop_fails:
        with pytest.raises(RuntimeError, match="daemon stop failed"):
            cli.main(["start", "--root", str(tmp_path / "realm")])
    else:
        assert cli.main(["start", "--root", str(tmp_path / "realm")]) == 0

    assert events == ["start", "register", "wait", "stop", "restore"]
