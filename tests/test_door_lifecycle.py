"""Lifecycle contract of the browser door (runtime_protocol/door.py) and its CLI wiring.

Real in-process daemons on throwaway realms, raw HTTP to the door, and the
boundary/CLI wiring checked without starting a real daemon.
"""

from __future__ import annotations

import http.server
import json
import socket
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from astrid_runtime import cli as astrid_cli
from astrid_runtime.bootstrap import BootstrapResult, DoorSettings, SourceProfile
from astrid_runtime.runtime_boundary import LocalRuntimeBoundary
from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.door import DoorConfig, DoorPortTaken
from tests.door_helpers import HOSTED, PRODUCT_ACTOR, DoorWorld, create_realm, door_call, start_door_world, write_owner_only

REPO_ROOT = Path(__file__).resolve().parents[1]
HANG_GUARD_SECONDS = 180


class _NotFound(http.server.BaseHTTPRequestHandler):
    def _answer(self):
        body = b"not found"
        self.send_response(404)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = _answer

    def log_message(self, *_):
        pass


class _Squatter:
    """A plain HTTP program on loopback that answers 404 to everything, on its own port."""

    def __enter__(self):
        self.server = http.server.HTTPServer(("127.0.0.1", 0), _NotFound)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=30)


# 1. Listening is not readiness.

def test_listening_is_not_readiness_until_the_product_credential_is_provisioned(tmp_path):
    world = start_door_world(tmp_path, provision=False)
    try:
        for path in ("/api/runtime/v1/health", "/api/runtime/v1/realm"):
            reply = world.call(path)
            assert reply.status == 503, path
            assert reply.json() == {"error": "runtime_unavailable"}, path
            assert reply.headers["access-control-allow-origin"] == HOSTED, path

        world.provision()

        for path in ("/api/runtime/v1/health", "/api/runtime/v1/realm"):
            reply = world.call(path)
            assert reply.status == 200, path
            assert reply.headers["access-control-allow-origin"] == HOSTED, path
    finally:
        world.stop()


# 2. Identity of the credential the door acts with.

def test_door_refuses_the_owner_credential_and_unknown_or_missing_credentials(tmp_path):
    world = start_door_world(tmp_path)
    try:
        assert world.call("/api/runtime/v1/health").status == 200

        write_owner_only(world.credential_file, {"version": 1, "scope": "astrid", "actor_id": "owner", "token": world.daemon.token})
        reply = world.call("/api/runtime/v1/health")
        assert reply.status == 503
        assert reply.json() == {"error": "runtime_identity_mismatch"}

        write_owner_only(world.credential_file, {"version": 1, "scope": "astrid", "actor_id": PRODUCT_ACTOR, "token": "not-a-token-the-runtime-knows"})
        reply = world.call("/api/runtime/v1/health")
        assert reply.status == 503
        assert reply.json() == {"error": "runtime_unavailable"}

        world.credential_file.unlink()
        reply = world.call("/api/runtime/v1/health")
        assert reply.status == 503
        assert reply.json() == {"error": "runtime_unavailable"}

        write_owner_only(world.credential_file, {"version": 1, "scope": "astrid", "actor_id": PRODUCT_ACTOR, "token": world.product_token}, mode=0o644)
        reply = world.call("/api/runtime/v1/health")
        assert reply.status == 503
        assert reply.json() == {"error": "runtime_unavailable"}

        write_owner_only(world.credential_file, {"version": 1, "scope": "astrid", "actor_id": PRODUCT_ACTOR, "token": world.product_token})
        assert world.call("/api/runtime/v1/health").status == 200
    finally:
        world.stop()


# 3. Revoked readiness.

def test_revoked_readiness_fences_the_door_but_not_the_runtime_listener(tmp_path):
    world = start_door_world(tmp_path)
    try:
        assert world.call("/api/runtime/v1/health").status == 200

        world.daemon.service._verified = False

        reply = world.call("/api/runtime/v1/health")
        assert reply.status == 503
        assert reply.json() == {"error": "runtime_unavailable"}

        status, _ = world.owner("GET", "/v1/health")
        assert status == 200
    finally:
        world.stop()


# 4. Shutdown fences both listeners.

def test_shutdown_refuses_connections_on_both_the_runtime_and_the_door(tmp_path):
    world = start_door_world(tmp_path)
    main_port = world.daemon.httpd.server_port
    door_port = world.port
    try:
        assert main_port != door_port
    finally:
        world.stop()

    for port in (main_port, door_port):
        with pytest.raises(ConnectionRefusedError):
            socket.create_connection(("127.0.0.1", port), timeout=5)


# 5. Discovery.

