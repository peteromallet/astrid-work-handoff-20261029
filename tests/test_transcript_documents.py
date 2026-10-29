from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
import yaml

from runtime_protocol.errors import ConflictError, ValidationError
from runtime_protocol.service import RuntimeService
from runtime_protocol.store import RealmStore
from runtime_protocol.util import canonical_json


@pytest.fixture
def service(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    value = RuntimeService(root)
    yield value
    value.close()


def _project(service, name):
    return service.create_project({"name": name, "slug": name.lower()})


def _media(service, project_id, payload=b"source media"):
    return service.ingest(
        project_id, payload, media_type="video/mp4",
        idempotency_key=f"media-{project_id}-{hashlib.sha256(payload).hexdigest()[:12]}",
    )["data"]["object_id"]


def _content(media_id, source_id="default"):
    return {
        "schema": "media.transcript/v1",
        "media_id": media_id,
        "source_id": source_id,
        "segments": [
            {
                "id": "segment-1",
                "start": 0.25,
                "end": 1.75,
                "text": "Hello, 世界",
                "speaker": "speaker-1",
                "words": [
                    {"id": "word-1", "start": 0.25, "end": 0.8, "text": "Hello,"},
                    {"id": "word-2", "start": 0.9, "end": 1.75, "text": "世界"},
                ],
            }
        ],
    }


def _body(service, project_id, content):
    return {
        "document_id": service._transcript_document_id(project_id, content["media_id"], content["source_id"]),
        "kind": "media.transcript",
        "content": content,
    }


def test_transcript_identity_matches_shared_utf8_fixtures():
    fixture_path = Path(__file__).parent / "fixtures" / "transcript-document-id.json"
    fixtures = json.loads(fixture_path.read_text(encoding="utf-8"))
    assert fixtures["schema"] == "media.transcript/v1"
    for case in fixtures["cases"]:
        identity = [fixtures["schema"], case["projectId"], case["mediaId"], case["sourceId"]]
        assert canonical_json(identity) == case["canonicalJson"]
        assert RuntimeService._transcript_document_id(
            case["projectId"], case["mediaId"], case["sourceId"]
        ) == case["documentId"]


def test_create_read_update_cas_and_retry_preserve_rich_source(service):
    project = _project(service, "Transcript")
    media_id = _media(service, project["id"])
    content = _content(media_id)
    body = _body(service, project["id"], content)

    created = service.create_document(project["id"], body, idempotency_key="transcript-create")
    assert created["data"]["kind"] == "media.transcript"
    assert created["data"]["version"] == 1
    assert service.create_document(project["id"], body, idempotency_key="transcript-create") == created
    assert service.get_document(project["id"], body["document_id"])["content"] == content
    assert service.list_documents(project["id"], kind="media.transcript")["items"] == [created["data"]]

    corrected = copy.deepcopy(content)
    corrected["segments"][0]["text"] = "Hello there, 世界"
    updated = service.update_document(
        project["id"], body["document_id"],
        {"expected_version": 1, "content": corrected},
        idempotency_key="transcript-correction",
    )
    assert updated["data"]["version"] == 2
    assert updated["data"]["content"]["segments"][0]["text"] == "Hello there, 世界"
    assert updated["data"]["content"]["segments"][0]["words"] == content["segments"][0]["words"]
    assert service.update_document(
        project["id"], body["document_id"],
        {"expected_version": 1, "content": corrected},
        idempotency_key="transcript-correction",
    ) == updated
    with pytest.raises(ConflictError):
        service.update_document(
            project["id"], body["document_id"],
            {"expected_version": 1, "content": content},
            idempotency_key="stale-transcript-correction",
        )
    assert service.get_document(project["id"], body["document_id"])["version"] == 2

    notes = service.create_document(
        project["id"], {"document_id": "notes-1", "kind": "example.notes", "content": {"text": "kept"}},
        idempotency_key="ordinary-document",
    )
    assert service.get_document(project["id"], "notes-1")["kind"] == "example.notes"
    assert service.list_documents(project["id"], kind="example.notes")["items"] == [notes["data"]]
    assert service.list_documents(project["id"], kind="media.transcript")["items"][0]["document_id"] == body["document_id"]


def test_transcript_resource_and_idempotent_receipts_survive_runtime_restart(tmp_path):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    first = RuntimeService(root)
    project = _project(first, "Restart")
    content = _content(_media(first, project["id"]))
    body = _body(first, project["id"], content)
    created = first.create_document(project["id"], body, idempotency_key="restart-create")
    corrected = copy.deepcopy(content)
    corrected["segments"][0]["text"] = "Corrected after reopen"
    update_body = {"expected_version": 1, "content": corrected}
    updated = first.update_document(
        project["id"], body["document_id"], update_body, idempotency_key="restart-update"
    )
    first.close()

    restarted = RuntimeService(root)
    try:
        assert restarted.get_document(project["id"], body["document_id"]) == updated["data"]
        assert restarted.create_document(project["id"], body, idempotency_key="restart-create") == created
        assert restarted.update_document(
            project["id"], body["document_id"], update_body, idempotency_key="restart-update"
        ) == updated
    finally:
        restarted.close()


def test_transcript_source_media_must_be_managed_by_target_project(service):
    owner = _project(service, "Owner")
    other = _project(service, "Other")
    foreign_media = _media(service, owner["id"], b"foreign source")
    wrong_project_content = _content(foreign_media)
    wrong_project_body = _body(service, other["id"], wrong_project_content)
    with pytest.raises(ValidationError, match="not managed"):
        service.create_document(other["id"], wrong_project_body, idempotency_key="wrong-project-media")

    missing_media = "sha256:" + "f" * 64
    missing_content = _content(missing_media)
    with pytest.raises(ValidationError, match="not managed"):
        service.create_document(
            other["id"], _body(service, other["id"], missing_content), idempotency_key="missing-media"
        )
    assert service.list_documents(other["id"], kind="media.transcript")["items"] == []


@pytest.mark.parametrize("mutate", [
    lambda content: content.update(schema="media.transcript/v2"),
    lambda content: content["segments"][0].update(start=-0.1),
    lambda content: content["segments"][0].update(start=float("inf")),
    lambda content: content["segments"][0].update(end=0.1),
    lambda content: content["segments"].append(copy.deepcopy(content["segments"][0])),
    lambda content: content["segments"][0]["words"][1].update(id="word-1"),
    lambda content: content["segments"][0]["words"][0].update(start=0.0),
    lambda content: content["segments"][0].update(unrecognized=True),
    lambda content: content.update(unrecognized=True),
    lambda content: content.update(source_id=""),
])
def test_malformed_transcript_content_is_rejected_before_creation(service, mutate):
    project = _project(service, "Malformed")
    content = _content(_media(service, project["id"]))
    mutate(content)
    with pytest.raises(ValidationError):
        service.create_document(project["id"], _body(service, project["id"], content), idempotency_key="bad-transcript")
    assert service.list_documents(project["id"], kind="media.transcript")["items"] == []


def test_reserved_identity_and_transcript_association_are_immutable(service):
    project = _project(service, "Immutable")
    media_id = _media(service, project["id"], b"first source")
    other_media = _media(service, project["id"], b"second source")
    content = _content(media_id)
    body = _body(service, project["id"], content)
    created = service.create_document(project["id"], body, idempotency_key="create-immutable")

    wrong_identity = {**body, "document_id": "transcript:" + "0" * 64}
    with pytest.raises(ValidationError):
        service.create_document(project["id"], wrong_identity, idempotency_key="wrong-transcript-id")
    wrong_kind = {**body, "document_id": "transcript:" + "1" * 64, "kind": "example.notes"}
    with pytest.raises(ValidationError):
        service.create_document(project["id"], wrong_kind, idempotency_key="wrong-transcript-kind")

    for patch in (
        {"kind": "example.notes", "content": content},
        {"document_id": "transcript:" + "2" * 64, "content": content},
        {"content": _content(other_media)},
        {"content": _content(media_id, source_id="another-source")},
    ):
        with pytest.raises(ValidationError):
            service.update_document(
                project["id"], body["document_id"],
                {"expected_version": 1, **patch},
                idempotency_key="invalid-transcript-update-" + str(len(patch)),
            )
    assert service.get_document(project["id"], body["document_id"]) == created["data"]

    ordinary = service.create_document(
        project["id"], {"document_id": "ordinary-1", "kind": "example.notes", "content": {"text": "safe"}},
        idempotency_key="create-ordinary-for-transcript-conversion",
    )
    with pytest.raises(ValidationError):
        service.update_document(
            project["id"], "ordinary-1",
            {"expected_version": 1, "kind": "media.transcript", "content": content},
            idempotency_key="ordinary-to-transcript",
        )
    assert service.get_document(project["id"], "ordinary-1") == ordinary["data"]


def test_document_reads_revalidate_reserved_transcript_rows(service):
    project = _project(service, "Read validation")
    content = _content(_media(service, project["id"]))
    body = _body(service, project["id"], content)
    service.create_document(project["id"], body, idempotency_key="create-readable")
    malformed = copy.deepcopy(content)
    malformed["segments"][0]["text"] = 7
    service.store.conn.execute(
        "UPDATE project_documents SET content_json=? WHERE id=? AND project_id=?",
        (canonical_json(malformed), body["document_id"], project["id"]),
    )
    with pytest.raises(ValidationError):
        service.get_document(project["id"], body["document_id"])
    with pytest.raises(ValidationError):
        service.list_documents(project["id"], kind="media.transcript")


def test_document_contract_schema_closes_reserved_transcript_shape():
    schema_path = Path(__file__).parents[1] / "contract" / "schemas" / "document.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    resource = {
        "document_id": "transcript:" + "a" * 64,
        "project_id": "project-1",
        "kind": "media.transcript",
        "content": _content("sha256:" + "b" * 64),
        "version": 1,
        "created_at": "2026-10-15T00:00:00Z",
        "updated_at": "2026-10-15T00:00:00Z",
    }
    assert list(validator.iter_errors(resource)) == []
    for bad_content in (
        {**resource["content"], "schema": "media.transcript/v2"},
        {**resource["content"], "extra": True},
        {**resource["content"], "media_id": "sha256:BAD"},
    ):
        assert list(validator.iter_errors({**resource, "content": bad_content}))
    assert list(validator.iter_errors({**resource, "kind": "example.notes"}))


