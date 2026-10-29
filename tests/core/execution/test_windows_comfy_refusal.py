from types import SimpleNamespace

import pytest

from astrid.core.execution import generic_host


def _request(profile):
    return {
        "version": generic_host._LOCAL_PREPARATION_VERSION,
        "command": "prepare_local_execution", "operation_id": "op", "channel_id": "channel",
        "owner_epoch": "epoch", "custody_scope": "unused",
        "runtime_owner": {"pid": 123, "uid": 0, "birth_id": "runtime-birth",
                          "runtime_instance_id": "epoch", "coordinator_epoch": "epoch"},
        "profile": profile,
    }


def test_windows_managed_comfy_refuses_before_profile_preparation_or_custody(monkeypatch):
    monkeypatch.setattr(generic_host, "sys", SimpleNamespace(platform="win32"))

    def unavailable(*args, **kwargs):
        pytest.fail("unsupported managed Comfy reached preparation")

    service = generic_host.LocalExecutionPreparation(operation_id="op", channel_id="channel", graph_factory=unavailable)
    monkeypatch.setattr(service, "_acquire_handoff_journal", unavailable)
    monkeypatch.setattr(generic_host, "_validate_local_engine_profile", unavailable)
    with pytest.raises(generic_host.HostError, match="Managed Comfy execution is not available on Windows yet[.]"):
        service.prepare_local_execution(_request({"engine_launch": {"module": "vibecomfy.commands.session"}}))
    assert service._intent is None and service._request is None and service.graph is None


def test_windows_host_only_preparation_keeps_its_existing_route(monkeypatch):
    monkeypatch.setattr(generic_host, "sys", SimpleNamespace(platform="win32"))
    service = generic_host.LocalExecutionPreparation(operation_id="op", channel_id="channel")
    request = _request({"execution_mode": "host_only_cpu"})
    calls = []
    monkeypatch.setattr(service, "_prepare_host_only", lambda received: calls.append(received) or {"status": "prepared"})
    assert service.prepare_local_execution(request) == {"status": "prepared"}
    assert calls == [request]
