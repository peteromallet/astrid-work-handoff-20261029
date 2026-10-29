from __future__ import annotations

import json
from pathlib import Path

import pytest

from runtime_protocol.errors import InvalidRequestError
from runtime_protocol.service import RuntimeService, _page_cursor, _page_rows
from runtime_protocol.store import RealmStore
from astrid_runtime_client.generated import ApiError, WorkspaceClient


def test_projects_and_events_are_complete_keyset_pages(tmp_path: Path) -> None:
    RealmStore.initialize(tmp_path).close()
    service = RuntimeService(tmp_path)
    for index in range(5):
        service.create_project({"name": f"Project {index}", "slug": f"project-{index}"}, idempotency_key=f"project-{index}")

    seen = []
    cursor = None
    while True:
        page = service.list_projects(cursor=cursor, limit=2)
        seen.extend(item["project_id"] for item in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 5 and len(set(seen)) == 5

    task = service.create_task({"capability_id": "render.basic", "project": seen[0], "spec": {}})
    run_id = task["run"]["id"]
    with service.store._transaction():
        for index in range(4):
            service.store._append_event(run_id, task["task"]["id"], f"event.{index}", {})
    first = service.events_page(limit=2)
    second = service.events_page(cursor=first["next_cursor"], limit=2)
    assert len(first["items"]) == 2
    assert len(second["items"]) == 2 and second["next_cursor"] is not None
    assert first["items"][-1]["event_id"] != second["items"][0]["event_id"]
    third = service.events_page(cursor=second["next_cursor"], limit=2)
    assert len(third["items"]) == 1 and third["next_cursor"] is None
    service.close()


def test_events_sql_page_matches_previous_page_bytes(tmp_path: Path) -> None:
    RealmStore.initialize(tmp_path).close()
    service = RuntimeService(tmp_path)
    project = service.create_project({"name": "Events", "slug": "events"}, idempotency_key="events-project")
    first_task = service.create_task({"capability_id": "render.basic", "project": project["id"], "spec": {}})
    second_task = service.create_task({"capability_id": "render.basic", "project": project["id"], "spec": {}})
    with service.store._transaction():
        for index in range(11):
            service.store._append_event(first_task["run"]["id"], first_task["task"]["id"], f"event.{index}", {"index": index})

    def old_page(aggregate_id, cursor, limit):
        rows = service.store.conn.execute("SELECT * FROM events ORDER BY id").fetchall()
        if aggregate_id:
            rows = [row for row in rows if aggregate_id in (row["task_id"], row["run_id"])]
        return _page_rows(
            rows, scope=f"events:{aggregate_id or '*'}", cursor=cursor, limit=limit,
            key_fn=lambda row: (str(row["id"]),),
            resource_fn=lambda row: {"event_id": str(row["id"]), "sequence": int(row["id"]), "cursor": str(row["id"]), "event_type": row["kind"], "aggregate_type": "task" if row["task_id"] else "run", "aggregate_id": row["task_id"] or row["run_id"], "payload": json.loads(row["payload_json"]), "occurred_at": row["created_at"]},
        )

    for aggregate_id in (None, first_task["run"]["id"], first_task["task"]["id"], second_task["task"]["id"]):
        cursor = None
        while True:
            expected = old_page(aggregate_id, cursor, 2)
            actual = service.events_page(aggregate_id, cursor=cursor, limit=2)
            assert json.dumps(actual, separators=(",", ":")) == json.dumps(expected, separators=(",", ":"))
            cursor = expected["next_cursor"]
            if cursor is None:
                break
    legacy_boundary = _page_cursor("events:*", ("9",))
    assert json.dumps(service.events_page(cursor=legacy_boundary), separators=(",", ":")) == json.dumps(old_page(None, legacy_boundary, 50), separators=(",", ":"))
    service.close()


def test_events_latest_cursor_polls_forward_across_digit_boundary(tmp_path: Path) -> None:
    RealmStore.initialize(tmp_path).close()
    service = RuntimeService(tmp_path)
    project = service.create_project({"name": "Events", "slug": "events"}, idempotency_key="events-project")
    task = service.create_task({"capability_id": "render.basic", "project": project["id"], "spec": {}})
    run_id, task_id = task["run"]["id"], task["task"]["id"]
    with service.store._transaction():
        for index in range(8):
            service.store._append_event(run_id, task_id, "task.progress", {"index": index})
    latest = service.events_page(from_="latest")
    assert latest["items"] == [] and latest["next_cursor"]
    assert service.events_page(cursor=latest["next_cursor"])["items"] == []
    with service.store._transaction():
        service.store._append_event(run_id, task_id, "task.progress", {"index": 8})
    polled = service.events_page(cursor=latest["next_cursor"])
    assert [item["sequence"] for item in polled["items"]] == [10]
    assert polled["next_cursor"]
    assert service.events_page(cursor=polled["next_cursor"])["next_cursor"] == polled["next_cursor"]
    with service.store._transaction():
        service.store._append_event(run_id, task_id, "task.progress", {"index": 9})
    assert [item["sequence"] for item in service.events_page(cursor=polled["next_cursor"])["items"]] == [11]
    assert service.events_page("missing", from_="latest")["next_cursor"]
    with pytest.raises(InvalidRequestError):
        service.events_page(from_="earliest")
    with pytest.raises(InvalidRequestError):
        service.events_page(cursor=latest["next_cursor"], from_="latest")
    service.close()


def test_project_objects_cursor_is_deterministic_when_created_at_ties(tmp_path: Path) -> None:
    RealmStore.initialize(tmp_path).close()
    service = RuntimeService(tmp_path)
    project = service.create_project({"name": "Objects", "slug": "objects"}, idempotency_key="objects-project")
    digests = ["c" * 64, "a" * 64, "b" * 64]
    for index, digest in enumerate(digests):
        service.store.record_object(digest, index + 1, "application/octet-stream")
        service.store.add_object_ref(project["id"], digest)

    # Force the tie that naturally occurs when several objects are ingested in
    # one timestamp tick. The secondary digest ordering must carry pagination.
    with service.store._transaction():
        service.store.conn.execute("UPDATE objects SET created_at=?", ("2026-01-01T00:00:00Z",))

    seen = []
    cursor = None
    while True:
        page = service.list_project_objects(project["id"], cursor=cursor, limit=1)
        seen.extend(item["digest"].removeprefix("sha256:") for item in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert seen == sorted(digests)
    assert len(seen) == len(set(seen)) == len(digests)
    service.close()


def test_cursor_scope_and_shape_are_typed_400_errors(tmp_path: Path) -> None:
    RealmStore.initialize(tmp_path).close()
    service = RuntimeService(tmp_path)
    service.create_project({"name": "Project", "slug": "project"}, idempotency_key="project")
    service.create_project({"name": "Project Two", "slug": "project-two"}, idempotency_key="project-two")
    with pytest.raises(InvalidRequestError) as malformed:
        service.list_projects(cursor="not-a-cursor", limit=1)
    assert malformed.value.status == 400
    page = service.list_projects(limit=1)
    with pytest.raises(InvalidRequestError) as wrong_scope:
        service.events_page(cursor=page["next_cursor"], limit=1)
    assert wrong_scope.value.status == 400
    service.close()


def test_generated_python_page_requires_next_cursor() -> None:
    def transport(method, path, headers, body):
        return 200, {}, json.dumps({"items": []}).encode()

    with pytest.raises(ApiError, match="next_cursor"):
        WorkspaceClient("http://runtime", transport=transport).list_projects()
