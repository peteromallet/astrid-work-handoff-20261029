#!/usr/bin/env python3
"""Bounded reproducer for concurrent Astrid runtime acquisition.

The default fixture uses a tiny launcher instead of the operator's live support
directory.  ``--launcher pinned`` exercises the installed pinned
``astrid-runtime`` against a disposable absolute support root and the
canonical source manifest.  Both modes exercise Astrid's real
``ensure_runtime`` boundary and record only bounded lifecycle metadata.

The harness does *not* render a timeline or start a pack host.  That is
intentional: lifecycle failure must be distinguishable from worker readiness
and visualization/render failure rather than being reported as one generic
failure.  A separate explicit-client test covers the no-bootstrap path.
"""

from __future__ import annotations

from runtime_protocol import platform

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import time
from typing import Any


_LAUNCHER = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys
import time

args = sys.argv[1:]
root = Path(args[args.index("--data-root") + 1])
state = root / "fixture-state"
state.mkdir(parents=True, exist_ok=True)
owner = state / "owner.json"
starting = state / "startup.claim"
events = state / "events.jsonl"
discovery = {
    "status": "started",
    "realm_id": "fixture-realm",
    "endpoint": "http://127.0.0.1:43123",
    "actor_id": "fixture-actor",
    "runtime_instance_id": "fixture-instance",
}

if owner.exists():
    value = json.loads(owner.read_text())
    value["status"] = "reconnected"
    with events.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"code": "reconnected"}) + "\n")
    print(json.dumps(value), flush=True)
    raise SystemExit(0)

try:
    # mkdir is the portable atomic claim used only by this fixture.  The real
    # runtime uses its support mutex and owner lock for the same authority.
    starting.mkdir()
except FileExistsError:
    with events.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"code": "startup_in_progress"}) + "\n")
    print(json.dumps({
        "ok": False,
        "error": {
            "code": "startup_in_progress",
            "message": "another caller owns runtime admission",
        },
    }), flush=True)
    raise SystemExit(1)

# Keep the startup window long enough for all bounded callers to overlap.
time.sleep(0.15)
value = dict(discovery)
owner.write_text(json.dumps(value))
with events.open("a", encoding="utf-8") as stream:
    stream.write(json.dumps({"code": "started"}) + "\n")
