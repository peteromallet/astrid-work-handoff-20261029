"""Idle local Runtime reconnects are authenticated and keep claim fences."""
from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.execution.generic_host import GenericPackHost, HostError, RuntimeProtocolClient
from astrid_runtime_client.contract_metadata import SCHEMA_DIGEST

ACTOR = "astrid-pack-host"


class _Transport:
    def __init__(self, endpoint, credential, worlds):
        self.endpoint, self.credential = endpoint, credential
        self.world = worlds[endpoint]

    def handshake(self, *_args):
        return self.world["handshake"]


@pytest.fixture
def worlds(monkeypatch):
    records = {}
    def record(realm="realm-a", instance="runtime-a"):
        return {"handshake": {"actor_id": ACTOR, "scopes": ["worker:execute"],
                              "realm_id": realm, "protocol": "workspace.v1",
                              "schema_digest": SCHEMA_DIGEST}}
    records.update({f"http://127.0.0.1:{port}": record() for port in (47001, 47002)})
    import astrid_runtime_client
    monkeypatch.setattr(astrid_runtime_client, "WorkspaceClient",
                        lambda endpoint, credential, **_: _Transport(endpoint, credential, records))
    return records


def setup(tmp_path: Path, worlds) -> tuple[RuntimeProtocolClient, Path, Path]:
    credential, discovery = tmp_path / "worker.token", tmp_path / "discovery.json"
    credential.write_text("token-a", encoding="utf-8")
    os.chmod(credential, 0o600)
    def publish(endpoint="http://127.0.0.1:47001", realm="realm-a", instance="runtime-a"):
        discovery.write_text(json.dumps({"version": 1, "endpoint": endpoint,
            "active_realm": realm, "runtime_instance_id": instance,
            "coordinator_epoch": instance, "worker_actor": ACTOR,
            "worker_credential_file": str(credential)}), encoding="utf-8")
        os.chmod(discovery, 0o600)
    publish()
    client = RuntimeProtocolClient("http://127.0.0.1:47001", "token-a", credential_file=credential)
    client.executor_id = ACTOR
    client.bind_local_runtime(discovery)
    return client, discovery, credential


@pytest.mark.parametrize("changed_port", [False, True])
def test_idle_refresh_adopts_authenticated_runtime_and_keeps_attempt_fence(
    tmp_path, worlds, changed_port,
):
    client, discovery, credential = setup(tmp_path, worlds)
    client._attempt_runtime_epochs["claimed"] = 4
    endpoint = "http://127.0.0.1:47002" if changed_port else client.endpoint
    worlds[endpoint]["handshake"]["realm_id"] = "realm-a"
    credential.write_text("token-b", encoding="utf-8")
    os.chmod(credential, 0o600)
    discovery.write_text(json.dumps({"version": 1, "endpoint": endpoint,
        "active_realm": "realm-a", "runtime_instance_id": "runtime-b",
        "coordinator_epoch": "runtime-b", "worker_actor": ACTOR,
        "worker_credential_file": str(credential)}), encoding="utf-8")
    os.chmod(discovery, 0o600)

    assert client.refresh_local_connection() is True
    assert (client.endpoint, client.credential) == (endpoint, "token-b")
    assert client._attempt_runtime_epochs == {"claimed": 4}
    assert client.refresh_local_connection() is False


def test_refresh_refuses_a_different_realm_without_mutating_transport(tmp_path, worlds):
    client, discovery, credential = setup(tmp_path, worlds)
    original = client.generated
    worlds["http://127.0.0.1:47002"]["handshake"]["realm_id"] = "foreign"
    credential.write_text("token-b", encoding="utf-8")
    os.chmod(credential, 0o600)
    discovery.write_text(json.dumps({"version": 1, "endpoint": "http://127.0.0.1:47002",
        "active_realm": "realm-a", "runtime_instance_id": "runtime-b",
        "coordinator_epoch": "runtime-b", "worker_actor": ACTOR,
        "worker_credential_file": str(credential)}), encoding="utf-8")
    os.chmod(discovery, 0o600)

    with pytest.raises(HostError, match="different realm"):
        client.refresh_local_connection()
    assert client.endpoint == "http://127.0.0.1:47001"
    assert client.generated is original
    assert client.credential == "token-a"


def test_unbound_client_rotates_bearer_but_keeps_explicit_endpoint(tmp_path, worlds):
    credential = tmp_path / "worker.token"
    credential.write_text("token-a", encoding="utf-8")
    os.chmod(credential, 0o600)
    client = RuntimeProtocolClient("http://127.0.0.1:47001", "token-a", credential_file=credential)
    client.executor_id = ACTOR
    credential.write_text("token-b", encoding="utf-8")
    os.chmod(credential, 0o600)
    assert client.refresh_local_connection() is True
    assert (client.endpoint, client.credential) == ("http://127.0.0.1:47001", "token-b")


def test_binding_keeps_protected_discovery_file_boundary(tmp_path, worlds):
    client, discovery, credential = setup(tmp_path, worlds)
    discovery.chmod(0o644)
    unbound = RuntimeProtocolClient(client.endpoint, client.credential, credential_file=credential)
    with pytest.raises(HostError):
        unbound.bind_local_runtime(discovery)


def test_forked_slot_keeps_explicit_binding_and_refreshes_independently(tmp_path, worlds):
    client, discovery, credential = setup(tmp_path, worlds)
    slot = client.fork_for_host_slot()
    credential.write_text("token-b", encoding="utf-8")
    os.chmod(credential, 0o600)
    discovery.write_text(json.dumps({"version": 1, "endpoint": "http://127.0.0.1:47002",
        "active_realm": "realm-a", "runtime_instance_id": "runtime-b",
        "coordinator_epoch": "runtime-b", "worker_actor": ACTOR,
        "worker_credential_file": str(credential)}), encoding="utf-8")
    os.chmod(discovery, 0o600)
    assert slot.refresh_local_connection() is True
    assert slot.endpoint == "http://127.0.0.1:47002"
    assert client.endpoint == "http://127.0.0.1:47001"


@pytest.mark.parametrize(("idle", "expected"), [
    (False, ["begin", "renew", "register", "end"]),
    (True, ["begin", "refresh", "renew", "register", "end"]),
])
def test_host_refreshes_only_at_idle_registration_boundary(monkeypatch, idle, expected):
    events = []
    host = object.__new__(GenericPackHost)
    host.client = SimpleNamespace(refresh_local_connection=lambda: events.append("refresh"),
                                  renew_registration_session=lambda: events.append("renew"))
    host._runtime_restarted = False
    host._registration_refresh_blocked = False
    monkeypatch.setattr(host, "_handoff_begin_registration", lambda: events.append("begin"))
    monkeypatch.setattr(host, "_handoff_end_registration", lambda: events.append("end"))
    monkeypatch.setattr(host, "_register_impl", lambda **_: events.append("register"))
    host._renew_executor_registration(idle=idle)
    assert events == expected
