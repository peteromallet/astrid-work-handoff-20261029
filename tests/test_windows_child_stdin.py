"""Bounded native probe for children inheriting a parent's blocked stdin read."""

import json
import queue
import subprocess
import sys
import threading
import textwrap

import pytest


_HARNESS = textwrap.dedent(
    r"""
    import ctypes
    import json
    import os
    import subprocess
    import sys
    import threading
    import time

    mode = sys.argv[1]
    reading = threading.Event()

    def block_on_stdin():
        reading.set()
        sys.stdin.buffer.read(1)

    reader = threading.Thread(target=block_on_stdin, daemon=True)
    reader.start()
    if not reading.wait(1.0):
        raise RuntimeError("stdin reader did not start")

    if os.name == "nt":
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenThread.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel32.OpenThread.restype = ctypes.c_void_p
        kernel32.GetThreadIOPendingFlag.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
        kernel32.GetThreadIOPendingFlag.restype = ctypes.c_int
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_int
        thread_handle = kernel32.OpenThread(0x0040, False, reader.native_id)
        if not thread_handle:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            pending = ctypes.c_int()
            deadline = time.monotonic() + 5.0
            while time.monotonic() < deadline:
                if not kernel32.GetThreadIOPendingFlag(thread_handle, ctypes.byref(pending)):
                    raise ctypes.WinError(ctypes.get_last_error())
                if pending.value:
                    break
                time.sleep(0.01)
            else:
                raise RuntimeError("stdin ReadFile did not become pending")
        finally:
            kernel32.CloseHandle(thread_handle)

    child = None
    result = {"mode": mode}
    try:
        kwargs = {} if mode == "inherit" else {"stdin": subprocess.DEVNULL}
        child = subprocess.Popen(
            [sys.executable, "-c", "print('child-ready', flush=True)"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            **kwargs,
        )
        try:
            child.wait(timeout=10.0)
            stdout, stderr = child.communicate(timeout=2.0)
            result.update(
                child_completed=True,
                child_returncode=child.returncode,
                child_stdout=stdout,
                child_stderr=stderr,
            )
        except subprocess.TimeoutExpired:
            result["child_completed"] = False
            child.terminate()
            try:
                child.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=2.0)
            child.communicate(timeout=2.0)
    finally:
        if child is not None and child.poll() is None:
            child.kill()
            child.wait(timeout=2.0)
            child.communicate(timeout=2.0)
        print(json.dumps(result), flush=True)
        # The outer process closes the pipe after reading this result. That
        # releases read(1), allowing an orderly thread join before exit.
        reader.join(timeout=2.0)
        if reader.is_alive():
            raise RuntimeError("stdin reader did not unblock after pipe close")
    """
)


def _run_probe(mode: str) -> dict[str, object]:
    harness = subprocess.Popen(
        [sys.executable, "-c", _HARNESS, mode],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    lines: queue.Queue[str] = queue.Queue()

    def read_result() -> None:
        assert harness.stdout is not None
        lines.put(harness.stdout.readline())

    output_reader = threading.Thread(target=read_result, daemon=True)
    output_reader.start()
    try:
        try:
            line = lines.get(timeout=25.0)
        except queue.Empty:
            raise AssertionError("stdin probe did not report within 25 seconds")
        assert line, "stdin probe exited without a result"
        assert harness.stdin is not None
        harness.stdin.close()
        harness.stdin = None
        stdout, stderr = harness.communicate(timeout=5.0)
        output_reader.join(timeout=1.0)
        assert not output_reader.is_alive(), "probe output reader did not finish"
        assert harness.returncode == 0, stderr
        return json.loads(line)
    finally:
        if harness.stdin is not None:
            harness.stdin.close()
            harness.stdin = None
        if harness.poll() is None:
            harness.terminate()
            try:
                harness.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                harness.kill()
                harness.wait(timeout=2.0)
        output_reader.join(timeout=2.0)
        if harness.stdout is not None:
            harness.stdout.close()
        if harness.stderr is not None:
            harness.stderr.close()


def test_probe_helper_completes_and_cleans_up() -> None:
    for _ in range(2):
        controlled = _run_probe("devnull")
        assert controlled["child_completed"]
        assert controlled["child_returncode"] == 0
        assert controlled["child_stdout"].splitlines() == ["child-ready"]


@pytest.mark.windows_native
def test_child_stdin_inheritance_probe() -> None:
    inherited = _run_probe("inherit")
    if inherited["child_completed"]:
        assert inherited["child_returncode"] == 0, inherited["child_stderr"]
        assert inherited["child_stdout"].splitlines() == ["child-ready"]
        print(
            "Windows runner did not reproduce the inherited-stdin stall; "
            "DEVNULL control remains required.",
            flush=True,
        )
    else:
        print("Windows runner reproduced inherited-stdin startup stall.", flush=True)

    controlled = _run_probe("devnull")
    assert controlled["child_completed"], "child with stdin=DEVNULL must complete"
    assert controlled["child_returncode"] == 0, controlled["child_stderr"]
    assert controlled["child_stdout"].splitlines() == ["child-ready"]
