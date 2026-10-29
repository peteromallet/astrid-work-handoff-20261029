"""A migration that frees most of a realm gives the space back to the disk."""
import sqlite3

from runtime_protocol import upgrade


def _bloated(path):
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE specs(body BLOB)")
    connection.executemany("INSERT INTO specs VALUES (?)", [(b"x" * 65536,) for _ in range(64)])
    connection.commit()
    connection.execute("DELETE FROM specs")
    connection.commit()
    return connection


def test_large_free_space_is_vacuumed(tmp_path, monkeypatch):
    monkeypatch.setattr(upgrade, "MIGRATION_VACUUM_MIN_FREE_BYTES", 1024 * 1024)
    path = tmp_path / "realm.sqlite3"
    connection = _bloated(path)
    before = path.stat().st_size
    result = upgrade._reclaim_after_migration(connection)
    connection.close()
    assert result["performed"] is True
    assert path.stat().st_size < before // 4


def test_small_free_space_is_left_alone(tmp_path):
    path = tmp_path / "realm.sqlite3"
    connection = _bloated(path)
    before = path.stat().st_size
    result = upgrade._reclaim_after_migration(connection)
    connection.close()
    assert result["performed"] is False
    assert path.stat().st_size == before


def test_a_failed_vacuum_is_reported_not_raised(tmp_path, monkeypatch):
    monkeypatch.setattr(upgrade, "MIGRATION_VACUUM_MIN_FREE_BYTES", 1024 * 1024)
    connection = _bloated(tmp_path / "realm.sqlite3")
    connection.execute("BEGIN")  # VACUUM cannot run inside a transaction
    result = upgrade._reclaim_after_migration(connection)
    connection.rollback()
    connection.close()
    assert result["performed"] is False and "error" in result
