"""The Runtime-owned process-control setting: ``strict`` (default) or ``sandbox``.

Stored as ``process-control.json`` in Runtime support (``<data-root>/runtime``,
next to ``catalog.json``). The installer writes it once, through
``astrid_runtime workspace create|attach --process-control``. Every process
that signals reads it at startup, before it spawns anything, so all start
paths agree without an environment variable or a flag.

``strict`` keeps the identity-safe rules exactly as they are: pidfds on
Linux, and never a bare PID. ``sandbox`` is for seccomp sandboxes such as
NVIDIA OpenShell, which deny ``pidfd_open`` (ENOSYS) and negative-PID ``kill``.
There, Runtime signals by PID only after re-checking the process's start
time, and walks a process group member by member (see ``platform``).
"""

from __future__ import annotations

import json
import os
import stat
import sys
import threading
from pathlib import Path

from . import platform
from .errors import ConflictError
from .util import atomic_json_write

FILE_NAME = "process-control.json"
MODES = platform.PROCESS_CONTROL_MODES


def setting_path(support_root: Path | str) -> Path:
    return Path(support_root) / FILE_NAME


def read_setting(support_root: Path | str) -> str:
    """The configured mode; ``strict`` when no setting was ever written.

    A present but invalid, non-regular or symlinked file refuses startup
    instead of guessing: silently treating it as either mode would hide a
    broken or tampered install.
    """
    path = setting_path(support_root)
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return "strict"
    if not stat.S_ISREG(info.st_mode):
        raise ConflictError(f"{FILE_NAME} is not a regular file; refuse startup")
    try:
        value = json.loads(platform.read_private_file(path).decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConflictError(f"{FILE_NAME} is invalid; refuse startup") from exc
    if (not isinstance(value, dict) or value.get("format_version") != 1
            or value.get("process_control") not in MODES or set(value) != {"format_version", "process_control"}):
        raise ConflictError(f"{FILE_NAME} is invalid; refuse startup")
    return value["process_control"]


def write_setting(support_root: Path | str, mode: str) -> None:
    if mode not in MODES:
        raise ValueError(f"process control must be one of {', '.join(MODES)}")
    atomic_json_write(setting_path(support_root), {"format_version": 1, "process_control": mode})


_announced = threading.Event()


def announce(probe: dict) -> None:
    """Log the probe once per process, when sandbox mode is on or signalling is unsafe."""
    if probe.get("process_control") != "sandbox" and probe.get("ok", True):
        return
    if _announced.is_set():
        return
    _announced.set()
    print("Runtime process signalling: " + json.dumps(probe, sort_keys=True), file=sys.stderr, flush=True)


def configure_from(support_root: Path | str) -> str:
    """Read the setting and fix this process's signalling policy to it."""
    mode = read_setting(support_root)
    platform.configure_process_control(mode)
    return mode
