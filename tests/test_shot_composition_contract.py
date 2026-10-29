from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from jsonschema import Draft7Validator, Draft202012Validator
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "contract" / "schemas" / "shot-composition.json"
MATRIX_PATH = ROOT / "conformance" / "fixtures" / "shot-composition-compatibility.json"
TIMELINE_SCHEMA_PATH = ROOT / "contract" / "schemas" / "timeline-config.schema.json"
TIMELINE_SCHEMA_PROVENANCE_PATH = ROOT / "contract" / "schemas" / "timeline-config.schema.provenance.json"
TIMELINE_SCHEMA_URI = "https://astrid.haus/workspace/v1/schemas/timeline-config.schema.json"


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def _composition_validator(schema: dict) -> Draft202012Validator:
    canonical = json.loads(TIMELINE_SCHEMA_PATH.read_text(encoding="utf-8"))
    registry = Registry().with_resource(TIMELINE_SCHEMA_URI, Resource.from_contents(canonical))
    return Draft202012Validator(schema, registry=registry)


def _shot_payload_validator(schema: dict) -> Draft202012Validator:
    return Draft202012Validator(
        {
            "$schema": schema["$schema"],
            "$ref": "#/$defs/ShotPayload",
            "$defs": schema["$defs"],
        }
    )


def _nonempty_text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _read_name(payload: dict, shot_id: str) -> str:
    provenance = payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    for value in (
        payload.get("name"),
        provenance.get("name"),
        provenance.get("title"),
        metadata.get("name"),
        metadata.get("title"),
        shot_id,
    ):
        normalized = _nonempty_text(value)
        if normalized is not None:
            return normalized
    raise AssertionError("fixture shot identity must be stable and non-empty")


def _read_media_kind(managed_media: dict) -> str:
    media_type = managed_media.get("media_type")
    if not isinstance(media_type, str):
        return "unknown"
    normalized = media_type.strip().lower()
    for kind in ("image", "video", "audio"):
        if normalized.startswith(kind + "/"):
            return kind
    return "unknown"


def test_schema_declares_two_owner_boundary_without_a_second_timeline_schema() -> None:
    schema = _schema()
    Draft202012Validator.check_schema(schema)

    assert schema["x-astrid-runtime-owner"] == "astrid-runtime"
    assert schema["x-astrid-runtime-canonical-timeline-owner"] == "@banodoco/timeline-schema"
    config = schema["$defs"]["ParentComposition"]["properties"]["config"]
    assert config["$ref"] == "timeline-config.schema.json"
    assert config["x-astrid-runtime-schema-owner"] == "@banodoco/timeline-schema#TimelineConfig"
    assert config["x-astrid-runtime-schema-sha256"] == hashlib.sha256(TIMELINE_SCHEMA_PATH.read_bytes()).hexdigest()
    registry = schema["$defs"]["ParentComposition"]["properties"]["registry"]
    assert registry["x-astrid-runtime-schema-owner"] == "astrid-runtime#ManagedMediaRegistry"
    assert "outside the canonical TimelineConfig" in registry["description"]
    assert registry["additionalProperties"] is True
    internal = schema["$defs"]["InternalTimelineRevisionInput"]["properties"]["payload"]
    assert internal["$ref"] == "timeline-config.schema.json"
    assert internal["x-astrid-runtime-schema-owner"] == "@banodoco/timeline-schema#TimelineConfig"
    assert "TimelineConfig" not in schema["$defs"]
    assert "TimelineClip" not in schema["$defs"]


def test_dependency_manifest_extension_keys_remain_open_and_lossless() -> None:
    manifest = {
        "future_dependency_family": [{"id": "extension-1", "opaque": {"keep": True}}]
    }
    validator = Draft202012Validator(_schema()["$defs"]["DependencyManifest"])

    assert not list(validator.iter_errors(manifest))
    assert json.loads(json.dumps(manifest, sort_keys=True)) == manifest


def test_empty_and_ordinary_only_composition_fixtures_validate_losslessly() -> None:
    schema = _schema()
    validator = _composition_validator(schema)

    for case in _matrix()["composition_shapes"]:
        original = copy.deepcopy(case["publication"])
        errors = sorted(validator.iter_errors(case["publication"]), key=lambda error: list(error.path))
        assert errors == [], (case["id"], [error.message for error in errors])
        assert json.loads(json.dumps(case["publication"], sort_keys=True)) == original
        assert case["publication"] == original


