"""Track `role` (output|source) is valid, stored, and excluded only from the render payload."""

from __future__ import annotations

import jsonschema
import pytest

from astrid.core.timeline.banodoco_composer import Timeline
from astrid.core.timeline.banodoco_schema import load_vendored_timeline_schema


def _config(role: str | None) -> dict:
    reference = {"id": "reference", "kind": "visual", "label": "Reference"}
    if role is not None:
        reference["role"] = role
    return {
        "tracks": [{"id": "main", "kind": "visual", "label": "Main"}, reference],
        "clips": [
            {"id": "keep", "at": 0.0, "track": "main", "clipType": "text", "hold": 2.0,
             "text": {"content": "OUTPUT"}, "params": {}},
            {"id": "ref", "at": 0.0, "track": "reference", "clipType": "text", "hold": 2.0,
             "text": {"content": "SOURCE"}, "params": {}},
        ],
    }


def test_vendored_schema_declares_the_track_role_enum() -> None:
    role = load_vendored_timeline_schema()["properties"]["tracks"]["items"]["properties"]["role"]
    assert role["enum"] == ["output", "source"]
    assert role["default"] == "output"


def test_source_track_is_stored_but_not_rendered() -> None:
    timeline = Timeline(_config("source"))
    assert {t["id"] for t in timeline.to_json_data()["tracks"]} == {"main", "reference"}
    rendered = timeline.for_render().to_json_data()
    assert [t["id"] for t in rendered["tracks"]] == ["main"]
    assert [c["id"] for c in rendered["clips"]] == ["keep"]


@pytest.mark.parametrize("role", [None, "output"])
def test_output_and_unset_roles_render_everything(role: str | None) -> None:
    rendered = Timeline(_config(role)).for_render().to_json_data()
    assert [t["id"] for t in rendered["tracks"]] == ["main", "reference"]
    assert [c["id"] for c in rendered["clips"]] == ["keep", "ref"]


def test_unknown_role_is_rejected() -> None:
    with pytest.raises((ValueError, jsonschema.ValidationError)):
        Timeline(_config("preview"))