def test_discovery_advertises_the_door_only_when_one_is_open(tmp_path):
    world = start_door_world(tmp_path)
    try:
        discovery = json.loads((world.support / "discovery.json").read_text(encoding="utf-8"))
        assert discovery["door_endpoint"] == f"http://127.0.0.1:{world.port}"
        assert discovery["door_origin"] == HOSTED
    finally:
        world.stop()

    realm = tmp_path / "plain" / "realm"
    realm.parent.mkdir()
    create_realm(realm)
    plain = RuntimeDaemon(realm, support_root=tmp_path / "plain" / "support").start()
    try:
        discovery = json.loads((tmp_path / "plain" / "support" / "discovery.json").read_text(encoding="utf-8"))
        assert "door_endpoint" not in discovery
        assert "door_origin" not in discovery
        assert plain.door_endpoint is None
    finally:
        plain.stop()


# 6. Port taken, named.

def test_second_daemon_on_a_held_door_port_names_the_astrid_runtime_and_releases_its_listener(tmp_path):
    (tmp_path / "a").mkdir()
    world_a = start_door_world(tmp_path / "a")
    second = None
    try:
        realm_b = create_realm_in(tmp_path / "b")
        second = RuntimeDaemon(
            realm_b, support_root=tmp_path / "b" / "support",
            door=DoorConfig(origin=HOSTED, port=world_a.port, credential_file=tmp_path / "b" / "astrid.json"),
        )
        with pytest.raises(DoorPortTaken) as caught:
            second.start()
        message = str(caught.value)
        assert f"port {world_a.port} is already served by another Astrid Runtime for realm" in message
        assert "Door Realm" in message
        assert world_a.daemon.service.realm["id"] in message
        # The hosted page only ever looks on the well-known port: the way out is stopping the holder, never another port.
        assert "stop that one first (astrid-runtime down)" in message
        assert "--door-port" not in message
        assert second.httpd is None
    finally:
        if second is not None:
            second.stop()
        world_a.stop()


def test_door_port_held_by_a_non_astrid_program_is_named_as_such(tmp_path):
    with _Squatter() as squatter:
        realm = create_realm_in(tmp_path / "s")
        daemon = RuntimeDaemon(
            realm, support_root=tmp_path / "s" / "support",
            door=DoorConfig(origin=HOSTED, port=squatter.port, credential_file=tmp_path / "s" / "astrid.json"),
        )
        try:
            with pytest.raises(DoorPortTaken, match="is already in use by a program that is not an Astrid Runtime"):
                daemon.start()
            assert daemon.httpd is None
        finally:
            daemon.stop()


def test_display_name_with_a_terminal_escape_is_printed_without_it(tmp_path):
    (tmp_path / "esc").mkdir()
    holder_realm = tmp_path / "esc" / "realm"
    create_realm(holder_realm, display_name="Door \x1b[31mRealm")
    holder = DoorWorld(tmp_path / "esc", RuntimeDaemon(
        holder_realm, support_root=tmp_path / "esc" / "support",
        door=DoorConfig(origin=HOSTED, port=0, credential_file=tmp_path / "esc" / "astrid.json"),
    ).start(), tmp_path / "esc" / "astrid.json")
    second = None
    try:
        holder.provision()  # the probe reads the holder's health and realm routes, which need the product credential
        port = holder.port
        second_realm = create_realm_in(tmp_path / "esc2")
        second = RuntimeDaemon(
            second_realm, support_root=tmp_path / "esc2" / "support",
            door=DoorConfig(origin=HOSTED, port=port, credential_file=tmp_path / "esc2" / "astrid.json"),
        )
        with pytest.raises(DoorPortTaken) as caught:
            second.start()
        message = str(caught.value)
        assert "\x1b" not in message
        assert "Door ?[31mRealm" in message
    finally:
        if second is not None:
            second.stop()
        holder.stop()


# 7. The daemon CLI.

def test_daemon_cli_reports_a_taken_door_port_as_a_named_failure(tmp_path):
    with _Squatter() as squatter:
        realm = create_realm_in(tmp_path / "cli")
        result = subprocess.run(
            [sys.executable, "-m", "runtime_protocol.cli", "start", "--root", str(realm), "--support-root", str(tmp_path / "cli" / "support"),
             "--door-origin", HOSTED, "--door-port", str(squatter.port), "--door-credential-file", str(tmp_path / "cli" / "astrid.json")],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=HANG_GUARD_SECONDS,
        )
    assert result.returncode == 1, result.stderr
    value = json.loads(result.stdout.strip().splitlines()[-1])
    assert value["ok"] is False
    assert value["error"]["code"] == "door_port_taken"
    assert "is already in use by a program that is not an Astrid Runtime; stop it" in value["error"]["message"]
    assert "--door-port" not in value["error"]["message"]


