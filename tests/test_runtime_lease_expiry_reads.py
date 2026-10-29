"""An overdue lease is observable without another claim.

When the worker dies its lease expires.  The claim path already requeues the
task (waiting_reason=waiting_for_worker, task.lease_expired); reads of the task
and project task/run collections must apply that same transition so a poller
never sees a dead attempt as ``running`` forever.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from runtime_protocol.service import RuntimeService
from runtime_protocol.store import RealmStore


def _digest(name):
    return "sha256:" + hashlib.sha256(name.encode()).hexdigest()


@pytest.fixture
def service(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    svc = RuntimeService(root)
    try:
        yield svc
    finally:
        svc.close()


def _claimed_task(service):
    service.register_capability({"capability_id": "render.gpu", "definition_digest": _digest("render.gpu-v1")})
    service.register_executor({"executor_id": "worker", "capabilities": ["render.gpu"], "max_concurrency": 1,
                               "runtime_epoch": service.health()["runtime_epoch"]}, idempotency_key="reg")
    task_id = service.create_task({"capability_id": "render.gpu", "capability_digest": _digest("render.gpu-v1"),
                                   "input_object_ids": [], "spec": {}, "idempotency_key": "t1"})["task"]["id"]
    attempt = service.claim_next({"executor_id": "worker", "capability_ids": ["render.gpu"],
                                  "runtime_epoch": service.health()["runtime_epoch"]}, idempotency_key="claim-1")
    assert service.task(task_id)["task"]["status"] == "running"
    return task_id, attempt


def _expire(service, task_id, attempt):
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(timespec="milliseconds")
    service.store.conn.execute("UPDATE tasks SET lease_expires_at=? WHERE id=?", (past, task_id))
    service.store.conn.execute("UPDATE attempts SET lease_expires_at=? WHERE id=?", (past, attempt["attempt_id"]))
    service.store.conn.commit()


def _kinds(service, task_id):
    return [e["kind"] for e in service.store.list_events(service.store.get_task(task_id)["run"]["id"]) if e["task_id"] == task_id]


def test_task_read_requeues_overdue_lease_without_a_claim(service):
    task_id, attempt = _claimed_task(service)
    _expire(service, task_id, attempt)
    resource = service._task_resource(service.task(task_id))
    assert resource["state"] == "queued"
    assert resource["waiting_reason"] == "waiting_for_worker"
    assert "lease_expires_at" not in resource
    assert _kinds(service, task_id).count("task.lease_expired") == 1


def test_read_transition_matches_claim_transition_and_is_idempotent(service):
    task_id, attempt = _claimed_task(service)
    _expire(service, task_id, attempt)
    service.task(task_id)
    service.task(task_id)
    assert _kinds(service, task_id).count("task.lease_expired") == 1
    reclaimed = service.claim_next({"executor_id": "worker", "capability_ids": ["render.gpu"],
                                    "runtime_epoch": service.health()["runtime_epoch"]}, idempotency_key="claim-2")
    assert reclaimed["task_id"] == task_id and reclaimed["fence"] > attempt["fence"]


def test_unexpired_lease_is_untouched_by_reads(service):
    task_id, _ = _claimed_task(service)
    assert service._task_resource(service.task(task_id))["state"] == "running"
    assert "task.lease_expired" not in _kinds(service, task_id)


def test_project_task_and_run_lists_apply_expiry(service):
    task_id, attempt = _claimed_task(service)
    run = service.store.get_task(task_id)["run"]
    project = service.create_project({"name": "p"}, idempotency_key="proj")["id"]
    service.store.conn.execute("UPDATE runs SET project_id=? WHERE id=?", (project, run["id"]))
    service.store.conn.commit()
    _expire(service, task_id, attempt)
    items = service.list_project_tasks(project)["items"]
    assert [i["state"] for i in items if i["task_id"] == task_id] == ["queued"]
    assert service.list_project_runs(project)["items"][0]["status"] == "queued"
