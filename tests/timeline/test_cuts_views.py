from __future__ import annotations

import copy
from pathlib import Path
from types import SimpleNamespace

from astrid.core.timeline.cuts import occurrences_from_bundle, picture_cuts
from astrid.sdk.timeline_cuts import (
    build_cut_table,
    diff_bundles,
    render_cut_table,
)
from astrid.sdk.timeline_views import element_source, render_code, render_script


def _bundle() -> dict:
    tracks = [
        {"id": "plate", "kind": "visual"},
        {"id": "overlay", "kind": "visual"},
        {"id": "vo", "kind": "audio"},
    ]
    return {
        "parent": {"config": {"theme_overrides": {"visual": {"canvas": {"fps": 30}}}}},
        "placements": [{
            "shot_id": "shot-1", "occurrence_id": "occ-1",
            "placement": {"start_ms": 0}, "duration_ms": 2000,
        }],
        "shots": {"shot-1": {
            "payload": {"name": "Opening", "text_bindings": [{
                "kind": "voiceover_script", "text": "Hello world",
            }]},
            "internal_timeline": {"tracks": tracks, "clips": [
                {"id": "plate-1", "track": "plate", "clipType": "media",
                 "asset": "image-a", "at": 0.0, "hold": 1.0,
                 "app": {"sequence": "stepped"}},
                {"id": "plate-2", "track": "plate", "clipType": "media",
                 "asset": "image-b", "at": 1.0, "hold": 1.0,
                 "app": {"sequence": "stepped"}},
                {"id": "overlay-1", "track": "overlay", "clipType": "text-card",
                 "at": 0.5, "hold": 1.0,
                 "params": {"text": "Hello", "opacity": 0.5},
                 "app": {"x": [1.0, 2.0]}},
                {"id": "vo-1", "track": "vo", "clipType": "media",
                 "asset": "voice", "at": 0.0, "hold": 2.0,
                 "app": {"words": [[0.0, 0.4, "Hello"], [0.5, 0.9, "world"]]}},
            ]},
        }},
    }


def test_picture_cuts_merge_stepped_sequence_without_counting_layer_edges():
    cuts = picture_cuts(occurrences_from_bundle(_bundle()))

    assert len(cuts) == 1
    assert cuts[0]["clip_id"] == "plate-1"
    assert cuts[0]["sequence"] == {
        "id": "stepped", "steps": 2, "clip_ids": ["plate-1", "plate-2"],
        "starts": [0.0, 1.0],
    }
    assert [layer["id"] for layer in cuts[0]["layers"]] == ["overlay-1"]


def test_cut_table_and_script_code_views_are_readable():
    bundle = _bundle()
    table = build_cut_table(bundle)

    assert table["rows"][0]["sequence"]["steps"] == 2
    assert table["rows"][0]["say"] == "Hello world"
    assert "sequence ×2 steps" in render_cut_table(table)
    assert "Script view" in render_script(bundle)
    assert "┃ CUT 1" in render_script(bundle)
    assert 'with shot("Opening", id="shot-1"' in render_code(bundle)
    assert "with cut(1" in render_code(bundle)


def test_diff_keys_placements_and_suppresses_nested_numeric_noise():
    before = _bundle()
    after = copy.deepcopy(before)
    after["shots"]["shot-1"]["internal_timeline"]["clips"][2]["params"]["opacity"] = 0.50001
    after["shots"]["shot-1"]["internal_timeline"]["clips"][2]["app"] = {"x": [1.0, 2.00001]}
    after["placements"][0]["placement"]["start_ms"] = 0.00001

    quiet = diff_bundles(before, after)
    assert quiet["changes"] == []
    assert quiet["placement_changes"] == []

    after["placements"][0]["duration_ms"] = 2200
    changed = diff_bundles(before, after)
    assert changed["changes"] == []
    assert changed["placement_changes"] == [{
        "kind": "changed", "occurrence_id": "occ-1",
        "before": before["placements"][0], "after": after["placements"][0],
        "fields": ["duration_ms"],
    }]


def test_element_source_uses_declared_v3_registry_only(monkeypatch):
    component = Path("/declared/rendering/elements/effects/text-card/component.tsx")
    registry = SimpleNamespace(list=lambda: (
        SimpleNamespace(id="declared-effect", component=component),
    ))
    monkeypatch.setattr("astrid.sdk.timeline_views._v3_element_registry", lambda: registry)

    assert element_source("declared-effect") == str(component)
    assert element_source("legacy-folder-only") is None
