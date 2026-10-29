from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.sdk import host_bootstrap


# Published by the reconciled Runtime launcher/daemon contract. Keep this
# independent of Astrid's constant so the combined-tuple mismatch is visible.
_RUNTIME_WORKER_SCOPES = (
    "handshake", "worker:register", "worker:execute", "projects:read",
    "tasks:read", "objects:read", "objects:write",
)


@pytest.mark.parametrize("launch_mode", ["plain", "remotion", "foreground"])
def test_host_bootstrap_binds_manifest_in_argv_and_reuses_exact_binding(
    tmp_path: Path, monkeypatch, launch_mode
) -> None:
    support = tmp_path / "support"
    credentials = support / "credentials"
    credentials.mkdir(parents=True)
    worker_file = credentials / "astrid-pack-host.token"
    worker_file.write_text("worker-token\n", encoding="utf-8")
    worker_file.chmod(0o600)
    source = Path(__file__).resolve().parents[2]
    captured: list[list[str]] = []

    class FakeRuntime:
        def __init__(self, *_args, **_kwargs):
            pass

        def health(self):
            return {
                "status": "ok",
                "runtime_epoch": 7,
                "runtime_instance_id": "runtime-7",
                "schema_digest": "schema-7",
            }

    class FakeProcess:
        pid = 4242

        def poll(self):
            return None

    def fake_popen(argv, **_kwargs):
        captured.append(list(argv))
        ready = Path(argv[argv.index("--ready-file") + 1])
        manifest = Path(argv[argv.index("--boot-manifest-path") + 1])
        from astrid.core._shared.boot_manifest import load_boot_manifest_hash

        expected = {
            "status": "ready",
            "pid": FakeProcess.pid,
            "process_birth_id": "birth-4242",
            "python_executable": os.path.abspath(sys.executable),
            "endpoint": "http://127.0.0.1:9999",
            "executor_id": "astrid-pack-host",
            "ready_file": str(ready),
            "credential_file": str(worker_file.resolve()),
            "support_root": str(support.resolve()),
                "source_checkout": str(source.resolve()),
                "source_checkout_digest": "source-digest",
                "source_closure_digest": argv[argv.index("--source-closure-digest") + 1],
                "source_inventory_identity": "",
                "runtime_instance_id": "runtime-7",
            "runtime_epoch": 7,
            "schema_digest": "schema-7",
            "boot_manifest_path": str(manifest),
            "boot_manifest_hash": load_boot_manifest_hash(manifest, support_root=support),
            "ready_capabilities": ["shots.example"],
        }
        ready.parent.mkdir(parents=True, exist_ok=True)
        ready.write_text(json.dumps(expected), encoding="utf-8")
        return FakeProcess()

    monkeypatch.delenv("ASTRID_REMOTION_PROJECT_DIR", raising=False)
    monkeypatch.setattr(host_bootstrap, "_provision_render_runtime_env", lambda *_args: None)
    monkeypatch.setattr(host_bootstrap, "RuntimeProtocolClient", FakeRuntime, raising=False)
    monkeypatch.setattr(host_bootstrap, "popen_owned_group", fake_popen)
    monkeypatch.setattr(host_bootstrap, "_host_birth_identity", lambda _pid: "birth-4242")
    monkeypatch.setattr(host_bootstrap, "_capture_native_host_launch_identity", lambda pid: {
        "pid": pid, "uid": os.getuid(), "pgid": pid, "start_sec": 1700000000, "start_usec": 1})
    monkeypatch.setattr(host_bootstrap, "_registered_host_status", lambda _state: "ours")
    monkeypatch.setattr(host_bootstrap, "_host_pid_alive", lambda _pid: True)
    stopped_groups: list[int] = []
    monkeypatch.setattr(host_bootstrap, "_stop_group", lambda pgid, **_kwargs: stopped_groups.append(pgid))
    monkeypatch.setattr(host_bootstrap, "source_checkout_digest", lambda _path: "source-digest", raising=False)

    # The bootstrap module imports these two symbols lazily in ensure_pack_host.
    monkeypatch.setattr(
        "astrid.core.execution.generic_host.RuntimeProtocolClient",
        FakeRuntime,
    )
    monkeypatch.setattr(
        "astrid.core.execution.generic_host.source_checkout_digest",
        lambda _path: "source-digest",
    )
    monkeypatch.setattr(
        "astrid.core.pack.source_setup.active_source_inventory",
        lambda: SimpleNamespace(identity="", roots=(), sources=()),
    )

    value = {
        "worker_credential_file": str(worker_file),
        "worker_actor": host_bootstrap.PACK_HOST_ACTOR,
        "worker_scopes": _RUNTIME_WORKER_SCOPES,
        "source_checkout": str(source),
        "endpoint": "http://127.0.0.1:9999",
        "runtime_epoch": 7,
    }
    if launch_mode == "remotion":
        def provision(_source, environment):
            environment["ASTRID_REMOTION_PROJECT_DIR"] = str(tmp_path / "missing-runtime")
        monkeypatch.setattr(host_bootstrap, "_provision_render_runtime_env", provision)
    if launch_mode == "foreground":
        from astrid.core.execution import generic_host

        entered = []
        monkeypatch.setattr(sys, "argv", [])
        monkeypatch.setattr(sys, "path", list(sys.path))
        monkeypatch.setattr(os, "environ", dict(os.environ))
        monkeypatch.chdir(source)

        def foreground_loop():
            from runtime_protocol import platform as runtime_platform

            # The long-running worker must not retain the bootstrap lock.
            with runtime_platform.file_lock(support / "generic-host.lock", blocking=False):
                pass
            state = json.loads((support / "generic-host.json").read_text())
            assert state["pid"] == os.getpid()
            assert state["process_birth_id"] == "birth-4242"
            assert "--register" in sys.argv
            assert sys.argv[sys.argv.index("--credential-file") + 1] == str(worker_file)
            assert sys.argv[sys.argv.index("--runtime-endpoint") + 1] == value["endpoint"]
            entered.append(True)
            return 7

        monkeypatch.setattr(generic_host, "_cli", foreground_loop)
        assert host_bootstrap.run_pack_host_foreground(value) == 7
        assert entered == [True]
        assert captured == [], "the foreground entry point must not spawn a detached host"
        return
    first = host_bootstrap.ensure_pack_host(value, reconfigure_action="reconfigure")
    manifest = support / "astrid-host" / "boot-manifest.json"
    assert manifest.is_file()
    assert "--boot-manifest-path" in captured[0]
    assert captured[0][captured[0].index("--boot-manifest-path") + 1] == str(manifest)
    assert "--boot-manifest-hash" in captured[0]
    assert captured[0][captured[0].index("--boot-manifest-hash") + 1] == first["host_boot_manifest_hash"]
    assert first["host_boot_manifest_path"] == str(manifest)
    assert first["host_boot_manifest_hash"]
    assert captured[0][1:3] == ["-X", "utf8"]
    if launch_mode == "plain":
        # Run the configured host interpreter with the exact startup prefix
        # observed at its real host launch boundary, replacing only the module.
        command = captured[0]
        module_index = command.index("-m")
        host_probe = subprocess.run(
            [*command[:module_index], "-c", "import sys; print(sys.flags.utf8_mode)"],
            env={**os.environ, "PYTHONUTF8": "0"}, check=True, capture_output=True, text=True,
        )
        control = subprocess.run(
            [command[0], "-c", "import sys; print(sys.flags.utf8_mode)"],
            env={**os.environ, "PYTHONUTF8": "0"}, check=True, capture_output=True, text=True,
        )
        assert host_probe.stdout.strip() == "1"
        assert control.stdout.strip() == "0"

    second = host_bootstrap.ensure_pack_host(value, reconfigure_action="reconfigure")
    assert second == first
    assert len(captured) == 1
    assert not (tmp_path / ".astrid" / "astrid.sqlite3").exists()



