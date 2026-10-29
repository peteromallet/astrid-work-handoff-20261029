"""The batched task page must preserve the prior public JSON exactly."""

import json

from runtime_protocol.service import RuntimeService, _page_rows
from runtime_protocol.store import RealmStore


def _old_page(service, project_id, *, cursor=None, limit=2):
    service.store.reap_overdue_leases()
    project = service.store.get_project(project_id)
    rows = service.store.conn.execute(
        "SELECT id, created_at FROM tasks WHERE run_id IN "
        "(SELECT id FROM runs WHERE project_id=?) ORDER BY created_at, id",
        (project["id"],),
    ).fetchall()
    return _page_rows(
        rows, scope=f"tasks:{project['id']}", cursor=cursor, limit=limit,
        key_fn=lambda row: (str(row["created_at"]), str(row["id"])),
        resource_fn=lambda row: service._task_resource(service.store.get_task(row["id"])),
    )


def test_batched_task_pages_match_previous_json(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    service = RuntimeService(root)
    try:
        project = service.create_project({"name": "Task page"}, idempotency_key="project")["id"]
        target = {"kind": "runpod", "pod_id": "pod-a", "provider_account_ref": "account-a",
                  "profile_revision": "profile-a", "profile_digest": "sha256:" + "a" * 64,
                  "release_digest": "sha256:" + "b" * 64}
        first = service.create_task({
            "capability_id": "test.targeted", "project": project,
            "spec": {"params": {"payload": "large" * 100}},
            "execution_request": {"schema_version": 1, "target": target, "inputs": []},
            "idempotency_key": "targeted",
        })
        assert service.store.execution_binding(first["task"]["id"]) is not None
        simple = []
        for index in range(3):
            simple.append(service.create_task({
                "capability_id": "test.simple", "project": project,
                "spec": {"index": index % 2}, "idempotency_key": f"simple-{index}",
            }))
        with service.store._transaction():
            task_id = first["task"]["id"]
            run_id = first["run"]["id"]
            service.store.conn.execute(
                "UPDATE tasks SET result_json=?, expected_effect_json=? WHERE id=?",
                (json.dumps({"outputs": ["ok"]}), json.dumps({"kind": "sample"}), task_id),
            )
            service.store._append_event(run_id, task_id, "task.progress", {"phase": "one"})
            service.store._append_event(run_id, task_id, "task.progress", {"phase": "two"})
            service.store._append_event(run_id, task_id, "task.placement_recovered", {
                "replacement_target": target, "placement_version": 2,
                "decision_digest": "sha256:" + "c" * 64,
            })
            service.store.conn.execute(
                "UPDATE tasks SET spec_digest=NULL WHERE id=?", (simple[-1]["task"]["id"],),
            )
        cursor = None
        while True:
            old = _old_page(service, project, cursor=cursor)
            new = service.list_project_tasks(project, cursor=cursor, limit=2)
            assert json.dumps(new, sort_keys=True).encode() == json.dumps(old, sort_keys=True).encode()
            cursor = old["next_cursor"]
            if cursor is None:
                break
    finally:
        service.close()
