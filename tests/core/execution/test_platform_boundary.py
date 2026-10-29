from __future__ import annotations

import ast
from pathlib import Path

import pytest


def _violations(source: str) -> list[str]:
    tree = ast.parse(source)
    aliases = {}
    violations = []
    banned_os = {"kill", "killpg", "setsid", "getuid", "geteuid", "getpgid", "getsid", "getpgrp", "setpgid",
                 "pidfd_open"}
    portable_signals = {"SIGINT", "SIGTERM", "SIGABRT", "SIGFPE", "SIGILL", "SIGSEGV",
                        "SIG_DFL", "SIG_IGN"}
    banned_names = {f"{module}.{item}" for module in ("os", "runtime_protocol.dirfd.filesystem")
                    for item in banned_os}
    banned_names.add("signal.pidfd_send_signal")
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for item in node.names:
                aliases[item.asname or item.name] = item.name
                if item.name == "fcntl":
                    violations.append(f"{node.lineno}: import fcntl")
        elif isinstance(node, ast.ImportFrom):
            for item in node.names:
                aliases[item.asname or item.name] = f"{node.module}.{item.name}"
                if node.module == "fcntl":
                    violations.append(f"{node.lineno}: import fcntl")

    def qualified(node):
        if isinstance(node, ast.Name):
            return aliases.get(node.id, node.id)
        if isinstance(node, ast.Attribute):
            return qualified(node.value) + "." + node.attr
        return ""

    for node in ast.walk(tree):
        if isinstance(node, (ast.Name, ast.Attribute)):
            name = qualified(node)
            if (name in banned_names
                    or name.startswith("fcntl.")
                    or (name.startswith("signal.SIG") and name[7:] not in portable_signals)):
                violations.append(f"{node.lineno}: {name}")
        if (isinstance(node, ast.Call) and qualified(node.func) in {"getattr", "hasattr"}
                and len(node.args) >= 2 and isinstance(node.args[1], ast.Constant)
                and f"{qualified(node.args[0])}.{node.args[1].value}" in banned_names):
            violations.append(f"{node.lineno}: raw process capability lookup")
        if isinstance(node, ast.Call) and qualified(node.func) in {
            "subprocess.Popen", "subprocess.run", "subprocess.call", "subprocess.check_call",
            "subprocess.check_output",
        }:
            controls = {"start_new_session", "preexec_fn", "process_group"}
            if any(keyword.arg in controls
                   or (keyword.arg is None and isinstance(keyword.value, ast.Dict)
                       and any(isinstance(key, ast.Constant) and key.value in controls
                               for key in keyword.value.keys))
                   for keyword in node.keywords):
                violations.append(f"{node.lineno}: raw subprocess process control")
    return violations


def test_agent_native_process_and_lock_boundary():
    root = Path(__file__).resolve().parents[3]
    violations = {str(path.relative_to(root)): found
                  for directory in ("astrid", "scripts")
                  for path in (root / directory).rglob("*.py")
                  if (found := _violations(path.read_text(encoding="utf-8")))}
    assert not violations, violations


@pytest.mark.parametrize("source", [
    "import fcntl as locks; locks.flock(3, 2)",
    "from fcntl import flock as lock; lock(3, 2)",
    "import os as native; native.killpg(42, 9)",
    "from os import getuid as user; user()",
    "import os; os.setsid()",
    "import signal as native; native.SIGKILL",
    "from signal import SIGUSR1 as dump; dump",
    "import subprocess as sp; sp.Popen(['cmd'], start_new_session=True)",
    "import subprocess as sp; sp.Popen(['cmd'], **{'start_new_session': True})",
    "from runtime_protocol.dirfd import filesystem as os; os.getuid()",
    "import os as native; native.pidfd_open(42)",
    "from os import pidfd_open as pin; pin(42)",
    "from runtime_protocol.dirfd import filesystem as native; native.pidfd_open(42)",
    "import signal as native; native.pidfd_send_signal(3, 15)",
    "from signal import pidfd_send_signal as send; send(3, 15)",
    "import os as native; hasattr(native, 'pidfd_open')",
    "import signal as native; getattr(native, 'pidfd_send_signal', None)",
])
def test_boundary_detects_aliases_and_nonportable_operations(source):
    assert _violations(source)


def test_boundary_accepts_runtime_primitives():
    assert not _violations(
        "from runtime_protocol import platform; "
        "platform.lock_file(3); platform.spawn_tree(['cmd']); "
        "platform.signal_tree(child, platform.KILL); platform.current_user(); "
        "platform.pidfd_open(42); platform.pidfd_send_signal(3, 15)"
    )
