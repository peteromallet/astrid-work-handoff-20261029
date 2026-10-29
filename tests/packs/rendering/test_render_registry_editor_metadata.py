"""Editor metadata on registry entries never reaches the renderer's strict schema."""
from types import SimpleNamespace

import pytest

from astrid.core import timeline
from astrid.packs.rendering.actions.render.managed_timeline import _render_compatible_projection
from astrid.sdk.authoring_media import _metadata

DIGEST = "a" * 64


def _entry(**extra):
    return {"media_id": "sha256:" + DIGEST, "content_sha256": DIGEST, "type": "image/png", **extra}


def test_swap_asset_metadata_is_projected_out_and_the_source_is_unchanged():
    registry = {"assets": {"BUGNET": _entry(handle="run:r/sprites#0", filename="sprite-00.png",
                                           source="run:r/sprites#0", pixel_provenance={"drawn_block": 13.0})}}
    with pytest.raises(ValueError, match="unknown key"):
        timeline.validate_registry(registry)
    _config, projected = _render_compatible_projection({"clips": []}, registry)
    timeline.validate_registry(projected)
    assert set(projected["assets"]["BUGNET"]) == {"media_id", "content_sha256", "type"}
    assert "pixel_provenance" in registry["assets"]["BUGNET"]  # the published document keeps it


def test_retired_locators_and_unknown_keys_still_fail():
    for extra in ({"path": "/tmp/x.png"}, {"mystery": 1}):
        _config, projected = _render_compatible_projection({"clips": []}, {"assets": {"A": _entry(**extra)}})
        with pytest.raises(ValueError, match="unknown key"):
            timeline.validate_registry(projected)


def test_authoring_media_import_metadata_maps_to_renderer_registry_shape(monkeypatch, tmp_path):
    path = tmp_path / "clip.mp4"
    path.write_bytes(b"media")
    monkeypatch.setattr(
        "astrid.sdk.authoring_media.ffprobe_metadata_strict",
        lambda _path: SimpleNamespace(
            has_audio_stream=False,
            has_video_stream=True,
            duration_seconds=4.0,
            width=1280,
            height=720,
        ),
    )
    details = _metadata(path)
    assert details["width"] == 1280
    assert details["height"] == 720
    assert details["duration_seconds"] == 4.0
    assert not {"resolution", "duration"} & set(details)

    imported = _entry(
        type="video",
        media_type=details["media_type"],
        filename=details["filename"],
        resolution=f"{details['width']}x{details['height']}",
        duration=details["duration_seconds"],
    )
    _config, projected = _render_compatible_projection({"clips": []}, {"assets": {"clip": imported}})
    timeline.validate_registry(projected)
    entry = projected["assets"]["clip"]
    assert entry["resolution"] == "1280x720" and entry["duration"] == 4.0
    assert not {"media_type", "filename", "width", "height", "duration_seconds"} & set(entry)
