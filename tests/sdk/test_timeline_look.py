"""clip.look: the clip-level fields (read, write, refuse, render note), Clip.set routing, tag, move_to_cut, Cut.set_note."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from astrid.core.timeline import clip_fields as cf
from astrid.sdk.timeline.look import Look, look_unrendered, render_kind
from astrid.sdk.timeline_checkout import Checkout, TimelineEditError

TINY = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing" / "tiny.json"


def tiny() -> Checkout:
    return Checkout(json.loads(TINY.read_text(encoding="utf-8")))


def steps(tl: Checkout) -> int:
    return len(tl._journal)


def test_defaults_read_as_none_and_look_is_a_mapping():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    assert isinstance(rocket.look, Look)
    assert rocket.look["opacity"] is None
    assert rocket.look["entrance"] is None
    assert rocket.look.describe() == {}


def test_iteration_covers_only_the_fields_that_apply():
    tl = tiny()
    visual = set(tl.clip("c1.rocket").look)
    audio = set(tl.clip("a-music").look)
    assert "opacity" in visual and "entrance" in visual and "crop_left" in visual
    assert "opacity" not in audio and "crop_left" not in audio
    assert "volume" in audio and "fade_in" in audio
    assert len(tl.clip("c1.rocket").look) == len(visual)
    with pytest.raises(KeyError):
        tl.clip("c1.rocket").look["no_such_field"]
    with pytest.raises(KeyError):
        tl.clip("a-music").look["opacity"]


def test_set_opacity_and_entrance_store_where_clip_fields_says():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    rocket.look.set(opacity=0.6, entrance="fade 8f")
    assert rocket.data["opacity"] == 0.6
    assert rocket.data["entrance"]["type"] == "fade"
    assert rocket.data["entrance"]["duration"] == pytest.approx(8 / 30, abs=1e-4)  # stored to 4 places
    assert rocket.look["opacity"] == 0.6
    assert rocket.look.describe()["opacity"] == "0.6"


def test_bad_value_is_refused_and_nothing_is_written():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    before = steps(tl)
    with pytest.raises(TimelineEditError, match="not a entrance animation"):
        rocket.look.set(opacity=0.5, entrance="zzz")  # the second value is a bad animation name
    assert rocket.data.get("opacity") is None
    assert rocket.data.get("entrance") is None
    assert steps(tl) == before


def test_crop_sum_across_fields_is_refused_all_or_nothing():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    with pytest.raises(TimelineEditError, match="empty"):
        rocket.look.set(opacity=0.5, crop_left=0.7, crop_right=0.5)
    assert rocket.data.get("opacity") is None
    assert rocket.data.get("cropLeft") is None


def test_visual_field_on_an_audio_clip_is_refused():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="does not apply to an audio clip"):
        tl.clip("a-music").look.set(opacity=0.5)


def test_unknown_field_is_refused_and_lists_the_declared_ones():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="opacity"):
        tl.clip("c1.rocket").look.set(bogus=1)


def test_set_volume_on_a_media_clip_writes_the_top_level_field_and_leaves_params_alone():
    tl = tiny()
    music = tl.clip("a-music")
    music.set(volume=0.5)
    assert music.data["volume"] == 0.5
    assert "volume" not in (music.data.get("params") or {})
    assert abs(music.look["volume"] - 0.5) < 1e-9


def test_set_volume_on_an_element_that_declares_volume_keeps_writing_the_param():
    tl = tiny()
    rocket = tl.clip("a-rocket")
    rocket.data["clipType"] = "am-footage"  # am-footage declares volume in its element.yaml
    rocket.set(volume=0.3)
    assert rocket.params["volume"] == 0.3
    assert "volume" not in rocket.data


def test_a_reserved_name_that_is_not_available_yet_is_refused():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="not available yet"):
        tl.clip("c1.rocket").set(freeze=1)


def test_volume_on_am_sprite_is_stored_and_noted_as_unrendered():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    rocket.set(volume=0.4)
    assert rocket.data["volume"] == 0.4
    assert any(n.startswith("LOOK-UNRENDERED c1.rocket volume: am-sprite does not render it") for n in tl.notes)
    assert any("clip-level field" in n and "clip.look" in n for n in tl.notes)


def test_look_unrendered_lists_only_stored_fields_that_will_not_render():
    tl = tiny()
    assert look_unrendered(tl) == []
    tl.clip("c1.rocket").look.set(volume=0.4)
    tl.clip("a-music").look.set(volume=0.5)  # media renders volume: no line for it
    lines = look_unrendered(tl)
    assert len(lines) == 1
    assert lines[0].startswith("LOOK-UNRENDERED c1.rocket volume: am-sprite")
    assert "it is stored; it will show once supported" in lines[0]


def test_render_kind_names_the_clip_kind_the_table_knows():
    tl = tiny()
    assert render_kind(tl.clip("a-music")) == "audio"
    assert render_kind(tl.clip("c1.rocket")) == "element"
    assert render_kind(tl.clip("c1.plate")) == "element"  # am-snap-plate is not named in the table


def test_one_look_set_is_one_undo_step():
    tl = tiny()
    before = steps(tl)
    tl.clip("c1.rocket").look.set(opacity=0.5, entrance="fade 8f")
    assert steps(tl) == before + 1
    before = steps(tl)
    tl.clip("a-music").set(volume=0.5)
    assert steps(tl) == before + 1


def test_tag_role_is_written_and_none_removes_it():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    rocket.tag(role="sprite", style="pop")
    assert rocket.data["app"]["astrid"]["role"] == "sprite"
    assert rocket.data["app"]["astrid"]["style"] == "pop"
    rocket.tag(role=None)
    assert "role" not in rocket.data["app"]["astrid"]


def test_tag_refuses_a_role_outside_the_vocabulary_and_an_unknown_key():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    with pytest.raises(TimelineEditError, match="not in the vocabulary"):
        rocket.tag(role="hero")
    with pytest.raises(TimelineEditError, match="takes role, style, group or duck"):
        rocket.tag(colour="red")
    assert "role" not in rocket.data["app"]


def test_move_to_cut_keeps_the_offset_into_the_new_cut():
    tl = tiny()
    rocket = tl.clip("c1.rocket")
    offset = rocket.start - tl.cut(1).start
    rocket.move_to_cut("c2")
    assert rocket.cut_id == "c2"
    assert rocket.start - tl.cut(2).start == pytest.approx(offset, abs=0.01)


def test_move_to_cut_refuses_a_cut_picture_and_an_unknown_cut():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="cut's picture"):
        tl.clip("c1.plate").move_to_cut("c2")
    with pytest.raises(TimelineEditError, match="no cut c99"):
        tl.clip("c1.rocket").move_to_cut("c99")


def test_cut_set_note_writes_the_cut_level_note():
    tl = tiny()
    tl.cut(1).set_note(why="the opener", hold=True)
    note = tl.cut_note("c1")
    assert note["why"] == "the opener"
    assert note["hold"] == "deliberate"
    tl.cut(1).set_note(hold=False)
    assert "hold" not in tl.cut_note("c1")


def test_cut_set_note_refuses_a_cut_without_an_id():
    tl = tiny()
    cut = tl.cut(1)
    cut.raw = {**cut.raw, "clip": None}  # a cut whose picture is gone has no id
    with pytest.raises(TimelineEditError, match="no id"):
        cut.set_note(why="x")


def test_cf_fields_are_the_look_fields():
    # the look reads the one declaration; nothing is re-declared here
    assert "volume" in cf.FIELDS and "opacity" in cf.FIELDS


def test_check_reports_a_look_field_the_composition_will_not_render_without_blocking():
    """M-Core integration: check() lists LOOK-UNRENDERED as a (non-blocking) problem line."""
    import json
    from pathlib import Path

    from astrid.sdk.timeline_checkout import Checkout

    root = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing"
    tl = Checkout(json.loads((root / "tiny.json").read_text(encoding="utf-8")))
    tl.clip("c1.rocket").look.set(volume=0.5)  # volume is ignored on element clips at the pinned composition
    report = tl.check()
    lines = [p for p in report.problems if p.startswith("look ") and "LOOK-UNRENDERED" in p and "c1.rocket" in p]
    assert lines and not any("LOOK-UNRENDERED" in b for b in report.blocking)
