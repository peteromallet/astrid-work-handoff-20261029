from __future__ import annotations

from types import SimpleNamespace

from astrid.packs.rendering.actions.timeline_visualize import frozen


class _IdentityMap:
    def lookup_display(self, value):
        return ("timeline", "clip", "clip-1") if value == "timeline/clip-1" else None


def _frozen(element_projection=None):
    clip = {
        "qualified_ref": "timeline/clip-1",
        "source_bounds": {"duration_seconds": 1.0},
    }
    if element_projection:
        clip.update(element_projection)
    return SimpleNamespace(
        ground_truth={
            "project_slug": "demo",
            "frozen_timeline": {
                "tracks": [{"authored_id": "plate", "muted": False}],
                "clips": [clip],
            },
        },
        identity_map=_IdentityMap(),
        asset_index={"assets": []},
        manifest={"snapshots": [{"event_head": {"version": 1, "last_event_id": "event", "last_hash": "hash"}}]},
        timeline_uuid="timeline-1",
        timeline_ulid="01ARZ3NDEKTSV4RRFFQ69G5FAV",
    )


def test_frozen_projection_preserves_native_element_identity_and_resources():
    model = SimpleNamespace(
        tracks=[SimpleNamespace(track_id="plate", kind="visual", label="Plate")],
        clips=[SimpleNamespace(
            clip_id="clip-1", track_id="plate", kind="media", speed=1.0,
            authored=SimpleNamespace(start=0.0), transition=None,
            authored_text=None, asset_keys=(),
        )],
        shots=[], fps=30, media_integrity={}, slug="main",
    )
    element_ref = {"packId": "pack-a", "kind": "effect", "id": "shared"}
    descriptor = {"pack_id": "pack-a", "kind": "effect", "id": "shared", "revision": "r1"}
    resources = [{"kind": "implementation", "path": "rendering/elements/effects/shared/motion.ts"}]

    snapshot = frozen.snapshot_from_frozen(
        _frozen({"elementRef": element_ref, "elementDescriptor": descriptor, "elementResources": resources}),
        model,
    )
    projected = snapshot.assembly["clips"][0]
    assert projected["elementRef"] == element_ref
    assert projected["elementDescriptor"] == descriptor
    assert projected["elementResources"] == resources


def test_frozen_projection_does_not_invent_missing_element_identity():
    model = SimpleNamespace(
        tracks=[SimpleNamespace(track_id="plate", kind="visual", label="Plate")],
        clips=[SimpleNamespace(
            clip_id="clip-1", track_id="plate", kind="media", speed=1.0,
            authored=SimpleNamespace(start=0.0), transition=None,
            authored_text=None, asset_keys=(),
        )],
        shots=[], fps=30, media_integrity={}, slug="main",
    )
    projected = frozen.snapshot_from_frozen(_frozen(), model).assembly["clips"][0]
    assert "elementRef" not in projected
    assert "elementDescriptor" not in projected
    assert "elementResources" not in projected