def test_document_write_openapi_schemas_reference_the_typed_transcript_contract():
    contract_root = Path(__file__).parents[1] / "contract"
    schema = json.loads((contract_root / "schemas" / "document.json").read_text(encoding="utf-8"))
    openapi = yaml.safe_load((contract_root / "openapi" / "workspace-v1.yaml").read_text(encoding="utf-8"))
    registry = Registry().with_resource(schema["$id"], Resource.from_contents(schema))
    components = openapi["components"]["schemas"]
    create_validator = Draft202012Validator(
        {"$schema": schema["$schema"], "$id": "https://astrid.haus/workspace/v1/CreateDocument", **components["CreateDocument"]},
        registry=registry,
    )
    update_validator = Draft202012Validator(
        {"$schema": schema["$schema"], "$id": "https://astrid.haus/workspace/v1/UpdateDocument", **components["UpdateDocument"]},
        registry=registry,
    )
    content = _content("sha256:" + "b" * 64)
    create = {"document_id": "transcript:" + "a" * 64, "kind": "media.transcript", "content": content}
    assert list(create_validator.iter_errors(create)) == []
    assert list(update_validator.iter_errors({"expected_version": 1, "kind": "media.transcript", "content": content})) == []
    assert list(create_validator.iter_errors({**create, "document_id": "wrong"}))
    assert list(create_validator.iter_errors({**create, "kind": "example.notes"}))
    assert list(update_validator.iter_errors({"expected_version": 1, "kind": "media.transcript", "content": {"schema": "wrong"}}))
