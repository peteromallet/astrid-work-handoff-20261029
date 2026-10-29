"""Focused tests for the canonical local VibeComfy runtime boundary."""

from __future__ import annotations

import sys
import types

from astrid.core.generation.backends.vibecomfy import VibeComfyBackend


def test_real_vibe_workflow_crosses_compiled_bundle_boundary(monkeypatch) -> None:
    class FakeWorkflow:
        pass

    class FakeBundle:
        def require_canonical_authority(self, purpose: str) -> None:
            assert purpose == "runtime execution"

        def compile(self) -> object:
            return "approved-projection"

    bundle = FakeBundle()
    calls: list[tuple[object, ...]] = []

    vibecomfy = types.ModuleType("vibecomfy")
    vibecomfy.__path__ = []  # type: ignore[attr-defined]
    workflow_module = types.ModuleType("vibecomfy.workflow")
    workflow_module.VibeWorkflow = FakeWorkflow  # type: ignore[attr-defined]
    workflow_bundle_module = types.ModuleType("vibecomfy.workflow_bundle")
    workflow_bundle_module.load_bundle = lambda value: bundle  # type: ignore[attr-defined]
    runtime = types.ModuleType("vibecomfy.runtime")
    runtime.__path__ = []  # type: ignore[attr-defined]
    runtime_run = types.ModuleType("vibecomfy.runtime.run")

    def run_sync(*args):
        calls.append(args)
        return "runtime-result"

    runtime_run.run_sync = run_sync  # type: ignore[attr-defined]
    for name, module in {
        "vibecomfy": vibecomfy,
        "vibecomfy.workflow": workflow_module,
        "vibecomfy.workflow_bundle": workflow_bundle_module,
        "vibecomfy.runtime": runtime,
        "vibecomfy.runtime.run": runtime_run,
    }.items():
        monkeypatch.setitem(sys.modules, name, module)

    result = VibeComfyBackend()._run_workflow(FakeWorkflow())

    assert result == "runtime-result"
    assert calls == [("approved-projection", bundle)]


