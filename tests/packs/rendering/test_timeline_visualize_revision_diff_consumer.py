from __future__ import annotations

import copy
import hashlib
import json
from types import SimpleNamespace

import pytest

from astrid.packs.rendering.actions.timeline_visualize import filmstrip_execution
from astrid.packs.rendering.actions.timeline_visualize.revision_diff import (
    RevisionDiffAdmissionError,
    validate_compiled_revision_diff,
)


def _bundle(asset: str) -> dict:
    return {
        "project_id": "project-1",
        "timeline_id": "timeline-1",
        "base_parent": {"revision_id": "rev", "content_digest": "a" * 64},
        "parent": {"config": {"theme_overrides": {"visual": {"canvas": {"fps": 30}}}}},
        "placements": [{
            "shot_id": "shot-1", "occurrence_id": "occ-1",
            "placement": {"start_ms": 0}, "duration_ms": 1000,
        }],
        "shots": {"shot-1": {"internal_timeline": {"tracks": [{"id": "plate", "kind": "visual"}], "clips": [
            {"id": "plate-1", "track": "plate", "clipType": "media", "asset": asset, "at": 0, "hold": 1},
        ]}}},
    }


def _digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _compiled() -> dict:
    sides = {}
    for name, asset in (("before", "asset-old"), ("after", "asset-new")):
        revision = "before" if name == "before" else "after"
        bundle = _bundle(asset)
        bundle["base_parent"]["revision_id"] = revision
        config = {"tracks": [], "clips": []}
        registry = {"assets": {asset: {"content_sha256": "b" * 64}}}
        sides[name] = {
            "revision_id": revision,
            "parent_content_digest": "a" * 64,
            "bundle_hash": _digest(bundle),
            "bundle": bundle,
            "config": config,
            "registry": registry,
            "config_hash": _digest(config),
            "registry_hash": _digest(registry),
            "expansion": {"canonical": True},
        }
    return {
        "schema_version": 1,
        "kind": "astrid.timeline_revision_diff.v1",
        "project_id": "project-1",
        "timeline_id": "timeline-1",
        **sides,
    }


def test_consumer_requires_exact_hashes_and_explicit_selectors():
    compiled = _compiled()
    admitted = validate_compiled_revision_diff(
        compiled,
        before_revision_id="before",
        after_revision_id="after",
        timeline_selector="main",
    )
    assert admitted["before"]["bundle"]["project_id"] == "project-1"

    tampered = copy.deepcopy(compiled)
    tampered["after"]["bundle"]["shots"]["shot-1"]["internal_timeline"]["clips"][0]["asset"] = "foreign"
    with pytest.raises(RevisionDiffAdmissionError, match="bundle_hash"):
        validate_compiled_revision_diff(
            tampered,
            before_revision_id="before",
            after_revision_id="after",
            timeline_selector="main",
        )

    with pytest.raises(RevisionDiffAdmissionError, match="before_revision_id"):
        validate_compiled_revision_diff(
            compiled,
            before_revision_id="",
            after_revision_id="after",
            timeline_selector="main",
        )


def test_action_dispatch_consumes_compiled_bundles_without_current_authority(monkeypatch, tmp_path):
    compiled = _compiled()
    seen = {}

    def fake_compose(report, before_frames, after_frames, out, *, title):
        seen["rows"] = report["rows"]
        seen["before_frames"] = before_frames
        seen["after_frames"] = after_frames
        out.write_bytes(b"diff-page")
        return out

    monkeypatch.setattr(
        "astrid.packs.rendering.actions.timeline_visualize.revision_diff.compose_page",
        fake_compose,
    )
    args = SimpleNamespace(
        view="diff",
        out=tmp_path / "result",
        revision_diff=compiled,
        before_revision_id="before",
        after_revision_id="after",
        timeline_slug="main",
        timeline_ref=None,
        filmstrip_authority=None,
    )
    result = filmstrip_execution.execute_filmstrip(args, authority={"mode": "not-a-filmstrip-authority"})

    assert result["returncode"] == 0
    assert result["outputs"]["render_requested"] is False
    assert result["outputs"]["navigation"]["view"] == "diff"
    assert seen["rows"]
    assert seen["before_frames"] == {}
    assert seen["after_frames"] == {}
    assert (tmp_path / "result" / "revision-diff-view" / "revision-diff.json").is_file()
    assert (tmp_path / "result" / "revision-diff-bundle.zip").is_file()


def test_missing_compiled_contract_fails_closed_before_any_authority_read(tmp_path):
    args = SimpleNamespace(
        view="diff",
        out=tmp_path / "result",
        revision_diff=None,
        before_revision_id="before",
        after_revision_id="after",
        timeline_slug="main",
        timeline_ref=None,
        filmstrip_authority=None,
    )
    with pytest.raises(RevisionDiffAdmissionError, match="host-compiled"):
        filmstrip_execution.execute_filmstrip(args, authority={"mode": "not-a-filmstrip-authority"})
