import errno
import hashlib
import os
from pathlib import Path

from runtime_protocol import store as store_module
from runtime_protocol.store import RealmStore


def test_clean_close_skips_deep_and_interrupted_session_detects_corrupt_cas(tmp_path):
    root = tmp_path / "realm"
    with RealmStore.initialize(root) as store:
        payload = b"known CAS bytes"
        digest = hashlib.sha256(payload).hexdigest()
        path = store.cas_root / digest[:2] / digest[2:]
        path.parent.mkdir()
        path.write_bytes(payload)
        store.conn.execute(
            "INSERT INTO objects(digest, size, media_type, original_name, created_at) VALUES (?, ?, ?, ?, ?)",
            (digest, len(payload), "application/octet-stream", "test.bin", store_module.now()),
        )

    clean = RealmStore.inspect_realm(root)
    assert clean["ok"]
    assert clean["checks"]["deep_verification"]["performed"] is False
    forced = RealmStore.inspect_realm(root, deep=True)
    assert forced["ok"]
    assert forced["checks"]["deep_verification"]["performed"] is True

    store = RealmStore(root)
    assert store.admission_report["checks"]["deep_verification"]["performed"] is False
    active = RealmStore.inspect_realm(root)
    assert active["ok"]
    assert active["checks"]["deep_verification"]["performed"] is False
    path.write_bytes(b"corrupt CAS bytes")
    store.close(orderly=False)
    crash = RealmStore.inspect_realm(root)
    assert not crash["ok"]
    assert crash["checks"]["deep_verification"]["performed"] is True
    assert crash["checks"]["reachable_cas"]["corrupt"]


def test_missing_or_malformed_marker_forces_deep(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    marker = root / "admission-state.json"
    marker.write_text("malformed")
    assert RealmStore.inspect_realm(root)["checks"]["deep_verification"]["performed"] is True
    marker.unlink()
    assert RealmStore.inspect_realm(root)["checks"]["deep_verification"]["performed"] is True


def test_changed_database_identity_invalidates_clean_marker(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    database = root / "realm.sqlite3"
    metadata = database.stat()
    os.utime(database, ns=(metadata.st_atime_ns, metadata.st_mtime_ns + 1_000_000))
    report = RealmStore.inspect_realm(root)
    assert report["ok"]
    assert report["checks"]["deep_verification"]["performed"] is True


def test_first_owner_open_inspects_once(tmp_path, monkeypatch):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    (root / "owner.lock").unlink()
    original = RealmStore.inspect_realm.__func__
    calls = []

    def inspect(cls, *args, **kwargs):
        calls.append(args)
        return original(cls, *args, **kwargs)

    monkeypatch.setattr(RealmStore, "inspect_realm", classmethod(inspect))
    RealmStore(root).close()
    assert len(calls) == 1


def test_darwin_clone_uses_pinned_source_fd_and_falls_back(tmp_path, monkeypatch):
    source = tmp_path / "source"
    source.write_bytes(b"source bytes")
    monkeypatch.setattr(store_module.sys, "platform", "darwin")

    class Clone:
        def __init__(self, error=None):
            self.error = error
            self.calls = 0

        def __call__(self, source_fd, _dir_fd, destination, _flags):
            self.calls += 1
            if self.error:
                store_module.ctypes.set_errno(self.error)
                return -1
            Path(os.fsdecode(destination)).write_bytes(os.read(source_fd, 100))
            return 0

    class Library:
        def __init__(self, clone):
            self.fclonefileat = clone

    cloned = Clone()
    monkeypatch.setattr(store_module.ctypes, "CDLL", lambda *args, **kwargs: Library(cloned))
    destination = tmp_path / "clone"
    RealmStore._copy_admission_file(source, destination, store_module.time.monotonic() + 10)
    assert cloned.calls == 1
    assert destination.read_bytes() == source.read_bytes()

    fallback = Clone(errno.ENOTSUP)
    monkeypatch.setattr(store_module.ctypes, "CDLL", lambda *args, **kwargs: Library(fallback))
    destination = tmp_path / "fallback"
    RealmStore._copy_admission_file(source, destination, store_module.time.monotonic() + 10)
    assert fallback.calls == 1
    assert destination.read_bytes() == source.read_bytes()
