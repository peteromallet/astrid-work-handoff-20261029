"""Clip bounds from the page reach the captured frames (P1-R9b). Offline: renderers and workers are faked.

Covers the ``app.astrid_bounds`` flag and, in RemotionFrameProvider.capture, the cache bypass and the
bounds-file copy beside each PNG. (The old fast-lane worker's bounds map and ``FastLaneProvider`` are
gone: the fast lane now decodes managed renders, which carry no page bounds.)
"""

from __future__ import annotations

import contextlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from astrid.packs.rendering.actions.timeline_visualize.composed_frame import (
    FrameCaptureCache,
    RemotionFrameProvider,
    snapshot_wants_bounds,
)

CONFIG = {"theme": "noir", "tracks": [{"id": "plate", "kind": "visual"}],
          "clips": [{"id": "c1", "at": 0.0, "hold": 1.0, "track": "plate", "clipType": "media", "asset": "WHITE"}]}
FLAGGED = {**CONFIG, "app": {"astrid_bounds": True}}
CLIPS = [{"id": "c1", "box": [0, 0, 480, 270], "opacity": 1, "order": 0, "source": "painted"}]


def _png(path: Path, value: int = 0) -> Path:
    Image.new("RGB", (4, 4), (value, 0, 0)).save(path)
    return path


def _bounds_json(path: Path, frame: int) -> None:
    path.write_text(json.dumps({"frame": frame, "canvas": [1920, 1080], "clips": CLIPS}), encoding="utf-8")


# --- snapshot flag ------------------------------------------------------------

def test_snapshot_flag_is_read_from_config_or_fast_lane_config():
    assert snapshot_wants_bounds({"config": FLAGGED})
    assert snapshot_wants_bounds({"fast_lane": {"config": FLAGGED}})
    assert not snapshot_wants_bounds({"config": CONFIG})
    assert not snapshot_wants_bounds({"config": {"app": {"astrid_bounds": "yes"}}})
    assert not snapshot_wants_bounds({})


# --- RemotionFrameProvider.capture ---------------------------------------------

def _renderer(calls: list, *, bounds: bool):
    def render(frames, output_dir, resolution):
        calls.append(tuple(frames))
        result = {}
        for frame in frames:
            path = Path(output_dir) / f"frame-{frame:06d}.png"
            _png(path, frame)
            if bounds:
                _bounds_json(Path(output_dir) / f"frame-{frame:06d}.bounds.json", frame)
            result[frame] = path
        return result

    return render


def _provider(tmp_path: Path, snapshot, cache, renderer) -> RemotionFrameProvider:
    return RemotionFrameProvider(
        snapshot,
        timeline_path=tmp_path / "timeline.json",
        assets_path=tmp_path / "assets.json",
        project_dir=tmp_path,
        cache=cache,
        renderer=renderer,
    )


def test_bounds_capture_renders_every_frame_and_copies_bounds_beside_the_png(tmp_path):
    calls: list = []
    cache = FrameCaptureCache(tmp_path / "cache")
    snapshot = {"config": FLAGGED}
    cards = [{"frame": 1, "image": "frames/f000001.png"}, {"frame": 2, "image": "frames/f000002.png"}]
    renderer = _renderer(calls, bounds=True)

    _provider(tmp_path, snapshot, cache, renderer).capture(cards, tmp_path / "first", [32, 18])
    second = _provider(tmp_path, snapshot, cache, renderer).capture(cards, tmp_path / "second", [32, 18])

    # Both requests render: the cache never answers for a bounds capture.
    assert calls == [(1, 2), (1, 2)]
    assert second["evidence_source"] == "fresh_capture"
    assert second["cached_frames"] == 0
    for card in cards:
        png = tmp_path / "second" / card["image"]
        assert png.is_file()
        bounds = png.with_name(png.stem + ".bounds.json")
        assert json.loads(bounds.read_text(encoding="utf-8"))["clips"] == CLIPS


def test_bounds_capture_without_a_bounds_file_copies_nothing(tmp_path):
    calls: list = []
    cards = [{"frame": 3, "image": "frames/f000003.png"}]
    provider = _provider(tmp_path, {"config": FLAGGED}, FrameCaptureCache(tmp_path / "cache"),
                         _renderer(calls, bounds=False))
    result = provider.capture(cards, tmp_path / "out", [32, 18])
    assert result["fresh_frames"] == 1
    assert (tmp_path / "out" / "frames" / "f000003.png").is_file()
    assert not list((tmp_path / "out").rglob("*.bounds.json"))


def test_unflagged_capture_still_uses_the_cache_and_copies_no_bounds(tmp_path):
    calls: list = []
    cache = FrameCaptureCache(tmp_path / "cache")
    snapshot = {"config": CONFIG}
    cards = [{"frame": 1, "image": "frames/f000001.png"}]
    renderer = _renderer(calls, bounds=True)  # even if a bounds file appeared, it is not copied

    _provider(tmp_path, snapshot, cache, renderer).capture(cards, tmp_path / "first", [32, 18])
    second = _provider(tmp_path, snapshot, cache, renderer).capture(cards, tmp_path / "second", [32, 18])

    assert calls == [(1,)]
    assert second["evidence_source"] == "cache"
    assert not list((tmp_path / "second").rglob("*.bounds.json"))
