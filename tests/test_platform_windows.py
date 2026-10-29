from __future__ import annotations

import os
import ctypes
import struct
import subprocess
import sys
from types import SimpleNamespace

import pytest

from tests.lanes import requires_posix_owner_only_permissions, requires_windows_process_and_lock_apis

from runtime_protocol import platform
from runtime_protocol.dirfd import filesystem


WINDOWS_ONLY = requires_windows_process_and_lock_apis


def test_windows_directory_mutex_uses_global_user_scoped_identity(monkeypatch):
    """All sessions for one user must contend on the same directory mutex."""
    names = []

    def create_mutex(_security, _owned, name):
        names.append(name)
        return 123

    def wait(_handle, _timeout):
        return 0

    def close(_handle):
        return True

    monkeypatch.setattr(platform, "_kernel", lambda: SimpleNamespace(
        CreateMutexW=create_mutex, WaitForSingleObject=wait, CloseHandle=close,
    ))
    monkeypatch.setattr(platform, "_directory_mutex_gates", {})
    for user, volume, inode in [(7, 11, 13), (7, 11, 13), (8, 11, 13), (7, 12, 13), (7, 11, 14)]:
        monkeypatch.setattr(platform, "current_user", lambda: user)
        _handle, gate, _thread = platform._lock_windows_directory(
            -1, SimpleNamespace(st_dev=volume, st_ino=inode), blocking=False,
        )
        gate.release()

    assert all(name.startswith("Global\\AstridRuntime.directory.") for name in names)
    assert names[0] == names[1]
    assert len(set(names)) == 4


@WINDOWS_ONLY
def test_windows_overlapped_has_native_pointer_size_layout():
    overlap = platform._windows_overlapped()
    assert overlap.Offset == overlap.OffsetHigh == 0
    assert ctypes.sizeof(overlap) == (32 if struct.calcsize("P") == 8 else 20)


@WINDOWS_ONLY
def test_windows_lockfileex_exclusive_and_unlock(tmp_path):
    lock_path = tmp_path / "lock"
    first = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    second = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        platform.lock_file(first)
        with pytest.raises(BlockingIOError):
            platform.lock_file(second, blocking=False)
        platform.unlock_file(first)
        platform.lock_file(second, blocking=False)
        platform.unlock_file(second)
    finally:
        os.close(first)
        os.close(second)


@WINDOWS_ONLY
def test_windows_directory_mutex_lock_contends_and_releases(tmp_path):
    flags = os.O_RDONLY | filesystem.O_DIRECTORY | filesystem.O_NOFOLLOW
    first = filesystem.open(tmp_path, flags)
    second = filesystem.open(tmp_path, flags)
    try:
        platform.lock_file(first, blocking=False)
        with pytest.raises(BlockingIOError):
            platform.lock_file(second, blocking=False)
        platform.unlock_file(first)
        platform.lock_file(second, blocking=False)
        platform.unlock_file(second)
    finally:
        os.close(first)
        os.close(second)


@WINDOWS_ONLY
def test_windows_directory_mutex_recovers_after_owner_process_exits(tmp_path):
    code = (
        "import os,sys; from runtime_protocol import platform; "
        "from runtime_protocol.dirfd import filesystem; "
        "fd=filesystem.open(sys.argv[1], os.O_RDONLY | filesystem.O_DIRECTORY | filesystem.O_NOFOLLOW); "
        "platform.lock_file(fd); os._exit(0)"
    )
    child = subprocess.run([sys.executable, "-c", code, str(tmp_path)], timeout=10)
    assert child.returncode == 0

    fd = filesystem.open(tmp_path, os.O_RDONLY | filesystem.O_DIRECTORY | filesystem.O_NOFOLLOW)
    try:
        # The abandoned mutex is immediately available, including nonblocking.
        platform.lock_file(fd, blocking=False)
        platform.unlock_file(fd)
    finally:
        os.close(fd)


@WINDOWS_ONLY
def test_windows_process_identity_uses_creation_time_and_bounded_sid():
    identity = platform.process_identity(os.getpid())
    assert identity["pid"] == os.getpid()
    assert identity["uid"] == platform.current_user()
    assert 0 <= identity["uid"] < (1 << 63)
    assert identity["birth_id"].startswith("windows-creation:")
    assert platform.process_executable(os.getpid())


@WINDOWS_ONLY
def test_windows_process_identity_proves_exited_retained_child_absent():
    child = platform.spawn_tree(
        [sys.executable, "-c", "pass"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        pid = child.pid
        assert child.wait(timeout=10) == 0
        assert platform.process_identity(pid) is None
    finally:
        job = getattr(child, "_runtime_job", None)
        if job is not None:
            job.close()


@WINDOWS_ONLY
def test_windows_spawn_assigns_job_before_resuming_child():
    child = platform.spawn_tree(
        [sys.executable, "-c", "pass"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        assert getattr(child, "_runtime_job", None) is not None
        assert child.wait(timeout=10) == 0
    finally:
        job = getattr(child, "_runtime_job", None)
        if job is not None:
            job.close()


@WINDOWS_ONLY
def test_windows_detached_child_inherits_job_handle(monkeypatch):
    script = (
        "import ctypes,sys; k=ctypes.WinDLL('kernel32'); "
        "k.GetHandleInformation.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]; "
        "k.GetHandleInformation.restype=ctypes.c_int; h=int(sys.argv[1]); "
        "info=ctypes.c_ulong(); assert k.GetHandleInformation(h,ctypes.byref(info))"
    )
    real_popen = subprocess.Popen
    seen = {}

    def popen(argv, **kwargs):
        handle = kwargs["startupinfo"].lpAttributeList["handle_list"][0]
        seen["handle"] = handle
        argv = list(argv)
        argv[-1] = str(int(handle))
        return real_popen(argv, **kwargs)

    monkeypatch.setattr(platform.subprocess, "Popen", popen)
    child = platform.spawn_tree(
        [sys.executable, "-c", script, "unused"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        detached=True,
    )
    try:
        assert getattr(child, "_runtime_job", None) is not None
    finally:
        try:
            assert child.wait(timeout=10) == 0
            assert seen["handle"]
        finally:
            child._runtime_job.close()


@requires_posix_owner_only_permissions
def test_owner_only_rejects_symlink_before_chmod(tmp_path):
    target = tmp_path / "target"
    target.write_text("data")
    alias = tmp_path / "alias"
    alias.symlink_to(target)
    with pytest.raises(OSError):
        platform.owner_only(alias)
    assert platform.is_owner_only(alias) is False


@WINDOWS_ONLY
def test_windows_detached_owner_clears_job_handle_inheritance():
    code = ("import os; from runtime_protocol import platform; "
            "assert platform._inherited_job_handle; "
            "assert not os.get_handle_inheritable(platform._inherited_job_handle)")
    child = platform.spawn_tree([sys.executable, "-c", code], detached=True)
    try:
        assert child.wait(timeout=10) == 0
    finally:
        child._runtime_job.close()