# Exact selected canonical ownership bodies; self-contained OS-only fixture.
_SELECTED_COMPOSITE_SOURCE = 'from __future__ import annotations\nimport json,sys,urllib.parse,subprocess\nfrom pathlib import Path\nfrom typing import Any\n\ndef _read_launch_marker(session_dir: Path) -> dict[str, Any] | None:\n    try:\n        marker = json.loads((session_dir / "launch.json").read_text(encoding="utf-8"))\n    except (OSError, json.JSONDecodeError):\n        return None\n    return marker if isinstance(marker, dict) else None\n\ndef _process_start_identity(pid: int) -> str | None:\n    """Return an OS-provided process incarnation value, or fail closed."""\n    proc_stat = Path(f"/proc/{pid}/stat")\n    try:\n        raw = proc_stat.read_text(encoding="utf-8")\n    except OSError:\n        raw = ""\n    if raw:\n        closing_paren = raw.rfind(")")\n        fields = raw[closing_paren + 2 :].split() if closing_paren >= 0 else []\n        if len(fields) > 19:\n            return fields[19]\n\n    try:\n        result = subprocess.run(\n            ["ps", "-p", str(pid), "-o", "lstart="],\n            check=False,\n            capture_output=True,\n            text=True,\n            timeout=2,\n        )\n    except (OSError, subprocess.SubprocessError):\n        return None\n    value = result.stdout.strip()\n    return value or None\n\ndef _process_commandline(pid: int) -> tuple[str, ...] | None:\n    try:\n        raw = Path(f"/proc/{pid}/cmdline").read_bytes()\n    except OSError:\n        raw = None\n    if raw is not None:\n        if not isinstance(raw, bytes) or not raw or not raw.endswith(b"\\0"):\n            return None\n        parts = raw.split(b"\\0")\n        if len(parts) < 2 or any(not part for part in parts[:-1]):\n            return None\n        try:\n            commandline = tuple(part.decode("utf-8") for part in parts[:-1])\n        except UnicodeDecodeError:\n            return None\n        launch_flag_positions = [\n            index for index, argument in enumerate(commandline) if argument == "--launch-token"\n        ]\n        if launch_flag_positions and (\n            len(launch_flag_positions) != 1\n            or launch_flag_positions[0] + 1 >= len(commandline)\n        ):\n            return None\n        return commandline\n    if sys.platform != "darwin":\n        return None\n    return _darwin_process_commandline(pid)\n\ndef _launch_token_is_exactly_paired(commandline: tuple[str, ...], token: str) -> bool:\n    """Return whether *token* is the sole exact ``--launch-token`` value."""\n    flag_positions = [\n        index for index, argument in enumerate(commandline) if argument == "--launch-token"\n    ]\n    if len(flag_positions) != 1:\n        return False\n    flag_index = flag_positions[0]\n    return flag_index + 1 < len(commandline) and commandline[flag_index + 1] == token\n\ndef _session_ownership_verified(session_dir: Path, pid: int) -> bool:\n    marker = _read_launch_marker(session_dir)\n    if marker is None:\n        return False\n    try:\n        marker_pid = int((session_dir / "pid").read_text(encoding="utf-8").strip())\n        marker_url = (session_dir / "url").read_text(encoding="utf-8").strip()\n    except (OSError, ValueError):\n        return False\n    token = marker.get("launch_token")\n    start_identity = marker.get("process_start_identity")\n    if (\n        marker.get("pid") != pid\n        or marker_pid != pid\n        or marker.get("url") != marker_url\n        or not isinstance(token, str)\n        or not token\n    ):\n        return False\n    if not isinstance(start_identity, str) or not start_identity:\n        return False\n    if _process_start_identity(pid) != start_identity:\n        return False\n    commandline = _process_commandline(pid)\n    return commandline is not None and _launch_token_is_exactly_paired(commandline, token)\n\ndef _listener_owner_pid(url: str) -> int | None:\n    """Return the sole local TCP listener owner for *url*, or fail closed."""\n    parsed = urllib.parse.urlsplit(url)\n    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.port is None:\n        return None\n    try:\n        result = subprocess.run(\n            ["lsof", "-nP", "-t", "-a", "-iTCP:" + str(parsed.port), "-sTCP:LISTEN"],\n            capture_output=True,\n            text=True,\n            check=False,\n            timeout=2,\n        )\n    except (OSError, subprocess.SubprocessError):\n        return None\n    if result.returncode != 0:\n        return None\n    owners: set[int] = set()\n    for line in result.stdout.splitlines():\n        try:\n            owners.add(int(line.strip()))\n        except ValueError:\n            return None\n    return next(iter(owners)) if len(owners) == 1 else None\n\ndef _process_parent_pid(pid: int) -> int | None:\n    try:\n        fields = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").rsplit(")", 1)[-1].split()\n        if len(fields) >= 2:\n            return int(fields[1])\n    except (OSError, ValueError):\n        pass\n    try:\n        result = subprocess.run(\n            ["ps", "-p", str(pid), "-o", "ppid="],\n            capture_output=True,\n            text=True,\n            check=False,\n            timeout=1,\n        )\n        if result.returncode == 0:\n            return int(result.stdout.strip())\n    except (OSError, ValueError, subprocess.SubprocessError):\n        pass\n    return None\n\ndef _session_composite_ownership_verified(session_dir: Path, daemon_pid: int) -> bool:\n    """Verify the daemon, its Comfy child, and the listener as one custody unit."""\n    marker = _read_launch_marker(session_dir)\n    if marker is None or not _session_ownership_verified(session_dir, daemon_pid):\n        return False\n    try:\n        child_pid = int((session_dir / "comfy_pid").read_text(encoding="utf-8").strip())\n        child_identity = (session_dir / "comfy_process_start_identity").read_text(encoding="utf-8").strip()\n        marker_child_pid = int(marker["comfy_pid"])\n        marker_child_identity = marker["comfy_process_start_identity"]\n        marker_url = (session_dir / "url").read_text(encoding="utf-8").strip()\n    except (KeyError, OSError, TypeError, ValueError):\n        return False\n    return bool(\n        child_pid > 0\n        and child_identity\n        and marker_child_pid == child_pid\n        and marker_child_identity == child_identity\n        and _process_start_identity(child_pid) == child_identity\n        and _process_parent_pid(child_pid) == daemon_pid\n        and _listener_owner_pid(marker_url) == child_pid\n    )\n'