print(json.dumps(value), flush=True)
'''


def _worker_code(data_root: Path, launcher: Path) -> str:
    return textwrap.dedent(
        f"""
        import json
        from astrid.sdk import autobootstrap
        try:
            value = autobootstrap.ensure_runtime(
                start_pack_host=False,
                data_root={str(data_root)!r},
            )
            print(json.dumps({{"ok": True, "result": dict(value)}}))
        except Exception as exc:
            print(json.dumps({{
                "ok": False,
                "error": {{
                    "type": type(exc).__name__,
                    "message": str(exc),
                    "next_action": getattr(exc, "next_action", None),
                }},
            }}))
        """
    )


def _run(
    mode: str,
    callers: int,
    launcher_mode: str = "fixture",
    source_manifest: Path | None = None,
    pinned_launcher: Path | None = None,
) -> dict[str, Any]:
    temporary_context = tempfile.TemporaryDirectory(
        prefix="astrid-runtime-reproducer-",
        dir="/private/tmp" if launcher_mode == "pinned" else None,
    )
    with temporary_context as temporary:
        root = Path(temporary)
        data_root = root / "support"
        data_root.mkdir()
        if launcher_mode == "fixture":
            launcher = root / "fixture-launcher.py"
            launcher.write_text(_LAUNCHER, encoding="utf-8")
            launcher.chmod(0o700)
        else:
            launcher = _require_pinned_launcher(pinned_launcher)
        state = data_root / "fixture-state"
        if launcher_mode == "fixture":
            state.mkdir()
        if launcher_mode == "fixture" and mode == "warm":
            (state / "owner.json").write_text(
                json.dumps(
                    {
                        "status": "started",
                        "realm_id": "fixture-realm",
                        "endpoint": "http://127.0.0.1:43123",
                        "actor_id": "fixture-actor",
                        "runtime_instance_id": "fixture-instance",
                    }
                ),
                encoding="utf-8",
            )

        environment = os.environ.copy()
        environment["ASTRID_RUNTIME_LAUNCHER"] = str(launcher)
        if launcher_mode == "pinned":
            manifest = _disposable_manifest(root, source_manifest)
            environment["ASTRID_RUNTIME_SOURCE_MANIFEST"] = str(manifest)
        environment["PYTHONPATH"] = os.pathsep.join(
            [str(Path(__file__).resolve().parents[2]), environment.get("PYTHONPATH", "")]
        ).rstrip(os.pathsep)
        command = [sys.executable, "-c", _worker_code(data_root, launcher)]
        seed_outcome: dict[str, Any] | None = None
        if launcher_mode == "pinned" and mode == "warm":
            seed_process = subprocess.run(
                command,
                cwd=str(Path(__file__).resolve().parents[2]),
                env=environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=30,
            )
            try:
                seed_outcome = json.loads(seed_process.stdout.strip().splitlines()[-1])
            except (IndexError, json.JSONDecodeError):
                seed_outcome = {
                    "ok": False,
                    "error": {
                        "type": "malformed_seed_output",
                        "message": seed_process.stdout[-500:],
                    },
                }
        processes = [
            subprocess.Popen(
                command,
                cwd=str(Path(__file__).resolve().parents[2]),
                env=environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for _ in range(callers)
        ]
        outcomes: list[dict[str, Any]] = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=10)
            try:
                value = json.loads(stdout.strip().splitlines()[-1])
            except (IndexError, json.JSONDecodeError):
                value = {
                    "ok": False,
                    "error": {
                        "type": "malformed_worker_output",
                        "message": stdout[-500:],
                    },
                }
            value["exit_code"] = process.returncode
            if stderr.strip():
                value["stderr_tail"] = stderr[-500:]
            outcomes.append(value)

        owner_metadata = {}
        discovery_path: Path | None = None
        if launcher_mode == "fixture":
            owner_path = state / "owner.json"
            if owner_path.is_file():
                owner_metadata = json.loads(owner_path.read_text(encoding="utf-8"))
        else:
            candidate = data_root / "runtime/discovery.json"
            if candidate.is_file():
                discovery_path = candidate
                owner_metadata = json.loads(candidate.read_text(encoding="utf-8"))
        event_codes = []
        events_path = state / "events.jsonl"
        if launcher_mode == "fixture" and events_path.is_file():
            for line in events_path.read_text(encoding="utf-8").splitlines()[:callers]:
                try:
                    event_codes.append(json.loads(line).get("code"))
                except json.JSONDecodeError:
                    event_codes.append("malformed_event")
        if launcher_mode == "pinned":
            event_codes.extend(
                str(outcome.get("result", {}).get("status", "error"))
                if outcome.get("ok")
                else str(outcome.get("error", {}).get("type", "error"))
                for outcome in outcomes
            )
        owner_lock_paths = sorted(
            data_root.glob("runtime/realms/*/owner.lock")
        ) if launcher_mode == "pinned" else []
        discovered_pid = owner_metadata.get("pid") if launcher_mode == "pinned" else None
        owner_pid_alive = False
        if discovered_pid:
            try:
                if platform.process_identity(int(discovered_pid)) is None:
                    raise ProcessLookupError(int(discovered_pid))
                owner_pid_alive = True
            except ProcessLookupError:
                owner_pid_alive = False
        lifecycle_failures = sum(
            1
            for outcome in outcomes
            if not outcome.get("ok")
            and outcome.get("error", {}).get("type") == "AutoBootstrapError"
        )
        successes = sum(1 for outcome in outcomes if outcome.get("ok"))
        first_result = next(
            (
                outcome.get("result", {})
                for outcome in outcomes
                if outcome.get("ok") and isinstance(outcome.get("result"), dict)
            ),
            {},
        )
        discovery_identity = {
            key: owner_metadata.get(key, first_result.get(key))
            for key in ("endpoint", "realm_id", "runtime_instance_id", "actor_id", "status")
            if owner_metadata.get(key) is not None or first_result.get(key) is not None
        }
        manifest_value = None
        if launcher_mode == "pinned":
            manifest_value = str(manifest)
        report = {
            "schema_version": 1,
            "harness": "runtime_lifecycle_reproducer",
            "mode": mode,
            "launcher_mode": launcher_mode,
            "source_manifest": manifest_value,
            "callers": callers,
            "launcher_invocations": len(event_codes) + (1 if seed_outcome is not None else 0),
            "bounded_timeout_seconds": 10,
            "owner_count": (
                len(owner_lock_paths)
                if launcher_mode == "pinned"
                else (1 if owner_metadata else 0)
            ),
            "owner_telemetry": {
                "discovery_pid": discovered_pid,
                "discovery_pid_alive_before_cleanup": owner_pid_alive,
                "owner_lock_count": len(owner_lock_paths)
                if launcher_mode == "pinned"
                else (1 if owner_metadata else 0),
                "owner_lock_paths": [
                    str(path.relative_to(data_root)) for path in owner_lock_paths
                ],
                "duplicate_owner_detected": len(owner_lock_paths) > 1,
            },
            "discovery_path": str(discovery_path) if discovery_path else None,
            "discovery": discovery_identity,
            "lifecycle_events": event_codes,
            "outcomes": outcomes,
            "classification": {
                "lifecycle": {
                    "attempted": callers,
                    "successes": successes,
                    "failures": lifecycle_failures,
                },
                "pack_worker": {
                    "attempted": 0,
                    "failures": 0,
                    "status": "not_run; start_pack_host=False",
                },
                "timeline_visualization": {
                    "attempted": 0,
                    "failures": 0,
                    "status": "not_run; lifecycle-only fixture",
                },
            },
            "explicit_client_path": {
                "status": "covered by test_explicit_client_path_does_not_bootstrap",
                "launcher_calls": 0,
            },
        }
        if seed_outcome is not None:
            report["warm_seed"] = seed_outcome
        if launcher_mode == "pinned" and owner_metadata.get("pid"):
            pid = int(owner_metadata["pid"])
            try:
                platform.signal_process(platform.process_identity(pid), platform.TERM)
                deadline = time.monotonic() + 2.0
                while time.monotonic() < deadline:
                    try:
                        if platform.process_identity(pid) is None:
                            raise ProcessLookupError(pid)
                    except ProcessLookupError:
                        break
                    time.sleep(0.05)
                else:
                    platform.signal_process(platform.process_identity(pid), platform.KILL)
            except ProcessLookupError:
                pass
            report["cleanup"] = {"pid": pid, "terminated": True}
        return report


def _terminate_pid(pid: int) -> None:
    try:
        platform.signal_process(platform.process_identity(pid), platform.TERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        try:
            if platform.process_identity(pid) is None:
                raise ProcessLookupError(pid)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    try:
        platform.signal_process(platform.process_identity(pid), platform.KILL)
    except ProcessLookupError:
        pass


def _disposable_manifest(root: Path, source_manifest: Path | None) -> Path:
    """The source profile the pinned launcher boots: the caller's, else one written for this interpreter.

    ``.astrid-data/runtime/source-profiles/astrid.json`` is a gitignored dev-stack file, absent on a fresh
    checkout or CI runner, so a default pointing there fails with "source manifest is missing".  A pinned
    install keeps the Runtime in this interpreter's site-packages, which is what its profile names.
    """
    if source_manifest is not None:
        return source_manifest
    import astrid_runtime

    repo = Path(__file__).resolve().parents[2]
    path = root / "source-profile.json"
    path.write_text(json.dumps({
        "profile": "astrid",
        "source_checkout": str(repo),
        "runtime_checkout": str(Path(astrid_runtime.__file__).resolve().parents[1]),
        "runtime_environment": str(Path(sys.prefix).resolve()),
    }), encoding="utf-8")
    return path


def _create_workspace(launcher: Path, data_root: Path, manifest: Path, environment: dict[str, str]) -> None:
    """A stopped, empty workspace in the disposable support root, so ``ensure_runtime`` has something to start.
    """
    subprocess.run(
        [str(launcher), "workspace", "create", "--profile", "astrid", "--data-root", str(data_root),
         "--realm-root", str(data_root / "runtime" / "realms" / "recovery-realm"), "--realm-id", "recovery-realm",
         "--source-manifest", str(manifest), "--json"],
        env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True, timeout=60,
    )


def _require_pinned_launcher(launcher: Path | None) -> Path:
    """The caller resolves the installed pinned astrid-runtime and passes it in; the harness never guesses a path."""
    if launcher is None or not launcher.is_file():
        raise RuntimeError(f"pinned launcher not found: {launcher}")
    return launcher


def _run_worker(command: list[str], environment: dict[str, str], repo: Path, label: str, data_root: Path) -> dict[str, Any]:
    """One ensure_runtime worker's JSON outcome; a hang or malformed output is reported, with the stderr tail."""
    try:
        done = subprocess.run(
            command, cwd=str(repo), env=environment, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, check=False, timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        def tail(value: Any) -> str:
            return (value.decode("utf-8", "replace") if isinstance(value, bytes) else value or "")[-1500:]
        log = data_root / "runtime" / "runtime.log"
        return {"ok": False, "error": {"type": f"{label}_worker_timeout", "message": tail(exc.stdout), "stderr": tail(exc.stderr),
                                       "runtime_log": tail(log.read_text(errors="replace")) if log.is_file() else None}}
    try:
        return json.loads(done.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        return {"ok": False, "error": {"type": f"malformed_{label}_output", "message": done.stdout[-500:], "stderr": done.stderr[-1500:]}}


def _run_recovery_case(case: str, source_manifest: Path | None = None, pinned_launcher: Path | None = None) -> dict[str, Any]:
    """Exercise pinned launcher repair against a disposable support root."""
    if case not in {"stale", "interrupted"}:
        raise ValueError(f"unsupported recovery case: {case}")
    launcher = _require_pinned_launcher(pinned_launcher)
    repo = Path(__file__).resolve().parents[2]
    temporary_context = tempfile.TemporaryDirectory(prefix="astrid-runtime-recovery-", dir="/private/tmp")
    with temporary_context as temporary:
        root = Path(temporary)
        manifest = _disposable_manifest(root, source_manifest)
        data_root = root / "support"
        data_root.mkdir()
        environment = os.environ.copy()
        environment["ASTRID_RUNTIME_LAUNCHER"] = str(launcher)
        environment["ASTRID_RUNTIME_SOURCE_MANIFEST"] = str(manifest)
        # The door's default loopback port belongs to a developer's own Runtime; take an ephemeral one.
        environment["ASTRID_RUNTIME_DOOR_PORT"] = "0"
        environment["PYTHONPATH"] = os.pathsep.join(
            [str(repo), environment.get("PYTHONPATH", "")]
        ).rstrip(os.pathsep)
        _create_workspace(launcher, data_root, manifest, environment)
        command = [sys.executable, "-c", _worker_code(data_root, launcher)]
        first_outcome = _run_worker(command, environment, repo, "initial", data_root)
        discovery_path = data_root / "runtime" / "discovery.json"
        initial_discovery = json.loads(discovery_path.read_text(encoding="utf-8")) if discovery_path.is_file() else {}
        initial_pid = int(initial_discovery.get("pid") or 0)
        if initial_pid:
            _terminate_pid(initial_pid)
        # Preserve only the disposable runtime's own stale/partial state. A
        # dead PID plus the old advertisement is exactly what a killed CLI can
        # leave before the launcher gets its cleanup turn.
        stale = dict(initial_discovery)
        stale["pid"] = 999999
        stale["process_birth_id"] = "interrupted-before-admission"
        discovery_path.parent.mkdir(parents=True, exist_ok=True)
        discovery_path.write_text(json.dumps(stale), encoding="utf-8")
        prepared_discovery_present = discovery_path.is_file()
        lock_path = data_root / "runtime" / "instance.lock"
        if case == "interrupted":
            lock_path.write_text(json.dumps({
                "pid": 999999,
                "process_birth_id": "interrupted-before-admission",
                "runtime_instance_id": stale.get("runtime_instance_id", "partial"),
                "realm_id": stale.get("active_realm", ""),
            }), encoding="utf-8")
        recovered_outcome = _run_worker(command, environment, repo, "recovery", data_root)
        final_discovery = json.loads(discovery_path.read_text(encoding="utf-8")) if discovery_path.is_file() else {}
        final_pid = int(final_discovery.get("pid") or 0)
        lock_paths = sorted(data_root.glob("runtime/realms/*/owner.lock"))
        final_alive = False
        if final_pid:
            try:
                if platform.process_identity(final_pid) is None:
                    raise ProcessLookupError(final_pid)
                final_alive = True
            except ProcessLookupError:
                final_alive = False
        if final_pid:
            _terminate_pid(final_pid)
        version = subprocess.run(
            [str(launcher), "--version"], cwd=str(repo), env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            check=False, timeout=10,
        )
        return {
            "schema_version": 1,
            "harness": "runtime_lifecycle_recovery",
            "case": case,
            "launcher": str(launcher),
            "launcher_version": version.stdout.strip(),
            "source_manifest": str(manifest),
            "data_root": str(data_root),
            "initial": first_outcome,
            "prepared_state": {
                "discovery_present": prepared_discovery_present,
                "dead_pid": 999999,
                "partial_instance_lock": case == "interrupted",
            },
            "recovery": recovered_outcome,
            "owner_telemetry": {
                "owner_lock_count": len(lock_paths),
                "owner_lock_paths": [str(path.relative_to(data_root)) for path in lock_paths],
                "discovery_pid": final_pid,
                "discovery_pid_alive_before_cleanup": final_alive,
                "duplicate_owner_detected": len(lock_paths) > 1,
            },
            "cleanup": {"initial_pid": initial_pid, "recovered_pid": final_pid},
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("cold", "warm"), default="cold")
    parser.add_argument("--callers", type=int, default=3)
    parser.add_argument("--launcher", choices=("fixture", "pinned"), default="fixture")
    parser.add_argument("--recovery-case", choices=("stale", "interrupted"))
    parser.add_argument("--source-manifest", type=Path)
    parser.add_argument(
        "--pinned-launcher",
        type=Path,
        help="path to the installed astrid-runtime; required for --launcher pinned and --recovery-case",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 2 <= args.callers <= 10:
        parser.error("--callers must be between 2 and 10")
    if (args.recovery_case or args.launcher == "pinned") and args.pinned_launcher is None:
        parser.error("--pinned-launcher is required for --launcher pinned and --recovery-case")
    report = (
        _run_recovery_case(args.recovery_case, args.source_manifest, args.pinned_launcher)
        if args.recovery_case
        else _run(args.mode, args.callers, args.launcher, args.source_manifest, args.pinned_launcher)
    )
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
