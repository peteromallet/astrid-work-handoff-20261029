"""Process hand-offs keep arguments, interrupts, and exit status intact."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from pathlib import Path

import pytest

from astrid.core.util import process as _process


@pytest.mark.parametrize("env", [None, {}, {"PATH": "/selected/bin", "MANAGED": "yes"}])
def test_posix_replaces_process_with_exact_argv_and_environment(monkeypatch, env):
    argv = ["/selected program/bin/tool", "two words", 'say "hello"', ""]
    captured = {}

    class Replaced(Exception):
        pass

    def execvpe(file, args, environment):
        captured.update(file=file, argv=args, env=environment)
        raise Replaced

    monkeypatch.setattr(_process.sys, "platform", "linux")
    monkeypatch.setattr(_process.os, "execvpe", execvpe)
    monkeypatch.setattr(_process.subprocess, "run", lambda *_a, **_kw: pytest.fail("POSIX must exec"))
    handler = signal.getsignal(signal.SIGINT)
    with pytest.raises(Replaced):
        _process.replace_process(argv, env)
    assert captured["file"] == argv[0]
    assert captured["argv"] is argv
    assert captured["env"] is (os.environ if env is None else env)
    assert signal.getsignal(signal.SIGINT) is handler


@pytest.mark.parametrize("returncode,exitcode", [
    (0, 0), (37, 37), (130, 130), (0x7FFFFFFF, 0x7FFFFFFF),
    (0x80000000, -2147483648), (0xC000013A, -1073741510), (0xFFFFFFFF, -1),
])
@pytest.mark.parametrize("env", [None, {"MANAGED": "yes"}])
@pytest.mark.parametrize("program", [r"C:\Program Files\Astrid\tool.exe", r"C:\Program Files\Astrid\tool.cmd"])
def test_windows_waits_with_exact_argv_and_leaves_interrupt_to_child(monkeypatch, returncode, exitcode, env, program):
    argv = [program, "two words", 'say "hello"', ""]
    captured = {}
    previous_handler = signal.getsignal(signal.SIGINT)

    def run(args, **kwargs):
        captured.update(argv=args, kwargs=kwargs)
        handler = signal.getsignal(signal.SIGINT)
        assert callable(handler) and handler is not previous_handler
        # An interrupt in the waiting parent must not raise KeyboardInterrupt.
        signal.raise_signal(signal.SIGINT)
        return subprocess.CompletedProcess(args, returncode)

    monkeypatch.setattr(_process.sys, "platform", "win32")
    for name in ("execvpe", "execvp", "execve"):
        monkeypatch.setattr(_process.os, name, lambda *_a: pytest.fail("Windows must wait for its child"))
    monkeypatch.setattr(_process.subprocess, "run", run)
    with pytest.raises(SystemExit) as exc:
        _process.replace_process(argv, env)
    assert exc.value.code == exitcode
    assert captured == {"argv": argv, "kwargs": {"env": env, "check": False}}
    assert captured["argv"] is argv
    assert signal.getsignal(signal.SIGINT) is previous_handler


@pytest.mark.parametrize("returncode", [0x80000000, 0xC000013A, 0xFFFFFFFF])
def test_windows_branch_preserves_child_status_through_wrapper_process_exit(returncode):
    bootstrap = (
        "import runpy, subprocess, sys; "
        "namespace = runpy.run_path(sys.argv[1]); sys.platform = 'win32'; "
        "subprocess.run = lambda argv, **kwargs: subprocess.CompletedProcess(argv, int(sys.argv[2])); "
        "namespace['replace_process'](['selected-child.exe'])"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-c", bootstrap, str(Path(_process.__file__)), str(returncode)],
        check=False, capture_output=True, text=True, timeout=30,
    )
    expected = returncode if sys.platform == "win32" else returncode & 0xFF
    assert result.returncode == expected, result.stderr


def test_windows_restores_interrupt_handler_when_child_cannot_start(monkeypatch):
    def previous_handler(_signum, _frame):
        pytest.fail("the caller's handler must be suspended while starting the child")

    monkeypatch.setattr(_process.sys, "platform", "win32")
    original_handler = signal.signal(signal.SIGINT, previous_handler)

    def run(*_args, **_kwargs):
        signal.raise_signal(signal.SIGINT)
        raise FileNotFoundError("missing child")

    monkeypatch.setattr(_process.subprocess, "run", run)
    try:
        with pytest.raises(FileNotFoundError, match="missing child"):
            _process.replace_process(["missing"])
        assert signal.getsignal(signal.SIGINT) is previous_handler
    finally:
        signal.signal(signal.SIGINT, original_handler)


def test_windows_branch_real_child_receives_argv_and_exit_code(monkeypatch, tmp_path):
    result_file = tmp_path / "child result.json"
    arguments = ["two words", 'say "hello"', "", "backslash\\", "snowman ☃", "a&b|c"]
    script = (
        "import json, os, pathlib, sys; "
        "pathlib.Path(sys.argv[1]).write_text(json.dumps([sys.argv[2:], os.environ['MANAGED']]), encoding='utf-8'); "
        "sys.exit(37)"
    )
    monkeypatch.setattr(_process.sys, "platform", "win32")
    with pytest.raises(SystemExit) as exc:
        _process.replace_process([sys.executable, "-c", script, str(result_file), *arguments],
                                 {**os.environ, "MANAGED": "selected environment"})
    assert exc.value.code == 37
    assert json.loads(result_file.read_text(encoding="utf-8")) == [arguments, "selected environment"]


def test_windows_branch_real_child_handles_its_own_interrupt(monkeypatch):
    real_run = subprocess.run

    def run(argv, **kwargs):
        signal.raise_signal(signal.SIGINT)
        return real_run(argv, **kwargs)

    script = (
        "import signal, sys\n"
        "try:\n"
        "    signal.raise_signal(signal.SIGINT)\n"
        "except KeyboardInterrupt:\n"
        "    sys.exit(29)\n"
        "sys.exit(1)\n"
    )
    previous_handler = signal.getsignal(signal.SIGINT)
    monkeypatch.setattr(_process.sys, "platform", "win32")
    monkeypatch.setattr(_process.subprocess, "run", run)
    with pytest.raises(SystemExit) as exc:
        _process.replace_process([sys.executable, "-c", script])
    assert exc.value.code == 29
    assert signal.getsignal(signal.SIGINT) is previous_handler
