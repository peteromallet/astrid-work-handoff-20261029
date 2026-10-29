"""Validate the change-contract drafts (schemas/change-contract) against their fixtures.

Every valid fixture must pass its schema; every invalid fixture must fail it. The schema is chosen by the
fixture's file-name prefix (opcall., patch., journal-record., plan.). Each fixture is an envelope:
{"$provenance": "...", "instance": {...}}; the provenance says whether the instance was recorded or drafted.
"""
import json
from pathlib import Path

import pytest

from jsonschema import Draft202012Validator  # noqa: E402
from referencing import Registry, Resource  # noqa: E402
from referencing.jsonschema import DRAFT202012  # noqa: E402

ROOT = Path(__file__).resolve().parents[2] / "schemas" / "change-contract"
FIXTURES = ROOT / "fixtures"
SCHEMA_FILES = {
    "opcall": "opcall.schema.json",
    "patch": "patch.schema.json",
    "journal-record": "journal-record.schema.json",
    "plan": "plan.schema.json",
}


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


SCHEMAS = {name: _load(ROOT / file) for name, file in SCHEMA_FILES.items()}
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema, default_specification=DRAFT202012))
    for schema in SCHEMAS.values()
)


def _validator(kind: str) -> Draft202012Validator:
    return Draft202012Validator(SCHEMAS[kind], registry=REGISTRY)


def _kind(path: Path) -> str:
    for kind in SCHEMA_FILES:
        if path.name.startswith(kind + "."):
            return kind
    raise AssertionError(f"no schema for fixture {path.name}")


VALID = sorted((FIXTURES / "valid").glob("*.json"))
INVALID = sorted((FIXTURES / "invalid").glob("*.json"))


def test_every_schema_is_a_valid_draft_2020_12_document():
    for kind, schema in SCHEMAS.items():
        assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema", kind
        assert schema["$id"].startswith("https://astrid.local/schemas/change-contract/"), kind
        assert schema.get("description"), kind
        Draft202012Validator.check_schema(schema)


def test_each_schema_has_valid_and_invalid_fixtures():
    for kind in SCHEMA_FILES:
        assert any(p.name.startswith(kind + ".") for p in VALID), f"no valid fixture for {kind}"
        assert any(p.name.startswith(kind + ".") for p in INVALID), f"no invalid fixture for {kind}"


@pytest.mark.parametrize("path", VALID, ids=lambda p: p.name)
def test_valid_fixture_passes_its_schema(path):
    envelope = _load(path)
    assert set(envelope) == {"$provenance", "instance"}, "fixture envelope keys"
    _validator(_kind(path)).validate(envelope["instance"])


@pytest.mark.parametrize("path", INVALID, ids=lambda p: p.name)
def test_invalid_fixture_fails_its_schema(path):
    envelope = _load(path)
    assert set(envelope) == {"$provenance", "instance"}, "fixture envelope keys"
    errors = list(_validator(_kind(path)).iter_errors(envelope["instance"]))
    assert errors, f"{path.name} unexpectedly validated"