def test_daemon_cli_refuses_a_non_https_hosted_origin(tmp_path):
    realm = create_realm_in(tmp_path / "http")
    result = subprocess.run(
        [sys.executable, "-m", "runtime_protocol.cli", "start", "--root", str(realm), "--support-root", str(tmp_path / "http" / "support"),
         "--door-origin", "http://hosted.test", "--door-port", "0", "--door-credential-file", str(tmp_path / "http" / "astrid.json")],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=HANG_GUARD_SECONDS,
    )
    assert result.returncode == 1, result.stderr
    value = json.loads(result.stdout.strip().splitlines()[-1])
    assert value["ok"] is False


# 8. Bind guard.

def _lan_ipv4():
    candidates = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))
            candidates.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        candidates.extend(info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    for address in candidates:
        if not address.startswith("127.") and address != "0.0.0.0":
            return address
    return None


def test_door_is_not_reachable_on_a_non_loopback_address(tmp_path):
    world = start_door_world(tmp_path)
    try:
        # The listener is bound to loopback alone; where the machine has another address, that address refuses it.
        assert world.daemon.door_httpd.server_address[0] == "127.0.0.1"
        address = _lan_ipv4()
        if address is not None:
            with pytest.raises(ConnectionRefusedError):
                socket.create_connection((address, world.port), timeout=5)
        loopback = socket.create_connection(("127.0.0.1", world.port), timeout=5)
        loopback.close()
    finally:
        world.stop()


# 9. Boundary wiring, no real daemon.

def _boundary_source(tmp_path: Path) -> SourceProfile:
    source_checkout = tmp_path / "source"
    source_checkout.mkdir()
    return SourceProfile(
        profile="astrid",
        runtime_checkout="/door-test/runtime-checkout",
        source_checkout=str(source_checkout),
        runtime_command=(sys.executable, "-c", "pass"),
        runtime_environment="",
        protocol_version="workspace.v1",
        schema_version="workspace-schema-v1",
        capability_digest="digest",
    )


def _argv(boundary: LocalRuntimeBoundary, source: SourceProfile) -> list[str]:
    return boundary._argv(
        source, realm_id="realm-1", realm_root=Path("/door-test/realm"), support_root=Path("/door-test/support"),
        display_name="Door Test", owner_lock=Path("/door-test/owner.lock"), token_file=Path("/door-test/token.json"),
    )


def test_boundary_passes_the_door_flags_to_the_daemon_only_when_configured(tmp_path):
    source = _boundary_source(tmp_path)
    boundary = LocalRuntimeBoundary()
    boundary.configure_door(DoorSettings(origin="https://astrid.haus", port=17340), Path("/abs/astrid.json"))
    assert _argv(boundary, source)[-6:] == ["--door-origin", "https://astrid.haus", "--door-port", "17340", "--door-credential-file", "/abs/astrid.json"]

    boundary.configure_door(None, Path("/abs/astrid.json"))
    assert "--door-origin" not in _argv(boundary, source)


# 10. Named startup failure.

def test_startup_failure_reads_the_last_named_error_after_the_offset(tmp_path):
    log = tmp_path / "runtime.log"
    before = json.dumps({"ok": False, "error": {"code": "old", "message": "OLD FAILURE"}}) + "\n"
    log.write_text(before, encoding="utf-8")
    offset = log.stat().st_size
    with log.open("a", encoding="utf-8") as handle:
        handle.write("plain non-json startup chatter\n")
        handle.write(json.dumps({"ok": True}) + "\n")
        handle.write(json.dumps({"ok": False, "error": {"code": "door_port_taken", "message": "NEW FAILURE"}}) + "\n")
        handle.write("trailing non-json line\n")
    assert LocalRuntimeBoundary._startup_failure(log, offset) == "NEW FAILURE"


def test_startup_failure_is_none_when_nothing_named_was_logged_after_the_offset(tmp_path):
    log = tmp_path / "runtime.log"
    log.write_text(json.dumps({"ok": False, "error": {"code": "old", "message": "OLD FAILURE"}}) + "\n", encoding="utf-8")
    offset = log.stat().st_size
    with log.open("a", encoding="utf-8") as handle:
        handle.write("not json at all\n")
    assert LocalRuntimeBoundary._startup_failure(log, offset) is None
    assert LocalRuntimeBoundary._startup_failure(tmp_path / "missing.log", 0) is None


# 11. The astrid-runtime CLI.

def test_up_defaults_to_the_hosted_origin_and_the_env_door_port(monkeypatch):
    args = astrid_cli.parser().parse_args(["up"])
    assert args.hosted_origin == "https://astrid.haus"
    assert args.door_port == 0

    monkeypatch.setenv("ASTRID_RUNTIME_DOOR_PORT", "17340")
    args = astrid_cli.parser().parse_args(["up"])
    assert args.door_port == 17340


def test_hosted_origin_off_means_no_door(monkeypatch):
    args = astrid_cli.parser().parse_args(["up", "--hosted-origin", "off"])
    assert astrid_cli._config(args, None).door is None

    args = astrid_cli.parser().parse_args(["up"])
    assert astrid_cli._config(args, None).door == DoorSettings(origin="https://astrid.haus", port=0)


def test_invalid_hosted_origin_and_door_port_are_argparse_errors(capsys):
    with pytest.raises(SystemExit):
        astrid_cli.parser().parse_args(["up", "--hosted-origin", "http://x"])
    with pytest.raises(SystemExit):
        astrid_cli.parser().parse_args(["up", "--door-port", "70000"])


def _result(door_origin):
    return BootstrapResult(
        "started", "realm-1", "Door Test", "http://127.0.0.1:1", "astrid-door-product", "astrid",
        door_origin=door_origin, door_endpoint="http://127.0.0.1:2" if door_origin else None,
        runtime_instance_id="door-instance",
    )


def test_emit_ready_names_the_page_to_open_only_in_text_mode(capsys):
    astrid_cli._emit_ready(_result("https://astrid.haus"), json_mode=False)
    assert capsys.readouterr().out.splitlines()[-1] == "Open https://astrid.haus"

    astrid_cli._emit_ready(_result(None), json_mode=False)
    assert "Open " not in capsys.readouterr().out

    astrid_cli._emit_ready(_result("https://astrid.haus"), json_mode=True)
    assert "Open " not in capsys.readouterr().out


# Helpers for the tests above.

def create_realm_in(root: Path) -> Path:
    """A fresh canonical realm under ``root``; returns the realm root."""
    root.mkdir(parents=True, exist_ok=True)
    realm = root / "realm"
    create_realm(realm)
    return realm


# The door through a real `astrid-runtime up` (darwin_native lane: real daemon processes under custody).

def _real_config(door):
    from astrid_runtime import BootstrapConfig, SourceProfile

    checkout = Path(__file__).parents[1].resolve()
    profile = SourceProfile(profile="astrid", runtime_checkout=str(checkout), source_checkout=str(checkout))
    return BootstrapConfig(source_profile=profile, door=door)


@pytest.mark.darwin_native
def test_real_up_opens_a_ready_door_and_names_a_taken_port(tmp_path, owned_process_groups):
    from astrid_runtime import LocalRuntimeBoundary, RuntimePaths, bootstrap, configure_workspace
    from astrid_runtime.bootstrap import BootstrapError, DoorSettings

    paths = RuntimePaths.sandbox(tmp_path / "home")
    boundary = LocalRuntimeBoundary()
    starter = LocalRuntimeBoundary()
    owned_process_groups.add_cleanup(lambda: starter.stop() if getattr(starter, "_process", None) is not None else None)
    squatter = http.server.HTTPServer(("127.0.0.1", 0), _NotFound)
    threading.Thread(target=squatter.serve_forever, daemon=True).start()
    try:
        configure_workspace(paths, boundary, _real_config(None), mode="create", realm_root=paths.realms_dir / "door-realm", realm_id="door-realm")
        # A program on the door's port: `up` fails, names it, and leaves nothing running or advertised.
        taken = squatter.server_address[1]
        with pytest.raises(BootstrapError, match=f"port {taken} is already in use by a program that is not an Astrid Runtime"):
            bootstrap(paths, boundary, _real_config(DoorSettings(origin=HOSTED, port=taken)))
        assert not paths.discovery_path.exists()

        # A free port: once `up` returns, the door answers the hosted origin with the product credential `up` provisioned.
        result = bootstrap(paths, starter, _real_config(DoorSettings(origin=HOSTED, port=0)))
        assert result.door_origin == HOSTED
        door_port = int(result.door_endpoint.rsplit(":", 1)[1])
        discovery = json.loads(paths.discovery_path.read_text())
        assert (discovery["door_endpoint"], discovery["door_origin"]) == (result.door_endpoint, HOSTED)
        realm = door_call(door_port, "/api/runtime/v1/realm")
        assert realm.status == 200, realm.body
        assert realm.json()["realm_id"] == result.realm_id
    finally:
        squatter.shutdown()
        squatter.server_close()
        if getattr(starter, "_process", None) is not None:
            starter.stop()
