"""Process-group ownership helpers for tests that launch real workers."""
from __future__ import annotations

import os
import signal
import subprocess
import time

from runtime_protocol import platform as runtime_platform


class ProcessGroups:
    def __init__(self) -> None:
        self.groups: dict[int, list[subprocess.Popen]] = {}
        self.cleanups = []

    def add_cleanup(self, callback) -> None:
        self.cleanups.append(callback)

    def popen(self, *args, **kwargs) -> subprocess.Popen:
        if kwargs.get("start_new_session"):
            process = runtime_platform.spawn_tree(*args, **kwargs)
            self.record(process)
        else:
            process = subprocess.Popen(*args, **kwargs)
        return process

    def record(self, process: subprocess.Popen) -> None:
        if process.poll() is not None:
            return
        if os.name == "nt":
            self.groups.setdefault(process.pid, []).append(process)
            return
        try:
            pgid = os.getpgid(process.pid)
        except ProcessLookupError:
            return
        # A process in pytest's group is never safe to signal as a group.
        if pgid != os.getpgrp():
            self.groups.setdefault(pgid, []).append(process)

    def add_group(self, pgid: int) -> None:
        if os.name == "nt":
            return
        if pgid > 1 and pgid != os.getpgrp():
            self.groups.setdefault(pgid, [])

    def terminate_all(self, timeout: float = 3.0) -> None:
        cleanup_errors = []
        for callback in reversed(self.cleanups):
            try:
                callback()
            except Exception as exc:
                cleanup_errors.append(exc)
        self.cleanups.clear()
        if os.name == "nt":
            for members in reversed(tuple(self.groups.values())):
                for process in reversed(members):
                    try:
                        runtime_platform.stop_tree(process, grace=timeout)
                    except (OSError, subprocess.SubprocessError):
                        pass
            self.groups.clear()
            if cleanup_errors:
                raise cleanup_errors[0]
            return
        for pgid, members in reversed(tuple(self.groups.items())):
            if not _still_ours(pgid, members):
                continue
            try:
                _signal_group(pgid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                continue
            for process in members:
                try:
                    process.wait(timeout=timeout)
                except (subprocess.TimeoutExpired, ChildProcessError):
                    pass
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if not _group_alive(pgid):
                    break
                time.sleep(0.02)
            if _group_alive(pgid):
                try:
                    _signal_group(pgid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
        if cleanup_errors:
            raise cleanup_errors[0]


def _signal_group(pgid: int, signum) -> None:
    try:
        os.killpg(pgid, signum)
    except PermissionError:
        # --process-control=sandbox under a seccomp profile: the same member walk Runtime uses.
        if runtime_platform.process_control() != "sandbox":
            raise
        runtime_platform.signal_observed_group(pgid, signum)


def _group_alive(pgid: int) -> bool:
    return bool(_group_members(pgid))

def _group_members(pgid: int) -> list[int]:
    """Live pids in a process group, read from the process table (never by signalling the group)."""
    try:
        listing = subprocess.run(["ps", "-A", "-o", "pid=,pgid="], capture_output=True, text=True,
                                 timeout=5, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    members = []
    for line in listing.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[1] == str(pgid):
            members.append(int(fields[0]))
    return members


def _still_ours(pgid: int, members: list[subprocess.Popen]) -> bool:
    """Signal a recorded group only while it is still ours.

    An empty group has nothing to reap. A group id can be reused only by a new process
    whose pid equals it; so once our leader has exited, a live pid == pgid is a stranger.
    """
    live = _group_members(pgid)
    if not live:
        return False
    leader = next((p for p in members if p.pid == pgid), None)
    if leader is not None and leader.poll() is not None and pgid in live:
        return False
    return True

