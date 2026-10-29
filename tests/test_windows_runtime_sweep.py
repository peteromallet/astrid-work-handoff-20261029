"""Windows admission regressions with native calls simulated on every host."""

import ctypes
import json
import os
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from runtime_protocol import platform
from runtime_protocol.cli import main
from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.dirfd import filesystem, open_directory_chain
from runtime_protocol.errors import RealmAdmissionError
from runtime_protocol.lifecycle import inspect_interruption_state
from runtime_protocol.sqlite_uri import sqlite_file_uri
from runtime_protocol.store import SCHEMA_VERSION, RealmStore
from runtime_protocol.upgrade import compact_idempotency_ledger, inspect_canonical_schema


def _windows_volume(monkeypatch, *, drive_type=3, volume="C:\\"):
    def volume_path(name, buffer, size):
        assert Path(name).is_absolute()
        assert size > len(volume)
        buffer.value = volume
        return 1

    kernel = SimpleNamespace(
        GetVolumePathNameW=Mock(side_effect=volume_path),
        GetDriveTypeW=Mock(return_value=drive_type),
    )
    monkeypatch.setattr(platform, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(platform, "_kernel", lambda: kernel)
    return kernel


@pytest.mark.parametrize("root", [
    r"\\server\share\realm", "//server/share/realm", r"\\?\UNC\server\share\realm",
])
@pytest.mark.parametrize("admit", [RealmStore.initialize, RealmStore])
def test_unc_realm_refused_before_volume_lookup_or_filesystem_changes(monkeypatch, root, admit):
    monkeypatch.setattr(platform, "sys", SimpleNamespace(platform="win32"))
    native = Mock(side_effect=AssertionError("UNC rejection must not query a remote volume"))
    monkeypatch.setattr(platform, "_kernel", native)
    with pytest.raises(RealmAdmissionError, match="local filesystem.*network realm"):
        admit(root)
    native.assert_not_called()


@pytest.mark.parametrize("admit", [RealmStore.initialize, RealmStore])
def test_mapped_network_realm_refused_before_root_creation(monkeypatch, tmp_path, admit):
    kernel = _windows_volume(monkeypatch, drive_type=4, volume="Z:\\")
    root = tmp_path / "missing-parent" / "realm"
    with pytest.raises(RealmAdmissionError, match="local filesystem.*network realm"):
        admit(root)
    kernel.GetDriveTypeW.assert_called_once_with("Z:\\")
    assert not root.parent.exists()


@pytest.mark.parametrize("drive_type", [2, 3, 5, 6])
def test_local_volume_types_and_mounted_volume_roots_are_recognized(monkeypatch, tmp_path, drive_type):
    kernel = _windows_volume(monkeypatch, drive_type=drive_type, volume="C:\\mounted-volume\\")
    assert platform.is_remote_filesystem(tmp_path / "not-created") is False
    kernel.GetDriveTypeW.assert_called_once_with("C:\\mounted-volume\\")


@pytest.mark.parametrize("drive_type", [0, 1])
@pytest.mark.parametrize("admit", [RealmStore.initialize, RealmStore])
def test_unknown_windows_volume_fails_admission_closed(monkeypatch, tmp_path, drive_type, admit):
    _windows_volume(monkeypatch, drive_type=drive_type)
    root = tmp_path / "realm"
    with pytest.raises(RealmAdmissionError, match="could not be verified as local"):
        admit(root)
    assert not root.exists()


def test_volume_lookup_failure_fails_admission_closed(monkeypatch, tmp_path):
    kernel = _windows_volume(monkeypatch)
    kernel.GetVolumePathNameW.side_effect = None
    kernel.GetVolumePathNameW.return_value = 0
    monkeypatch.setattr(ctypes, "get_last_error", lambda: 5, raising=False)
    monkeypatch.setattr(ctypes, "WinError", lambda code: OSError(code, "volume query denied"), raising=False)
    with pytest.raises(RealmAdmissionError, match="could not be verified as local"):
        RealmStore.initialize(tmp_path / "realm")
    kernel.GetDriveTypeW.assert_not_called()
    assert not (tmp_path / "realm").exists()


def test_realm_locality_policy_does_not_restrict_media_filesystem(monkeypatch, tmp_path):
    media = tmp_path / "remote-media"
    media.mkdir()
    (media / "input.bin").write_bytes(b"network-hosted media")
    checked = []

    def remote(path):
        checked.append(Path(path))
        return Path(path) == media

    monkeypatch.setattr(platform, "is_remote_filesystem", remote)
    root = tmp_path / "realm"
    store = RealmStore.initialize(root)
    descriptor = open_directory_chain(media)
    try:
        source = filesystem.open("input.bin", os.O_RDONLY, dir_fd=descriptor)
        try:
            assert os.read(source, 100) == b"network-hosted media"
        finally:
            os.close(source)
    finally:
        os.close(descriptor)
        store.close()
    assert checked == [root]


def test_sqlite_uri_escapes_query_fragment_percent_and_unicode(tmp_path):
    uri = sqlite_file_uri(tmp_path / "profile #?% café" / "realm.sqlite3")
    assert "%23%3F%25%20caf%C3%A9" in uri
    assert uri.endswith("/realm.sqlite3?mode=ro")
    assert "#" not in uri
    assert uri.count("?") == 1
    with pytest.raises(ValueError, match="access mode"):
        sqlite_file_uri(tmp_path / "realm.sqlite3", mode="ro&immutable=1")


def test_escaped_uri_opens_exact_database_readonly_and_never_creates_missing_file(tmp_path):
    root = tmp_path / "profile #100% café"
    root.mkdir()
    database = root / "realm.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE marker(value)")
        connection.execute("INSERT INTO marker VALUES ('intended database')")
    connection.close()
    connection = sqlite3.connect(sqlite_file_uri(database), uri=True)
    try:
        assert connection.execute("SELECT value FROM marker").fetchone()[0] == "intended database"
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            connection.execute("INSERT INTO marker VALUES ('write')")
    finally:
        connection.close()
    missing = root / "missing.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        sqlite3.connect(sqlite_file_uri(missing), uri=True)
    assert not missing.exists()


