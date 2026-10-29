"""Fresh realm publication must work with Windows' open-descendant rules."""
from __future__ import annotations

import threading
from types import SimpleNamespace

import pytest

from runtime_protocol import platform
import runtime_protocol.store as store_module
from runtime_protocol.errors import OwnerBusyError
from runtime_protocol.store import RealmStore


@pytest.fixture(params=["native", "windows-publication"])
def publication_platform(request, monkeypatch):
    # Exercise the Windows handle lifecycle on POSIX too, without replacing
    # sys.platform globally or mocking the actual filesystem and locking APIs.
    if request.param == "windows-publication":
        monkeypatch.setattr(store_module, "sys", SimpleNamespace(platform="win32"))
    return store_module.sys.platform


def test_creation_closes_descendants_before_rename_and_reopens_owned_realm(
    tmp_path, monkeypatch, publication_platform
):
    root = tmp_path / "realm"
    original_acquire = RealmStore._acquire_owner
    original_rename = store_module.os.rename
    creators = []
    renamed = []

    def capture_creator(store):
        creators.append(store)
        return original_acquire(store)

    def rename_without_descendants(src, dst, **kwargs):
        creator = creators[0]
        if publication_platform == "win32":
            assert creator.conn is None
            assert creator._lock_file is None
            assert creator._admission_lock_file is not None
        result = original_rename(src, dst, **kwargs)
        renamed.append(True)
        return result

    monkeypatch.setattr(RealmStore, "_acquire_owner", capture_creator)
    monkeypatch.setattr(store_module.os, "rename", rename_without_descendants)
    with RealmStore.initialize(root, realm_id="fresh", display_name="Fresh") as creator:
        assert renamed == [True]
        assert creator.realm["id"] == "fresh"
        assert creator._admission_lock_file is None
        assert creator._lock_file is not None
        with pytest.raises(OwnerBusyError):
            RealmStore(root)
    with RealmStore(root) as reopened:
        assert reopened.realm["display_name"] == "Fresh"
    assert not list(tmp_path.glob(".realm.create-*"))


def test_competing_opener_cannot_take_ownership_during_publication(
    tmp_path, monkeypatch, publication_platform
):
    root = tmp_path / "realm"
    original_rename = store_module.os.rename
    original_admission = RealmStore._acquire_admission_lock
    attempting = threading.Event()
    finished = threading.Event()
    outcomes = []
    threads = []

    def announce_admission(store):
        if store.root == root:
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

    def interpose_after_rename(src, dst, **kwargs):
        result = original_rename(src, dst, **kwargs)
        thread = threading.Thread(target=open_competitor, daemon=True)
        threads.append(thread)
        thread.start()
        assert attempting.wait(5)
        if publication_platform == "win32":
            assert not finished.wait(0.05), "opener crossed the admission fence"
        return result

    monkeypatch.setattr(RealmStore, "_acquire_admission_lock", announce_admission)
    monkeypatch.setattr(store_module.os, "rename", interpose_after_rename)
    try:
        with RealmStore.initialize(root) as creator:
            assert finished.wait(5)
            assert outcomes == [OwnerBusyError]
            assert creator.realm is not None
    finally:
        for thread in threads:
            thread.join(timeout=5)
            assert not thread.is_alive()


@pytest.mark.parametrize("failure_point", ["before-rename", "after-reopen"])
def test_creation_failure_closes_children_but_keeps_admission_until_rollback(
    tmp_path, monkeypatch, publication_platform, failure_point
):
    root = tmp_path / "realm"
    original_acquire = RealmStore._acquire_owner
    original_remove = store_module.remove_tree_at
    original_rmtree = store_module.shutil.rmtree
    creators = []
    removals = []

    def capture_creator(store):
        creators.append(store)
        return original_acquire(store)

    def fail(*args, **kwargs):
        raise OSError("injected publication failure")

    def check_rollback_custody():
        creator = creators[0]
        if publication_platform == "win32":
            assert creator.conn is None
            assert creator._lock_file is None
            # Probe with a second descriptor: the directory identity remains
            # locked until all failed data has been removed.
            fd = store_module.os.open(creator.root, store_module.os.O_RDONLY)
            try:
                with pytest.raises(BlockingIOError):
                    platform.lock_file(fd, blocking=False)
            finally:
                store_module.os.close(fd)
        removals.append(True)

    def remove_published(*args, **kwargs):
        check_rollback_custody()
        return original_remove(*args, **kwargs)

    def remove_staged(path, *args, **kwargs):
        # Integrity inspection also removes private temporary snapshots.
        if creators and path == creators[0].root:
            check_rollback_custody()
        return original_rmtree(path, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(RealmStore, "_acquire_owner", capture_creator)
        patch.setattr(store_module, "remove_tree_at", remove_published)
        patch.setattr(store_module.shutil, "rmtree", remove_staged)
        if failure_point == "before-rename":
            patch.setattr(store_module.os, "rename", fail)
        else:
            patch.setattr(RealmStore, "_begin_admission_session", fail)
        with pytest.raises(OSError, match="injected publication failure"):
            RealmStore.initialize(root)
    assert removals == [True]
    assert not root.exists()
    assert not list(tmp_path.glob(".realm.create-*"))
    assert creators[0]._admission_lock_file is None
    with RealmStore.initialize(root) as retry:
        assert retry.realm is not None