def _host_composite_case(tmp_path, monkeypatch):
    import json, subprocess
    from pathlib import Path
    from astrid.core.execution import custody_broker, vibecomfy_engine_adapter as adapter
    import astrid.core.generation.backends.vibecomfy as backend
    root = tmp_path / "selected"
    path = root / "vibecomfy/runtime/session.py"
    path.parent.mkdir(parents=True)
    path.write_text(_SELECTED_COMPOSITE_SOURCE)
    module = types.ModuleType("vibecomfy.runtime.session")
    module.__file__ = str(path)
    exec(compile(_SELECTED_COMPOSITE_SOURCE, str(path), "exec"), vars(module))
    package, runtime = types.ModuleType("vibecomfy"), types.ModuleType("vibecomfy.runtime")
    package.__path__, runtime.__path__ = [str(root / "vibecomfy")], [str(path.parent)]
    package.runtime, runtime.session = runtime, module
    for name, selected in [(package.__name__, package), (runtime.__name__, runtime), (module.__name__, module)]:
        monkeypatch.setitem(sys.modules, name, selected)
    rows = {
        910001: {"pid": 910001, "uid": 501, "parent_pid": 1, "pgid": 910001, "start_sec": 1700000000, "start_usec": 1234, "status": 2},
        910002: {"pid": 910002, "uid": 501, "parent_pid": 910001, "pgid": 910001, "start_sec": 1700000001, "start_usec": 2345, "status": 2},
    }
    native_calls, process_calls = [], []
    def native(pid):
        native_calls.append(pid)
        return [dict(rows[pid])] if pid in rows else []
    monkeypatch.setattr(custody_broker, "_darwin_process_records", native)
    monkeypatch.setattr(adapter.sys, "platform", "darwin")
    birth = lambda pid: custody_broker._ps_lstart_birth(rows[pid]["start_sec"]).removeprefix("ps-lstart:")
    session = tmp_path / "session"
    session.mkdir()
    token = "controlled-private-launch-token"
    marker = {"pid": 910001, "url": "http://127.0.0.1:8188", "launch_token": token,
              "process_start_identity": birth(910001), "comfy_pid": 910002,
              "comfy_process_start_identity": birth(910002)}
    for name, value in [("launch.json", json.dumps(marker)), ("pid", "910001"),
                        ("comfy_pid", "910002"), ("url", marker["url"]),
                        ("comfy_process_start_identity", marker["comfy_process_start_identity"])]:
        (session / name).write_text(value)
    command = ["python", "-m", "vibecomfy.runtime.session", "--launch-token", token]
    module._darwin_process_commandline = lambda pid: tuple(command) if pid == 910001 else None
    # Only OS surfaces are controlled. Original marker/token/listener predicate
    # bodies above run unchanged through the real backend entry point.
    class Probe:
        SubprocessError = subprocess.SubprocessError
        def __init__(self): self.allow_ps, self.listener = True, 910002
        def run(self, argv, **kwargs):
            process_calls.append(tuple(argv))
            if argv[0] == "ps":
                assert self.allow_ps, "host ownership unexpectedly created ps descendant"
                value = birth(int(argv[2])) if argv[-1] == "lstart=" else str(rows[int(argv[2])]["parent_pid"])
            else:
                assert argv in (["lsof", "-nP", "-t", "-a", "-iTCP:8188", "-sTCP:LISTEN"], ["lsof", "-O", "-nP", "-t", "-a", "-iTCP:8188", "-sTCP:LISTEN"])
                value = str(self.listener)
            return subprocess.CompletedProcess(argv, 0, value + "\n", "")
    probe = Probe()
    module.subprocess = probe
    return backend, adapter, module, session, marker, command, rows, native_calls, process_calls, probe