def test_all_inspection_and_maintenance_uri_callers_accept_delimited_paths(tmp_path, capsys):
    root = tmp_path / "profile #100% café" / "realm"
    RealmStore.initialize(root, realm_id="escaped-realm").close()
    database = root / "realm.sqlite3"
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0] == "delete"
    finally:
        connection.close()
    before = database.read_bytes()
    assert inspect_interruption_state(root)["safe"] is True
    assert inspect_canonical_schema(root)["version"] == SCHEMA_VERSION
    assert main(["audit-timelines", "--root", str(root)]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "ok"
    assert database.read_bytes() == before
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    finally:
        connection.close()
    assert compact_idempotency_ledger(root, confirmation="COMPACT IDEMPOTENCY escaped-realm")["ok"] is True
    assert RealmStore.inspect_realm(root)["ok"] is True


@pytest.mark.parametrize("fresh", [True, False])
def test_admission_refuses_when_sqlite_does_not_activate_wal(monkeypatch, tmp_path, fresh):
    root = tmp_path / "realm"
    if not fresh:
        RealmStore.initialize(root).close()
        with sqlite3.connect(root / "realm.sqlite3") as connection:
            assert connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0] == "delete"
        connection.close()
    connect = sqlite3.connect

    class RefuseWAL(sqlite3.Connection):
        def execute(self, sql, *args, **kwargs):
            if sql == "PRAGMA journal_mode=WAL":
                sql = "PRAGMA journal_mode"
            return super().execute(sql, *args, **kwargs)

    monkeypatch.setattr(sqlite3, "connect", lambda *args, **kwargs: connect(*args, factory=RefuseWAL, **kwargs))
    with pytest.raises(RealmAdmissionError, match="requires SQLite WAL"):
        (RealmStore.initialize if fresh else RealmStore)(root)
    if fresh:
        assert not root.exists()
        assert not list(tmp_path.glob(".realm.create-*"))


def test_existing_rollback_journal_realm_activates_wal_without_schema_change(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    with sqlite3.connect(root / "realm.sqlite3") as connection:
        connection.execute("PRAGMA journal_mode=DELETE")
    connection.close()
    store = RealmStore(root)
    try:
        assert store.conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert store.conn.execute("SELECT version FROM runtime_schema").fetchone()[0] == SCHEMA_VERSION
    finally:
        store.close()


@pytest.mark.parametrize("host", ["::1", "::", "::ffff:127.0.0.1"])
def test_ipv6_refused_before_daemon_side_effects(tmp_path, host):
    with pytest.raises(ValueError, match="IPv4 loopback; IPv6 is not supported yet"):
        RuntimeDaemon(tmp_path / "realm", support_root=tmp_path / "support", host=host)
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost"])
def test_ipv4_loopback_configuration_remains_supported(tmp_path, host):
    daemon = RuntimeDaemon(tmp_path / "realm", support_root=tmp_path / "support", host=host)
    assert daemon.host == host
    assert not list(tmp_path.iterdir())
