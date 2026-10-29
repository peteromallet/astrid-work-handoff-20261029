"""The ``labels`` overlay: addresses on tiles (verify pages, visualize tiles) and in the frame index."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from astrid.core.timeline.onscreen import Visible
from astrid.packs.rendering.actions.timeline_visualize import fast_lane
from astrid.packs.rendering.actions.timeline_visualize.contact_sheet import cut_tile_label
from astrid.packs.rendering.actions.timeline_visualize.filmstrip_cards import attach_frame_addresses
from astrid.packs.rendering.actions.timeline_visualize.fast_lane import Moment
from astrid.packs.rendering.actions.timeline_visualize.layers.base import discover, resolve_layers
from astrid.packs.rendering.actions.timeline_visualize.overlays.labels import (
    addresses_at,
    draw_labels,
    labels_for,
)

FPS = 10.0
CANVAS = {"width": 200, "height": 100}
CONTENT_RGB = (250, 204, 21)  # ROLE_COLOURS["content"] #facc15
PICTURE_RGB = (56, 189, 248)  # ROLE_COLOURS["picture"] #38bdf8
BACKING_RGB = (11, 18, 32)  # #0b1220
CONFIG = {
    "theme_overrides": {"visual": {"canvas": CANVAS}},
    "tracks": [{"id": "content", "kind": "visual"}, {"id": "plate", "kind": "visual"}],
    "clips": [
        {"id": "occ:c02.card", "track": "content", "clipType": "test-card", "at": 0, "from": 0, "to": 2,
         "app": {"cut": "c02", "layer": "card"}, "x": 20, "y": 40, "width": 60, "height": 40},
        {"id": "occ:c01.field", "track": "plate", "clipType": "test-field", "at": 0, "from": 0, "to": 2,
         "app": {"cut": "c01", "layer": "field"}},
        {"id": "occ:c03.late", "track": "content", "clipType": "test-card", "at": 1.5, "from": 0, "to": 1,
         "app": {"cut": "c03", "layer": "late"}, "x": 0, "y": 0, "width": 10, "height": 10},
    ],
}


def _blank() -> Image.Image:
    return Image.new("RGB", (200, 100), (0, 0, 0))


def _draw(layers):
    return draw_labels(_blank(), layers, canvas=CANVAS, tile_size=(200, 100))


def test_a_declared_box_is_outlined_in_its_role_colour_and_labelled_beside_it():
    out = _draw(labels_for(CONFIG, 3, FPS))
    assert out.getpixel((20, 60)) == CONTENT_RGB  # the box's left edge
    assert out.getpixel((19, 22)) == BACKING_RGB  # the address's dark backing, above the box's top-left
    assert out.getpixel((70, 70)) == (0, 0, 0)  # inside the box: outline only, not filled
    assert out.getpixel((150, 80)) == (0, 0, 0)  # far from any label


def test_a_full_frame_picture_is_listed_in_the_legend_and_not_boxed():
    out = _draw(labels_for(CONFIG, 3, FPS))
    assert out.getpixel((0, 50)) == (0, 0, 0)  # no outline round the whole frame
    assert out.getpixel((3, 3)) == BACKING_RGB  # the legend strip, top-left
    strip = [out.getpixel((x, y)) for x in range(4, 120) for y in range(4, 18)]
    assert PICTURE_RGB in strip  # the legend line is written in the picture colour


def test_a_layer_below_five_percent_opacity_is_skipped():
    faint = Visible(clip_id="occ:c09.ghost", address="c09.ghost", track="content", z=0, role="content",
                    opacity=0.01, bounds=(20.0, 10.0, 80.0, 50.0), bounds_source="declared", full_frame=False)
    assert _draw([faint]).tobytes() == _blank().tobytes()


def test_labels_for_lists_the_layers_on_screen_top_first_and_not_the_ones_not_yet_started():
    assert [v.address for v in labels_for(CONFIG, 3, FPS)] == ["c02.card", "c01.field"]
    assert [v.z for v in labels_for(CONFIG, 3, FPS)] == [1, 2]  # z indexes every listed clip (c03 is z 0, off screen)
    assert addresses_at(CONFIG, 3, FPS) == ["c02.card", "c01.field"]
    assert addresses_at(CONFIG, 16, FPS) == ["c03.late", "c02.card", "c01.field"]  # c03 starts at 1.5 s, top track first


def _tile(path: Path, rgb) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (200, 100), rgb).save(path)
    return str(path)


def test_verify_with_labels_draws_the_addresses_on_the_page_tiles(tmp_path, monkeypatch):
    snapshot = {"fps_rational": [10, 1], "config": CONFIG, "registry": {"assets": {}}}
    pair = {"base_snapshot": snapshot, "working_snapshot": snapshot,
            "base_video": tmp_path / "base" / "v.mp4", "working_video": tmp_path / "work" / "v.mp4",
            "base_run": "run-base", "working_run": "run-work", "base_media": {}, "working_media": {}}

    def prepare_pair(client, project, timeline, draft, *, media_root):
        return pair

    def decode_frames(video, frames, out_dir):
        rgb = (90, 90, 90) if Path(out_dir).name == "published" else (200, 60, 60)
        return {int(f): _tile(Path(out_dir) / f"f{int(f):06d}.png", rgb) for f in frames}

    class Draft:
        def document(self):
            return {"doc": True}

    monkeypatch.setattr(fast_lane, "prepare_pair", prepare_pair)
    monkeypatch.setattr(fast_lane, "decode_frames", decode_frames)
    moments = [Moment(0.3, "a: a moment")]
    plain = fast_lane.verify(object(), "demo", "tl", moments, draft=Draft(), root=tmp_path / "plain")
    labelled = fast_lane.verify(object(), "demo", "tl", moments, draft=Draft(), root=tmp_path / "labelled",
                                labels=True)
    assert "labelled" not in plain["rows"][0]
    assert set(labelled["rows"][0]["labelled"]) == {"published", "working"}
    assert Path(labelled["rows"][0]["labelled"]["working"]).name.startswith("labelled-0-")
    assert Path(plain["page"]).read_bytes() != Path(labelled["page"]).read_bytes()


def test_the_labels_layer_is_registered_as_opt_in_for_the_contact_and_motion_views():
    layer = discover()["labels"]
    assert layer.default is False and layer.experimental is False
    assert "contact" in layer.views and "motion" in layer.views
    assert "labels" not in {item.name for item in resolve_layers(None, view="contact")}
    assert "labels" in {item.name for item in resolve_layers(["labels"], view="contact")}


def test_a_contact_tile_names_its_cut_and_chapter_and_keeps_the_cut_alone_without_one():
    assert cut_tile_label({"index": 13, "cut_id": "c09a"}, 1) == "c09a · ch02"  # the id, never the position
    assert cut_tile_label({"index": 8, "cut_id": "c08"}, -1) == "c08"
    assert cut_tile_label({"index": 8}, -1) == "#8"  # no id: say it is a position


def test_each_frame_index_row_lists_the_addresses_on_screen_top_first():
    receipt = {"cards": [{"id": "frame-000000030"}, {"id": "frame-000000003"}]}
    cards = [{"frame": 3}, {"frame": 16}]
    snapshot = {"config": CONFIG, "fps_rational": [10, 1]}
    attach_frame_addresses(receipt, snapshot, cards)
    assert receipt["cards"][0]["addresses"] == ["c02.card", "c01.field"]
    assert receipt["cards"][1]["addresses"] == ["c03.late", "c02.card", "c01.field"]