def test_real_host_composite_original_bodies_are_transitively_native_and_module_isolated(tmp_path, monkeypatch):
    import ast, json
    from pathlib import Path
    backend, adapter, module, session, marker, command, rows, native, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    original_globals = dict(vars(module))
    # Exact original composite traverses daemon birth, child birth and child
    # parent via three ps calls. No real child/tree is manufactured for proof.
    assert module._session_composite_ownership_verified(session, 910001) is True
    assert [c[-1] for c in calls if c[0] == "ps"] == ["lstart=", "lstart=", "ppid="]
    calls.clear(); probe.allow_ps = False
    backend._verify_owned_vibe_session(session, 910001)
    assert native == [910001, 910001, 910002, 910002, 910002, 910002]
    assert calls == [("lsof", "-O", "-nP", "-t", "-a", "-iTCP:8188", "-sTCP:LISTEN")]
    assert set(vars(module)) == set(original_globals)
    assert all(vars(module)[k] is v for k, v in original_globals.items())
    assert module.subprocess is probe
    # The qualified run additionally binds the frozen predicate bodies to the
    # actual admitted selected clone; ordinary runs remain self-contained.
    import os
    if os.environ.get("ASTRID_VIBE_ADAPTER_QUALIFIED_ROOT"):
        source_path = Path(os.environ["ASTRID_VIBE_ADAPTER_QUALIFIED_ROOT"]) / "vibecomfy/runtime/session.py"
        actual = ast.parse(source_path.read_text())
        frozen = ast.parse(_SELECTED_COMPOSITE_SOURCE)
        for name in ["_session_ownership_verified", "_session_composite_ownership_verified", "_read_launch_marker",
                     "_launch_token_is_exactly_paired", "_listener_owner_pid", "_process_start_identity", "_process_parent_pid", "_process_commandline"]:
            a = next(n for n in actual.body if isinstance(n, ast.FunctionDef) and n.name == name)
            b = next(n for n in frozen.body if isinstance(n, ast.FunctionDef) and n.name == name)
            assert ast.dump(a, include_attributes=False) == ast.dump(b, include_attributes=False)


import pytest

@pytest.mark.parametrize("fault", ["pid", "daemon_birth", "child_birth", "parent", "token", "duplicate_token", "url", "listener", "marker", "native_missing", "native_error", "pid_reuse"])
def test_real_host_composite_preserves_each_original_predicate_and_native_failclosed(tmp_path, monkeypatch, fault):
    import json
    from astrid.core.execution import custody_broker
    backend, adapter, module, session, marker, command, rows, native, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    originals = dict(vars(module)); probe.allow_ps = False
    if fault == "pid": (session / "pid").write_text("910003")
    elif fault == "daemon_birth": marker["process_start_identity"] = "other"
    elif fault == "child_birth": (session / "comfy_process_start_identity").write_text("other")
    elif fault == "parent": rows[910002]["parent_pid"] = 910004
    elif fault == "token": command[-1] = "different-private-token"
    elif fault == "duplicate_token": command.extend(["--launch-token", marker["launch_token"]])
    elif fault == "url": (session / "url").write_text("http://127.0.0.1:8189")
    elif fault == "listener": probe.listener = 910003
    elif fault == "marker": marker.pop("comfy_process_start_identity")
    elif fault == "native_missing": rows.clear()
    elif fault == "native_error":
        def fail(pid): raise OSError("controlled native unavailable")
        monkeypatch.setattr(custody_broker, "_darwin_process_records", fail)
    else:
        count = [0]
        def reused(pid):
            count[0] += 1; row = dict(rows[pid])
            if count[0] == 2: row["start_usec"] += 1
            return [row]
        monkeypatch.setattr(custody_broker, "_darwin_process_records", reused)
    (session / "launch.json").write_text(json.dumps(marker))
    with pytest.raises((ValueError, adapter.EngineAdapterError)):
        backend._verify_owned_vibe_session(session, 910001)
    assert all(vars(module)[k] is v for k, v in originals.items())
    assert not any(c[0] == "ps" for c in calls)


