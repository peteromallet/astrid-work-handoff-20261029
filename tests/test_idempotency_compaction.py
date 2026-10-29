from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from runtime_protocol.errors import ConflictError
from runtime_protocol.cli import main as runtime_cli
from runtime_protocol.service import RuntimeService
from runtime_protocol.store import IdempotencyWindowExpired, RealmStore
from runtime_protocol.upgrade import compact_idempotency_ledger
from runtime_protocol.util import canonical_json


def _service(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    return root, RuntimeService(root)


def test_large_result_window_refuses_reexecution_and_preserves_receipt(tmp_path):
    _, service = _service(tmp_path)
    try:
        payload = {"data": "x" * 20000}
        request_hash = hashlib.sha256(b"request").hexdigest()
        first = service._command_record(
            "test.large", "one", "key", request_hash, payload,
            project_id="unscoped",
        )
        assert service._command_replay("test.large", "one", "key", request_hash, project_id="unscoped") == first
        with pytest.raises(ConflictError):
            service._command_replay("test.large", "one", "key", "different", project_id="unscoped")
        old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(timespec="milliseconds")
        service.store.conn.execute(
            "UPDATE command_idempotency SET created_at=? WHERE command_kind='test.large'", (old,)
        )
        with pytest.raises(IdempotencyWindowExpired):
            service._command_replay("test.large", "one", "key", request_hash, project_id="unscoped")
        service.store._last_idempotency_prune = 0
        service._command_record("test.small", "two", "key2", request_hash, {"ok": True}, project_id="unscoped")
        with pytest.raises(IdempotencyWindowExpired) as expired:
            service._command_replay("test.large", "one", "key", request_hash, project_id="unscoped")
        assert expired.value.code == "idempotency_window_expired"
        with pytest.raises(ConflictError) as changed:
            service._command_replay("test.large", "one", "key", "different", project_id="unscoped")
        assert changed.value.code == "conflict"
        assert service.store.conn.execute("SELECT COUNT(*) FROM command_idempotency").fetchone()[0] == 2
    finally:
        service.close()


def test_session_claim_replay_keeps_permanent_ledger_empty(tmp_path):
    _, service = _service(tmp_path)
    try:
        response = {"task_id": "one", "spec": {"input": "x" * 20000}}
        assert service._command_record("task.claim", "claim", "claim-key", "hash", response, project_id="unscoped", with_receipt=False) == response
        assert service._command_replay("task.claim", "claim", "claim-key", "hash", with_receipt=False) == response
        assert service.store.conn.execute("SELECT COUNT(*) FROM command_idempotency WHERE command_kind='task.claim'").fetchone()[0] == 0
        with pytest.raises(ConflictError):
            service._command_replay("task.claim", "claim", "claim-key", "changed", with_receipt=False)
        old = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(timespec="milliseconds")
        service.store.conn.execute(
            "UPDATE session_command_replay SET created_at=? WHERE idempotency_key='claim-key'", (old,)
        )
        with pytest.raises(IdempotencyWindowExpired):
            service._command_replay("task.claim", "claim", "claim-key", "hash", with_receipt=False)
        service._command_record("task.claim", "claim", "next-key", "hash", None, project_id="unscoped", with_receipt=False)
        with pytest.raises(IdempotencyWindowExpired):
            service._command_replay("task.claim", "claim", "claim-key", "hash", with_receipt=False)
        assert service.store.conn.execute("SELECT COUNT(*) FROM command_idempotency WHERE command_kind='task.claim'").fetchone()[0] == 0
    finally:
        service.close()


def test_offline_compaction_rewrites_only_expired_bulk_and_session_rows(tmp_path, capsys):
    root, service = _service(tmp_path)
    old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(timespec="milliseconds")
    large = canonical_json({"data": "z" * 200000})
    try:
        for kind in ("task.create", "task.claim", "executor.register", "object.ingest", "media.import", "parent_composition.publish"):
            service.store.conn.execute(
                "INSERT INTO command_idempotency(command_kind,aggregate_id,idempotency_key,request_hash,result_json,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (kind, "one", kind, "hash", large, old),
            )
        realm_id = service.realm["id"]
    finally:
        service.close()
    result = compact_idempotency_ledger(root, confirmation=f"COMPACT IDEMPOTENCY {realm_id}")
    assert result["removed_session_rows"] == 0
    assert result["expired_results"] == 3
    assert result["after_bytes"] < result["before_bytes"]
    with sqlite3.connect(f"file:{root / 'realm.sqlite3'}?mode=ro", uri=True) as connection:
        rows = dict(connection.execute("SELECT command_kind, result_json FROM command_idempotency"))
    assert set(rows) == {"task.create", "task.claim", "executor.register", "object.ingest", "media.import", "parent_composition.publish"}
    assert all(len(rows[kind]) < 200 for kind in ("task.create", "task.claim", "executor.register"))
    assert all(rows[kind] == large for kind in ("object.ingest", "media.import", "parent_composition.publish"))
    assert runtime_cli(["compact", "--root", str(root), "--confirm", f"COMPACT IDEMPOTENCY {realm_id}"]) == 0
    second = json.loads(capsys.readouterr().out)
    assert second["removed_session_rows"] == second["expired_results"] == 0
    reopened = RuntimeService(root)
    try:
        assert reopened.store.integrity_report()["ok"] is True
    finally:
        reopened.close()