def test_parked_host_preserves_projected_environment(tmp_path, monkeypatch):
    import socket
    monkeypatch.setattr(host_bootstrap.sys, "platform", "darwin")
    monkeypatch.setenv("__CF_USER_TEXT_ENCODING", "1:0")
    monkeypatch.setenv("ASTRID_TASK_RUN_ID", "ambient-task")
    source = tmp_path / 'source'
    source.mkdir()
    reference = SimpleNamespace(
        effective_target={'kind': 'machine', 'id': socket.gethostname()},
        source_checkout=source, pack_roots=(source,), ready_file=tmp_path / 'ready.json',
        support_root=tmp_path, dependency_closure=(), digest=lambda: 'deployment',
        source_closure_digest='sha256:closure', credential_ref='file:' + str(tmp_path / 'credential'),
        runtime_endpoint='http://127.0.0.1:9999', boot_manifest_path=tmp_path / 'boot.json',
        boot_manifest_hash='sha256:' + 'a' * 64)
    launch = SimpleNamespace(deployment_digest='deployment', env=lambda: {'HOME': str(tmp_path)},
                             argv=(sys.executable, '-m', 'astrid.core.execution.generic_host'), cwd=source)
    def host_created(argv, **kwargs):
        assert argv[:3] == [sys.executable, "-X", "utf8"]
        assert kwargs['env']['__CF_USER_TEXT_ENCODING'] == '1:0'
        assert 'ASTRID_TASK_RUN_ID' not in kwargs['env']
        return SimpleNamespace(pid=4244)
    monkeypatch.setattr(host_bootstrap, '_dependency_pythonpath', lambda: ())
    monkeypatch.setattr(host_bootstrap, '_provision_render_runtime_env', lambda *_args: None)
    monkeypatch.setattr(host_bootstrap, '_host_birth_identity', lambda _pid: 'exact-birth')
    monkeypatch.setattr(host_bootstrap, "_capture_native_host_launch_identity", lambda pid: {
        "pid": pid, "uid": os.getuid(), "pgid": pid, "start_sec": 1700000000, "start_usec": 1})
    monkeypatch.setattr(host_bootstrap, 'popen_owned_group', host_created)
    monkeypatch.setattr(host_bootstrap, '_RETAINED_HOSTS', {})
    preparer = host_bootstrap._ParkedPackHostPreparer(project_launch=lambda _ref: launch)
    handle = preparer.prepare(reference)
    try:
        assert host_bootstrap._RETAINED_HOSTS[(4244, 'exact-birth')] is handle.process
    finally:
        handle.control.close()


