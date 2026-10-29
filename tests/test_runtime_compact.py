from __future__ import annotations

import json
import sqlite3

import pytest

from runtime_protocol.cli import main
from runtime_protocol.errors import OwnerBusyError, ValidationError
from runtime_protocol.idempotency import COMPACT, IdempotencyWindowExpired, command_result, compact_result
from runtime_protocol.store import RealmStore
from runtime_protocol.upgrade import compact_idempotency_ledger


def test_compact_v26_reclaims_old_poll_receipts_and_preserves_facts(tmp_path):
    root = tmp_path / "realm"
    store = RealmStore.initialize(root, realm_id="compact-test")
    with pytest.raises(OwnerBusyError):
        compact_idempotency_ledger(root, confirmation="COMPACT IDEMPOTENCY compact-test")
    store.close()
    database = root / "realm.sqlite3"
    old = "2026-01-01T00:00:00.000+00:00"
    recent = "2999-01-01T00:00:00.000+00:00"
    payload = json.dumps({"catalog": "a" * 16000})
    connection = sqlite3.connect(database)
    try:
        rows = [
            ("task.claim" if index % 2 else "executor.register", "claim", f"poll-{index}",
             "hash", payload, old, f"txn-{index}", "[]")
            for index in range(400)
        ]
        rows += [
            ("task.create", "project", "recent", "hash", payload, recent, "txn-recent", "[]"),
            ("object.ingest", "project", "permanent", "hash", payload, old, "txn-permanent", "[]"),
        ]
        connection.executemany(
            "INSERT INTO command_idempotency(command_kind,aggregate_id,idempotency_key,request_hash,result_json,created_at,txn_id,event_ids_json) "
            "VALUES (?,?,?,?,?,?,?,?)", rows,
        )
        connection.commit()
    finally:
        connection.close()
    before = database.stat().st_size
    with pytest.raises(ValidationError, match="confirmation"):
        compact_idempotency_ledger(root, confirmation="wrong")
    assert main(["compact", "--root", str(root), "--confirm", "COMPACT IDEMPOTENCY compact-test"]) == 0
    assert database.stat().st_size < before / 4
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("SELECT COUNT(*) FROM command_idempotency").fetchone()[0] == len(rows)
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None
        assert connection.execute("SELECT COUNT(DISTINCT txn_id) FROM command_idempotency").fetchone()[0] == len(rows)
        old_result = connection.execute("SELECT result_json FROM command_idempotency WHERE idempotency_key='poll-1'").fetchone()[0]
        with pytest.raises(IdempotencyWindowExpired):
            command_result(old_result, kind="task.claim")
        for key in ("recent", "permanent"):
            assert connection.execute("SELECT result_json FROM command_idempotency WHERE idempotency_key=?", (key,)).fetchone()[0] == payload
    finally:
        connection.close()
    assert compact_idempotency_ledger(root, confirmation="COMPACT IDEMPOTENCY compact-test")["expired_results"] == 0
    assert RealmStore.inspect_realm(root)["ok"] is True


def test_compact_poll_codec_replays_exact_catalog_and_task_spec(tmp_path):
    root = tmp_path / "realm"
    store = RealmStore.initialize(root)
    try:
        registration = {"executor_id": "worker", "runtime_epoch": 1,
                        "capabilities": [{"capability_id": "render", "definition_digest": "d" * 64,
                                          "required_resource_keys": ["gpu"]}] * 100}
        stored = compact_result("executor.register", registration)
        assert len(stored) < len(json.dumps(registration)) / 3
        assert json.loads(stored)[COMPACT] == "registration"
        assert command_result(stored, kind="executor.register", connection=store.conn) == registration
        run_digest = store._store_spec({})
        task_digest = store._store_spec({"input_object_ids": [], "prompt": "x" * 10000})
        store.conn.execute("INSERT INTO runs(id,capability,spec_digest,status,created_at,updated_at) VALUES ('run','render',?,'queued','now','now')", (run_digest,))
        store.conn.execute("INSERT INTO tasks(id,run_id,capability,spec_digest,status,created_at,updated_at) VALUES ('task','run','render',?,'running','now','now')", (task_digest,))
        claim = {"task_id": "task", "attempt_id": "attempt", "lease_id": "lease",
                 "spec": {"input_object_ids": [], "prompt": "x" * 10000}}
        stored = compact_result("task.claim", claim)
        assert len(stored) < 200
        assert command_result(stored, kind="task.claim", connection=store.conn) == claim
        created = {"run": {"id": "run", "spec_json": "{}"},
                   "task": {"id": "task", "spec": claim["spec"]}}
        stored = compact_result("task.create", created)
        assert len(stored) < 250
        assert command_result(stored, kind="task.create", connection=store.conn) == created
    finally:
        store.close()
