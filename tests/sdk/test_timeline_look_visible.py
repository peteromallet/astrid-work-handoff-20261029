"""A clip-level look edit (opacity, entrance, audio fade) is a change everywhere an edit must be visible:
the diff (status, discard, tl.edits()), the changed cut, the plain-words change list, the verify moments and
the clip's show record. Root cause: diff_bundles compared only track, asset, params and app, so a top-level
clip field (clip_fields.yaml: opacity, entrance, exit, speed, volume, crop*, transition) was invisible.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from astrid.core.timeline import clip_fields as cf
from astrid.packs.rendering.actions.timeline_visualize.fast_lane import moments_from_changes
from astrid.sdk.timeline_address import describe_target, resolve
from astrid.sdk.timeline_checkout import Checkout
from astrid.sdk.timeline_cuts import diff_bundles, render_diff

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing" / "tiny.json"


def _tl() -> Checkout:
    """tiny.json with its pinned base recorded per shot, as a checked-out authoring bundle carries it."""
    bundle = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for shot in bundle["shots"].values():
        shot["base_internal_timeline"] = copy.deepcopy(shot["internal_timeline"])
        shot["base_payload"] = copy.deepcopy(shot["payload"])
    return Checkout(bundle)


def _look_changes(tl: Checkout) -> list[dict]:
    return [change for change in tl.edits()["changes"] if change["kind"] == "look" or "look" in change["fields"]]


def test_opacity_is_a_change_in_the_diff_and_the_cut_it_is_on():
    tl = _tl()
    cf.write(tl.clip("c1.rocket").data, "opacity", 0.6, fps=tl.fps)
    changes = _look_changes(tl)
    assert [(c["clip_id"], c["kind"], c["fields"]) for c in changes] == [("a-rocket", "look", ["look"])]
    assert tl.changed_cut_ids() == ["c1"]
    assert "(look changed)" in render_diff(tl.edits())


def test_opacity_shows_in_the_plain_words_change_list():
    tl = _tl()
    cf.write(tl.clip("c1.rocket").data, "opacity", 0.6, fps=tl.fps)
    lines = [line for line in tl.changes() if "look" in line]
    assert len(lines) == 1
    assert lines[0].startswith("✎ c1.rocket") and lines[0].endswith("look opacity 1 → 0.6")


def test_entrance_is_a_change_with_its_human_form():
    tl = _tl()
    cf.write(tl.clip("c2.card").data, "entrance", "fade 8f", fps=tl.fps)
    assert [c["clip_id"] for c in _look_changes(tl)] == ["b-type"]
    assert any("look entrance fade 8f (was none)" in line for line in tl.changes())


def test_an_audio_fade_is_a_look_change_not_a_params_change():
    tl = _tl()
    cf.write(tl.clip("a-music").data, "fade_in", "0.4s", fps=tl.fps, audio=True)
    [change] = _look_changes(tl)
    assert change["clip_id"] == "a-music" and change["fields"] == ["look"] and change["kind"] == "look"
    assert any("a-music" in line and "look fade_in" in line and "(was none)" in line for line in tl.changes())


def test_the_show_record_lists_the_clip_level_fields_that_are_not_default():
    tl = _tl()
    assert "  look" not in describe_target(tl, resolve(tl, "c1.rocket"))
    cf.write(tl.clip("c1.rocket").data, "opacity", 0.6, fps=tl.fps)
    cf.write(tl.clip("c1.rocket").data, "entrance", "fade 8f", fps=tl.fps)
    record = describe_target(tl, resolve(tl, "c1.rocket"))
    assert "  look    opacity 0.6 · entrance fade 8f" in record


def test_a_look_change_gives_verify_a_mid_clip_moment_on_its_clip():
    tl = _tl()
    cf.write(tl.clip("c1.rocket").data, "opacity", 0.6, fps=tl.fps)
    moments = moments_from_changes(tl.edits()["changes"], tl.fps, names={"a-rocket": "c1.rocket"})
    assert len(moments) == 1
    assert moments[0].clip == "a-rocket" and "c1.rocket (look) mid-clip" in moments[0].label


def test_an_edit_that_leaves_the_look_alone_keeps_its_diff_text():
    tl = _tl()
    tl.clip("c1.rocket").set(x=120)
    [change] = tl.edits()["changes"]
    assert change["kind"] == "changed" and change["fields"] == ["params"]
    assert not any("look" in line for line in tl.changes())
    assert render_diff(tl.edits()).splitlines()[-1].startswith("  changed  a-rocket")


def test_a_look_edit_that_is_undone_is_no_change():
    tl = _tl()
    cf.write(tl.clip("c1.rocket").data, "opacity", 0.6, fps=tl.fps)
    cf.write(tl.clip("c1.rocket").data, "opacity", None, fps=tl.fps)
    assert tl.edits()["changes"] == [] and tl.changed_cut_ids() == []


def test_diff_bundles_sees_a_top_level_clip_field_without_a_checkout():
    before = json.loads(FIXTURE.read_text(encoding="utf-8"))
    after = copy.deepcopy(before)
    clip = next(c for c in after["shots"]["A"]["internal_timeline"]["clips"] if c["id"] == "a-rocket")
    clip["opacity"] = 0.5
    diff = diff_bundles(before, after)
    assert [(c["clip_id"], c["kind"]) for c in diff["changes"]] == [("a-rocket", "look")]