def test_materialized_canonical_timeline_schema_is_the_nested_runtime_contract() -> None:
    canonical = json.loads(TIMELINE_SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft7Validator.check_schema(canonical)
    assert canonical["required"] == ["clips", "tracks"]
    for case in _matrix()["composition_shapes"]:
        config = case["publication"]["parent_composition"]["config"]
        assert not list(Draft7Validator(canonical).iter_errors(config)), case["id"]

    invalid = {"tracks": [], "clips": "not-a-list"}
    assert list(Draft7Validator(canonical).iter_errors(invalid))

    role_config = {
        "tracks": [{"id": "source", "kind": "visual", "label": "Source", "role": "source"}],
        "clips": [],
    }
    assert not list(Draft7Validator(canonical).iter_errors(role_config))
    track_schema = canonical["properties"]["tracks"]["items"]
    assert "role" not in track_schema["required"]
    role_config["tracks"][0]["role"] = "draft"
    assert list(Draft7Validator(canonical).iter_errors(role_config))


def test_materialized_timeline_schema_provenance_tracks_role_extension_and_nested_hashes() -> None:
    schema = json.loads(TIMELINE_SCHEMA_PATH.read_text(encoding="utf-8"))
    provenance = json.loads(TIMELINE_SCHEMA_PROVENANCE_PATH.read_text(encoding="utf-8"))
    digest = hashlib.sha256(TIMELINE_SCHEMA_PATH.read_bytes()).hexdigest()
    composition = _schema()
    parent_config = composition["$defs"]["ParentComposition"]["properties"]["config"]
    internal_payload = composition["$defs"]["InternalTimelineRevisionInput"]["properties"]["payload"]

    assert schema["properties"]["tracks"]["items"]["properties"]["role"]["enum"] == ["output", "source"]
    assert provenance["sha256"] == digest
    assert provenance["role_extension"]["source_commit"] == "3bd1d019715de79cd54aa208cf26de10427c29d5"
    assert provenance["role_extension"]["source_artifact_sha256"] == digest
    assert parent_config["x-astrid-runtime-schema-sha256"] == digest
    assert internal_payload["x-astrid-runtime-schema-sha256"] == digest


def test_supported_silent_voiceover_legacy_audio_and_extension_payloads_validate() -> None:
    schema = _schema()
    validator = _shot_payload_validator(schema)

    for case in _matrix()["shot_payload_shapes"]:
        original = copy.deepcopy(case["payload"])
        errors = sorted(validator.iter_errors(case["payload"]), key=lambda error: list(error.path))
        assert errors == [], (case["id"], [error.message for error in errors])
        assert _read_name(case["payload"], case["shot_id"]) == case["read_normalization"]["name"]
        assert json.loads(json.dumps(case["payload"], sort_keys=True)) == original
        assert case["payload"] == original

    by_id = {case["id"]: case for case in _matrix()["shot_payload_shapes"]}
    assert "audio" not in by_id["silent-canonical-name"]["payload"]
    assert "audio_bindings" not in by_id["silent-canonical-name"]["payload"]
    assert "audio" not in by_id["single-voiceover"]["payload"]
    assert "audio" not in by_id["multi-voiceover"]["payload"]
    assert by_id["legacy-aggregate-audio"]["payload"]["audio"]["future_gain_curve"] == [0, 1]
    assert by_id["unknown-extensions"]["payload"]["future_sibling"]["payload"] == ["a", "b"]


def test_name_read_precedence_and_write_preservation_matrix() -> None:
    validator = _shot_payload_validator(_schema())

    for case in _matrix()["name_normalization"]:
        original = copy.deepcopy(case["payload"])
        assert not list(validator.iter_errors(case["payload"])), case["id"]
        assert _read_name(case["payload"], case["shot_id"]) == case["expected"]
        assert case["payload"] == original


def test_media_kind_uses_managed_media_and_never_defaults_to_image() -> None:
    for case in _matrix()["media_kind_normalization"]:
        aliases = copy.deepcopy(case["payload_aliases"])
        assert _read_media_kind(case["managed_media"]) == case["expected"], case["id"]
        assert case["payload_aliases"] == aliases

    by_id = {case["id"]: case for case in _matrix()["media_kind_normalization"]}
    assert by_id["known-video-conflicting-image-alias"]["expected"] == "video"
    assert by_id["unknown-authoritative-type"]["expected"] == "unknown"
    assert by_id["missing-authoritative-type"]["expected"] == "unknown"


def test_malformed_known_core_and_invalid_present_media_are_rejected() -> None:
    validator = _shot_payload_validator(_schema())

    for case in _matrix()["invalid_shot_payloads"]:
        errors = list(validator.iter_errors(case["payload"]))
        assert errors, case["id"]


def test_open_shot_payload_keeps_unknown_siblings_but_outer_envelope_stays_closed() -> None:
    schema = _schema()
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["ShotPayload"]["additionalProperties"] is True
    assert schema["$defs"]["ShotAsset"]["additionalProperties"] is True
    assert schema["$defs"]["OpenBinding"]["additionalProperties"] is True

    valid = copy.deepcopy(_matrix()["composition_shapes"][0]["publication"])
    valid["unknown_envelope_field"] = True
    assert list(_composition_validator(schema).iter_errors(valid))