def test_host_composite_linux_calls_unmodified_original(tmp_path, monkeypatch):
    backend, adapter, module, session, _, _, _, native, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    monkeypatch.setattr(backend.sys, "platform", "linux")
    # Canonical /proc commandline is an OS surface; use a controlled record.
    module._process_commandline = lambda pid: ("python", "--launch-token", "controlled-private-launch-token")
    backend._verify_owned_vibe_session(session, 910001)
    assert native == [] and len([c for c in calls if c[0] == "ps"]) == 3


@pytest.mark.parametrize("fault", ["source_drift", "function_swap", "missing", "alias"])
def test_selected_host_composite_pins_fail_closed_without_shared_module_changes(tmp_path, monkeypatch, fault):
    backend, adapter, module, session, _, _, _, _, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    observer = adapter.SelectedCompositeObserver(module)
    if fault == "source_drift":
        from pathlib import Path
        Path(module.__file__).write_text(_SELECTED_COMPOSITE_SOURCE + "# changed\n")
    elif fault == "function_swap": module._session_ownership_verified = lambda *args: True
    elif fault == "missing": del module._session_composite_ownership_verified
    else:
        from pathlib import Path
        alias = tmp_path / "session-alias.py"; alias.symlink_to(module.__file__); module.__file__ = str(alias)
        with pytest.raises(adapter.EngineAdapterError): adapter.SelectedCompositeObserver(module)
        return
    with pytest.raises(adapter.EngineAdapterError): observer.verify(session, 910001)
    assert calls == [] and module.subprocess is probe


@pytest.mark.parametrize("observation", ["same", "reused", "absent_native", "unavailable", "absent_kill", "denied"])
def test_still_live_incarnation_check_uses_same_native_facts_and_keeps_absence_semantics(tmp_path, monkeypatch, observation):
    from astrid.core.execution import custody_broker
    backend, adapter, module, session, marker, _, rows, _, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    probe.allow_ps = False
    def identity(pid):
        assert pid == 910001
        if observation == "absent_kill": return None
        if observation == "denied": raise PermissionError()
        return {"pid": pid}
    monkeypatch.setattr(backend.platform, "process_identity", identity)
    if observation == "reused": rows[910001]["start_sec"] += 1
    elif observation == "absent_native": rows.clear()
    elif observation == "unavailable":
        def native(pid): raise OSError("controlled native unavailable")
        monkeypatch.setattr(custody_broker, "_darwin_process_records", native)
    if observation == "absent_kill": backend._assert_process_incarnation_gone(910001, marker["process_start_identity"])
    else:
        expected = adapter.EngineAdapterError if observation == "unavailable" else RuntimeError
        with pytest.raises(expected): backend._assert_process_incarnation_gone(910001, marker["process_start_identity"])
    assert calls == []


@pytest.mark.parametrize("outcome", ["multiple", "malformed", "error", "timeout"])
def test_real_host_listener_no_fork_option_retains_failclosed_predicate(tmp_path, monkeypatch, outcome):
    import subprocess
    backend, adapter, module, session, _, _, _, _, calls, probe = _host_composite_case(tmp_path, monkeypatch)
    original_globals = dict(vars(module))
    def run(argv, **kwargs):
        assert argv == ["lsof", "-O", "-nP", "-t", "-a", "-iTCP:8188", "-sTCP:LISTEN"]
        assert kwargs == dict(capture_output=True, text=True, check=False, timeout=2)
        calls.append(tuple(argv))
        if outcome == "timeout": raise subprocess.TimeoutExpired(argv, 2)
        return subprocess.CompletedProcess(argv, 1 if outcome == "error" else 0,
            "910002\n910003\n" if outcome == "multiple" else "bad\n" if outcome == "malformed" else "", "")
    probe.run = run
    with pytest.raises(ValueError): backend._verify_owned_vibe_session(session, 910001)
    assert len(calls) == 1
    assert all(vars(module)[k] is v for k, v in original_globals.items())