def test_parked_host_rejects_conflicting_projected_cf_encoding(tmp_path, monkeypatch):
    import socket

    from astrid.core.subprocess_env import SubprocessEnvPolicyError

    monkeypatch.setattr(host_bootstrap.sys, "platform", "darwin")
    monkeypatch.setenv("__CF_USER_TEXT_ENCODING", "1:0")
    source = tmp_path / 'source'
    source.mkdir()
    reference = SimpleNamespace(
        effective_target={'kind': 'machine', 'id': socket.gethostname()},
        source_checkout=source, pack_roots=(source,), ready_file=tmp_path / 'ready.json',
        support_root=tmp_path, dependency_closure=(), digest=lambda: 'deployment',
        source_closure_digest='sha256:closure', credential_ref='file:' + str(tmp_path / 'credential'),
        runtime_endpoint='http://127.0.0.1:9999', boot_manifest_path=tmp_path / 'boot.json',
        boot_manifest_hash='sha256:' + 'a' * 64)
    launch = SimpleNamespace(
        deployment_digest='deployment',
        env=lambda: {'HOME': str(tmp_path), '__CF_USER_TEXT_ENCODING': '2:0'},
        argv=(sys.executable, '-m', 'astrid.core.execution.generic_host'), cwd=source)
    preparer = host_bootstrap._ParkedPackHostPreparer(project_launch=lambda _ref: launch)

    with pytest.raises(SubprocessEnvPolicyError, match='conflicts with its inherited owner pin'):
        preparer.prepare(reference)
    assert preparer._handle is None


def test_launch_and_reuse_share_server_render_environment(tmp_path, monkeypatch):
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('ASTRID_PACKS_PATH', str(tmp_path / 'foreign-pack-root'))
    monkeypatch.setenv('PYTHONPATH', str(tmp_path / 'foreign-import'))
    monkeypatch.setattr(host_bootstrap, '_dependency_pythonpath', lambda: (str(tmp_path / 'dependency'),))
    monkeypatch.setattr(host_bootstrap, '_provision_render_runtime_env', lambda source, env: env.update(ASTRID_REMOTION_PROJECT_DIR=str(source / 'remotion')))
    source = tmp_path / 'trusted-source'
    launch = host_bootstrap._host_render_environment(source)
    reuse = host_bootstrap._host_render_environment(source)
    assert 'ASTRID_PACKS_PATH' not in launch and launch == reuse
    assert launch['PYTHONPATH'] == os.pathsep.join((str(source), str(tmp_path / 'dependency')))


@pytest.mark.parametrize("defect", ["missing_project_read", "extra_admin", "reordered", "duplicate", "wrong_actor"])
def test_host_bootstrap_refuses_noncanonical_runtime_worker_handoff_before_use(
    tmp_path: Path, monkeypatch, defect: str
) -> None:
    worker = tmp_path / "credentials" / "astrid-pack-host.token"
    worker.parent.mkdir()
    worker.write_text("unused-fixture-token\n")
    worker.chmod(0o600)
    scopes = list(_RUNTIME_WORKER_SCOPES)
    actor = "astrid-pack-host"
    if defect == "missing_project_read":
        scopes.remove("projects:read")
    elif defect == "extra_admin":
        scopes.append("admin")
    elif defect == "reordered":
        scopes[0], scopes[1] = scopes[1], scopes[0]
    elif defect == "duplicate":
        scopes.append("projects:read")
    else:
        actor = "foreign-worker"
    monkeypatch.setattr(
        "astrid.core.pack.source_setup.active_source_inventory",
        lambda: SimpleNamespace(identity="", roots=(), sources=()),
    )
    used = []
    def forbidden(*_args, **_kwargs):
        used.append(True)
        raise AssertionError("invalid handoff reached credential use or child acquisition")
    monkeypatch.setattr("astrid.core.execution.generic_host.RuntimeProtocolClient", forbidden)
    monkeypatch.setattr(host_bootstrap, "popen_owned_group", forbidden)
    with pytest.raises(host_bootstrap.PackHostBootstrapError, match="least-privilege pack-host contract"):
        host_bootstrap.ensure_pack_host({
            "source_checkout": str(Path(__file__).resolve().parents[2]),
            "worker_credential_file": str(worker), "worker_actor": actor,
            "worker_scopes": scopes, "endpoint": "http://127.0.0.1:9999",
        }, reconfigure_action="reconfigure")
    assert not used
    assert not (tmp_path / "remotion-validation").exists()
