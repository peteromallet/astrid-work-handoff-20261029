from __future__ import annotations

import pytest

from runtime_protocol.errors import ConflictError, ValidationError
from runtime_protocol.service import RuntimeService
from runtime_protocol.store import RealmStore


def test_create_rename_and_list_timeline_names(tmp_path):
    RealmStore.initialize(tmp_path / "realm").close()
    service = RuntimeService(tmp_path / "realm")
    try:
        project_id = service.create_project({"slug": "names", "name": "Names"})["id"]
        created = service.create_timeline(project_id, "trial", name="  Vision trial  ", idempotency_key="create")
        assert created["data"]["name"] == "Vision trial"
        assert service.create_timeline(project_id, "trial", name="Vision trial", idempotency_key="create") == created
        assert service.get_project_timeline(project_id, "trial")["name"] == "Vision trial"

        renamed = service.rename_timeline(project_id, "trial", {"name": "  Final cut "}, idempotency_key="rename")
        assert renamed["data"]["name"] == "Final cut"
        assert renamed["receipt"]["event_ids"]
        assert service.rename_timeline(project_id, "trial", {"name": "Final cut"}, idempotency_key="rename") == renamed
        assert service.list_timelines(project_id)["items"][0]["name"] == "Final cut"
        with pytest.raises(ConflictError):
            service.rename_timeline(project_id, "trial", {"name": "Another"}, idempotency_key="rename")
        with pytest.raises(ValidationError):
            service.rename_timeline(project_id, "trial", {"name": "   "}, idempotency_key="blank")

        unnamed = service.create_timeline(project_id, "other", idempotency_key="other")
        assert unnamed["data"]["name"] is None
        assert service.get_project_timeline(project_id, "other")["name"] is None
    finally:
        service.close()
