"""Test writer tree with backend and browser session escapes."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def main() -> int | None:
    if len(sys.argv) >= 2 and sys.argv[1] == "detached-worker":
        pid_path = Path(sys.argv[2])
        ready_path = Path(sys.argv[3])
        last_write_path = Path(sys.argv[4])
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        pid_path.write_text(str(os.getpid()))
        last_write_path.write_text(str(time.monotonic_ns()))
        ready_path.write_text("ready")
        while True:
            last_write_path.write_text(str(time.monotonic_ns()))
            time.sleep(0.01)

    role, output_raw, registry_raw = sys.argv[1:4]
    output = Path(output_raw)
    registry = Path(registry_raw)
    registry.mkdir(parents=True, exist_ok=True)

    if role == "detached-success":
        # This is a protocol-success renderer whose direct leader exits while
        # a new-session worker continues writing. The test observes the worker
        # through retained custody before releasing the leader to exit.
        request_path = Path(sys.argv[sys.argv.index("--request") + 1])
        result_path = Path(sys.argv[sys.argv.index("--result") + 1])
        request = json.loads(request_path.read_text(encoding="utf-8"))
        pid_path = registry / "detached-worker.pid"
        ready_path = registry / "detached-worker.ready"
        last_write_path = registry / "detached-worker.last-write"
        subprocess.Popen(
            [sys.executable, __file__, "detached-worker", pid_path, ready_path, last_write_path],
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 10
        while not Path(request["leader_release_gate"]).exists() and time.monotonic() < deadline:
            time.sleep(0.005)
        if not Path(request["leader_release_gate"]).exists():
            return 92
        result_path.write_text(json.dumps(request["payload"]), encoding="utf-8")
        return 0

    (registry / f"{role}.pid").write_text(str(os.getpid()))
    if role == "worker":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        expected_roles = ("backend", "node", "browser", "worker")
        while not all((registry / f"{name}.pid").is_file() for name in expected_roles):
            time.sleep(0.01)
        (output / "writer.txt").write_text("owned fixture writer")
        (registry / "last-write.txt").write_text(str(time.monotonic_ns()))
        ready = registry / "ready.tmp"
        ready.write_text("ready")
        ready.replace(registry / "ready.txt")
        while True:
            (output / "writer.txt").write_text("owned fixture writer")
            (registry / "last-write.txt").write_text(str(time.monotonic_ns()))
            time.sleep(0.01)
        return

    # Child readiness also proves each ancestor installed its cleanup handler.
    signal.signal(signal.SIGTERM, lambda *_: None)
    child_role = {"pack": "backend", "backend": "node", "node": "browser", "browser": "worker"}[role]
    child = subprocess.Popen(
        [sys.executable, __file__, child_role, str(output), str(registry)],
        start_new_session=child_role in {"backend", "browser"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Keep each ancestor available until its owned child exits.
    try:
        while child.poll() is None:
            time.sleep(0.01)
    finally:
        if child.poll() is None:
            child.kill()
        child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
