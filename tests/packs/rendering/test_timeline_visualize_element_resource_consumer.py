"""Render-free proof of the native element-resource consumer join."""

from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

from astrid.packs.rendering.actions.timeline_visualize import frozen
from astrid.packs.rendering.actions.timeline_visualize.motion import element_motion, model, sheet


def _declaration(tmp_path, pack_id: str = "pack_a", element_id: str = "shared") -> dict:
    pack_root = tmp_path / pack_id
    element_root = pack_root / "rendering" / "elements" / "effects" / element_id
    element_root.mkdir(parents=True)
    (element_root / "element.yaml").write_text(
        f"schema_version: 1\nid: {element_id}\nkind: effect\npack_id: {pack_id}\n"
        "schema: {type: object}\n",
        encoding="utf-8",
    )
    motion = element_root / "motion.ts"
    motion.write_text(
        "export function motionAt(params, clipFrame, fps) { return {x: clipFrame, y: fps}; }\n",
        encoding="utf-8",
    )
    return {
        "pack_id": pack_id,
        "kind": "effects",
        "id": element_id,
        "pack_root": str(pack_root),
        "manifest_path": str(element_root / "element.yaml"),
        "resources": [{
            "kind": "implementation",
            "path": f"rendering/elements/effects/{element_id}/motion.ts",
        }],
    }


def _binding(tmp_path, *, clip_id: str = "clip-1") -> tuple[dict, dict]:
    declaration = _declaration(tmp_path)
    motion_path = tmp_path / "pack_a" / "rendering" / "elements" / "effects" / "shared" / "motion.ts"
    digest = hashlib.sha256(motion_path.read_bytes()).hexdigest()
    binding = {
        clip_id: {
            "clip_id": clip_id,
            "element_ref": {"packId": "pack_a", "kind": "effects", "id": "shared"},
            "declaration": declaration,
            "motion_resources": [{
                "kind": "implementation",
                "path": str(motion_path),
                "declared_path": declaration["resources"][0]["path"],
                "sha256": digest,
            }],
        }
    }
    return binding, declaration


def _metadata(binding: dict, *, binding_hash: str | None = None) -> dict:
    payload = json.dumps(
        binding, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")
    return {
        "element_resources": binding,
        "element_resource_binding_hash": binding_hash or hashlib.sha256(payload).hexdigest(),
    }


def _snapshot(metadata: dict) -> dict:
    return {
        "tracks": [{"id": "plate", "kind": "visual"}],
        "clips": [{
            "id": "clip-1",
            "track": "plate",
            "at": 0.0,
            "hold": 1.0,
            "clipType": "shared",
            "params": {"label": "authored"},
        }],
        "registry": {"assets": {}},
        "metadata": metadata,
    }


def test_snapshot_metadata_projects_same_clip_into_elementmaths(tmp_path):
    binding, declaration = _binding(tmp_path)
    _occurrences, elements = sheet.snapshot_elements(_snapshot(_metadata(binding)))

    assert len(elements) == 1
    element = elements[0]
    assert element.clip["elementRef"] == {"packId": "pack_a", "kind": "effects", "id": "shared"}
    assert element.clip["elementDescriptor"] == declaration
    assert element.maths is not None
    assert element.maths._module_key(element) == "pack_a/effects/shared"


def test_unknown_clip_canonical_owner_and_digest_fail_closed(tmp_path):
    binding, declaration = _binding(tmp_path)

    unknown = _metadata({"clip-other": {**binding["clip-1"], "clip_id": "clip-other"}})
    assert element_motion.admitted_element_bindings(unknown) == {
        "clip-other": unknown["element_resources"]["clip-other"]
    }  # exact producer row is valid until the immutable snapshot join
    assert sheet.snapshot_elements(_snapshot(unknown))[1][0].maths is None

    wrong_owner = {"clip-1": {**binding["clip-1"], "element_ref": {"packId": "pack_b", "kind": "effects", "id": "shared"}}}
    assert element_motion.admitted_element_bindings(_metadata(wrong_owner)) == {}

    wrong_digest_row = {**binding["clip-1"], "motion_resources": [
        {**binding["clip-1"]["motion_resources"][0], "sha256": "0" * 64}
    ]}
    wrong_digest = _metadata({"clip-1": wrong_digest_row})
    assert element_motion.admitted_element_bindings(wrong_digest) == {}

    wrong_manifest = {**binding["clip-1"], "declaration": {**declaration, "pack_id": "pack_b"}}
    assert element_motion.admitted_element_bindings(_metadata({"clip-1": wrong_manifest})) == {}


def test_missing_binding_cannot_promote_inventory_lookup(monkeypatch, tmp_path):
    declaration = _declaration(tmp_path)
    occurrence = {
        "occurrence_id": "shot-1",
        "spans": [{
            "clip": {
                "id": "clip-1",
                "clipType": "shared",
                "elementRef": {"packId": declaration["pack_id"], "kind": "effects", "id": "shared"},
            },
            "id": "clip-1",
            "start": 0.0,
            "end": 1.0,
            "track": "plate",
            "type": "shared",
            "audio": False,
        }],
    }
    monkeypatch.setattr(element_motion, "_default_declarations", lambda root: (_ for _ in ()).throw(AssertionError("inventory lookup")))

    elements = model.elements_from_occurrences([occurrence], bindings={})

    assert elements[0].maths is None


def test_frozen_projection_uses_admitted_metadata_for_exact_clip(tmp_path):
    binding, declaration = _binding(tmp_path)
    clip = {"qualified_ref": "timeline/clip-1", "source_bounds": {"duration_seconds": 1.0}, "elementRef": {"packId": "stale", "kind": "effects", "id": "shared"}}
    view = SimpleNamespace(
        ground_truth={
            "project_slug": "demo",
            "frozen_timeline": {
                "tracks": [{"authored_id": "plate", "muted": False}],
                "clips": [clip],
            },
        },
        metadata=_metadata(binding),
        identity_map=SimpleNamespace(lookup_display=lambda value: ("timeline", "clip", "clip-1") if value == "timeline/clip-1" else None),
        asset_index={"assets": []},
        manifest={"snapshots": [{"event_head": {"version": 1, "last_event_id": "event", "last_hash": "hash"}}]},
        timeline_uuid="timeline-1",
        timeline_ulid="01ARZ3NDEKTSV4RRFFQ69G5FAV",
    )
    inspection = SimpleNamespace(
        tracks=[SimpleNamespace(track_id="plate", kind="visual", label="Plate")],
        clips=[SimpleNamespace(
            clip_id="clip-1", track_id="plate", kind="media", speed=1.0,
            authored=SimpleNamespace(start=0.0), transition=None,
            authored_text=None, asset_keys=(),
        )],
        shots=[], fps=30, media_integrity={}, slug="main",
    )

    snapshot = frozen.snapshot_from_frozen(view, inspection)
    projected = snapshot.assembly["clips"][0]
    assert projected["elementRef"] == binding["clip-1"]["element_ref"]
    assert projected["elementDescriptor"] == declaration
    assert snapshot.display["metadata"] == view.metadata
    assert clip["elementRef"]["packId"] == "stale"
