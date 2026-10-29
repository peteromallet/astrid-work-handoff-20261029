"""Replacement keeps admission custody while Windows child handles are closed."""
from __future__ import annotations

import threading
from types import SimpleNamespace

import pytest

import runtime_protocol.daemon as daemon_module
from runtime_protocol import platform
from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.errors import OwnerBusyError, RealmAdmissionError
from runtime_protocol.store import RealmStore, realm_admission_fence
from runtime_protocol.upgrade import _owner_fence


@pytest.mark.parametrize("windows_publication", [False, True], ids=["native", "windows-publication"])
@pytest.mark.parametrize("offline", [False, True], ids=["online", "offline"])
@pytest.mark.parametrize("fail_start", [False, True], ids=["success", "rollback"])
def test_replacement_fences_candidate_through_startup_and_rollback(
    tmp_path, monkeypatch, windows_publication, offline, fail_start
):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    daemon = RuntimeDaemon(root, support_root=tmp_path / "support").start()
    backup = tmp_path / "backup"
    candidate = tmp_path / "candidate"
    daemon.service.backup(backup)
    owned_handles = [daemon.service.store._lock_file]
    if offline:
        daemon.stop()
    else:
        daemon.service.restore(backup, candidate)
    if windows_publication:
        monkeypatch.setattr(daemon_module, "sys", SimpleNamespace(platform="win32"))

    original_custody = daemon._acquire_offline_custody
    original_rename = daemon_module.os.rename
    original_admission = RealmStore._acquire_admission_lock
    original_start = daemon._start
    attempting = threading.Event()
    finished = threading.Event()
    outcomes = []
    contenders = []
    failed = False

    def custody(path=None):
        handle = original_custody(path)
        owned_handles.append(handle)
        return handle

    def announce_admission(store):
        attempting.set()
        return original_admission(store)

    def open_competitor():
        try:
            with RealmStore(root):
                outcomes.append("acquired")
        except Exception as exc:
            outcomes.append(type(exc))
        finally:
            finished.set()

    def rename(src, dst, **kwargs):
        if daemon_module.sys.platform == "win32" and src == root.name:
            assert all(handle.closed for handle in owned_handles)
        result = original_rename(src, dst, **kwargs)
        if dst == root.name and not contenders:
            contender = threading.Thread(target=open_competitor, daemon=True)
            contenders.append(contender)
            contender.start()
            assert attempting.wait(5)
            assert not finished.wait(0.05), "candidate became owned before startup"
        return result

    def start(*, rotate_credentials=False):
        nonlocal failed
        result = original_start(rotate_credentials=rotate_credentials)
        assert not finished.wait(0.05), "borrowed startup released caller's admission fence"
        if fail_start and not failed:
            failed = True
            raise RuntimeError("injected replacement startup failure")
        return result

    monkeypatch.setattr(daemon, "_acquire_offline_custody", custody)
    monkeypatch.setattr(daemon, "_start", start)
    monkeypatch.setattr(RealmStore, "_acquire_admission_lock", announce_admission)
    monkeypatch.setattr(daemon_module.os, "rename", rename)
    try:
        replace = lambda: daemon.replace_from_backup(backup) if offline else daemon.activate_candidate(candidate)
        if fail_start:
            with pytest.raises(RuntimeError, match="injected replacement startup failure"):
                replace()
        else:
            assert replace()["state"] == "complete"
        assert finished.wait(5)
        # After rollback the waiting opener's descriptor refers to the moved
        # candidate, not the restored root. It must reject that identity swap.
        assert outcomes == [RealmAdmissionError if fail_start else OwnerBusyError]
        assert daemon._replacement_admission_fd is None
        assert root.is_dir()
        assert not list(tmp_path.glob(".realm.superseded-*"))
        if offline and fail_start:
            assert not list(tmp_path.glob(".realm.candidate-*"))
            with RealmStore(root):
                pass
    finally:
        daemon.stop()
        for contender in contenders:
            contender.join(timeout=5)
            assert not contender.is_alive()


def test_maintenance_cannot_cross_directory_admission_fence(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    with realm_admission_fence(root):
        with pytest.raises(OwnerBusyError):
            with _owner_fence(root):
                pytest.fail("maintenance crossed the directory fence")
    with _owner_fence(root):
        pass


def test_borrowed_admission_rejects_other_directory_and_remains_caller_owned(tmp_path):
    root = tmp_path / "realm"
    other = tmp_path / "other"
    RealmStore.initialize(root).close()
    RealmStore.initialize(other).close()
    with realm_admission_fence(other) as descriptor:
        with pytest.raises(RealmAdmissionError, match="does not match"):
            RealmStore(root, _admission_fd=descriptor)
        second = daemon_module.os.open(other, daemon_module.os.O_RDONLY)
        try:
            with pytest.raises(BlockingIOError):
                platform.lock_file(second, blocking=False)
        finally:
            daemon_module.os.close(second)


def test_admission_fence_rejects_root_swapped_between_open_and_lock(tmp_path, monkeypatch):
    root = tmp_path / "realm"
    moved = tmp_path / "moved"
    root.mkdir()
    original_lock = platform.lock_file
    swapped = False

    def swap_before_lock(descriptor, **kwargs):
        nonlocal swapped
        if not swapped:
            swapped = True
            root.rename(moved)
            root.mkdir()
        return original_lock(descriptor, **kwargs)

    monkeypatch.setattr(platform, "lock_file", swap_before_lock)
    with pytest.raises(RealmAdmissionError, match="does not match"):
        with realm_admission_fence(root):
            pytest.fail("a moved directory fence must not authorize the new root")
    with realm_admission_fence(moved, blocking=False):
        pass
    assert not (root / "owner.lock").exists()
