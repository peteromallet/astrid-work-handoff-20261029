"""Tests for astrid.core.timeline.music_edit (MUSIC-1): the bar-aligned, crossfaded bed cut."""

from __future__ import annotations

import copy

import pytest

from astrid.core.timeline.cuts import clip_duration
from astrid.core.timeline.music_edit import plan_keep_end

BARS = [i * 2.0 for i in range(31)]  # 0, 2, ..., 60
BEATS = [i * 0.5 for i in range(121)]


def _bed(**extra):
    bed = {"id": "bed", "at": 0.0, "from": 0.0, "to": 60.0, "volume": 1.0,
           "params": {"fadeIn": 0.5, "fadeOut": 1.0}, "app": {"kind": "music"}}
    bed.update(extra)
    return bed


def _end(clip):
    return clip["at"] + clip_duration(clip)


def test_remove_cuts_on_bar_and_crossfades():
    cut = plan_keep_end(_bed(), at=10.3, delta=-3.0, bars=BARS, beats=BEATS)
    assert cut.on_bar is True
    assert cut.seam_at == pytest.approx(10.0)
    assert cut.overlap == pytest.approx(0.25)
    assert cut.skipped == pytest.approx(3.0)
    assert cut.repeated == 0.0
    a, b = cut.pieces
    assert a["id"] == "bed"
    assert _end(a) == pytest.approx(10.125)
    assert a["params"]["fadeOut"] == pytest.approx(0.25)
    assert a["params"]["fadeIn"] == 0.5
    assert b["id"] == "bed:b"
    assert b["at"] == pytest.approx(9.875)
    assert b["from"] == pytest.approx(12.875)
    assert b["to"] == pytest.approx(60.0)
    assert b["params"]["fadeIn"] == pytest.approx(0.25)
    assert b["params"]["fadeOut"] == 1.0
    assert b["app"] == {"kind": "music", "split_from": "bed"}
    assert a["app"] == {"kind": "music"}


def test_remove_invariant_last_source_second_lands_on_new_end():
    cut = plan_keep_end(_bed(), at=10.3, delta=-3.0, bars=BARS)
    b = cut.pieces[-1]
    assert b["at"] + (b["to"] - b["from"]) == pytest.approx(60.0 - 3.0)
    assert _end(b) == pytest.approx(60.0 + (-3.0))


def test_open_repeats_music_and_keeps_end_on_new_end():
    cut = plan_keep_end(_bed(), at=10.3, delta=1.0, bars=BARS)
    assert cut.on_bar is True
    assert cut.seam_at == pytest.approx(10.0)
    assert cut.repeated == pytest.approx(1.0)
    assert cut.skipped == 0.0
    a, b = cut.pieces
    assert _end(a) == pytest.approx(10.125)
    assert b["at"] == pytest.approx(9.875)
    assert b["from"] == pytest.approx(8.875)  # 1.0 s of music before the seam is replayed
    assert _end(b) == pytest.approx(61.0)  # the bed's original end + delta


def test_no_bars_cuts_on_beat():
    cut = plan_keep_end(_bed(), at=10.3, delta=-3.0, beats=BEATS)
    assert cut.on_bar is False
    assert cut.seam_at == pytest.approx(10.0)
    assert cut.pieces[1]["from"] == pytest.approx(12.875)
    assert "on the beat" in cut.note


def test_no_bars_no_beats_cuts_at_raw_point():
    cut = plan_keep_end(_bed(), at=10.3, delta=-3.0)
    assert cut.on_bar is False
    assert cut.seam_at == pytest.approx(10.3)
    a, b = cut.pieces
    assert _end(a) == pytest.approx(10.425)
    assert b["at"] == pytest.approx(10.175)
    assert b["from"] == pytest.approx(13.175)
    assert _end(b) == pytest.approx(57.0)
    assert "no bar or beat before it" in cut.note


def test_bar_too_close_to_bed_start_falls_back_to_change():
    cut = plan_keep_end(_bed(), at=0.8, delta=-0.3, bars=BARS)
    assert cut.on_bar is False
    assert cut.seam_at == pytest.approx(0.8)
    assert "under 0.50 s" in cut.note


def test_speed_two_bed_skips_source_seconds_at_double_rate():
    bed = _bed(to=120.0, speed=2.0)
    cut = plan_keep_end(bed, at=10.3, delta=-3.0, bars=BARS)
    assert cut.seam_at == pytest.approx(10.0)
    assert cut.skipped == pytest.approx(6.0)
    a, b = cut.pieces
    assert a["to"] == pytest.approx(20.25)
    assert _end(a) == pytest.approx(10.125)
    assert b["at"] == pytest.approx(9.875)
    assert b["from"] == pytest.approx(25.75)
    assert _end(b) == pytest.approx(57.0)  # 60 s bed minus the 3 s removed
    assert b["to"] == pytest.approx(120.0)


def test_speed_two_opening_repeats_source_seconds():
    bed = _bed(to=120.0, speed=2.0)
    cut = plan_keep_end(bed, at=10.3, delta=1.0, bars=BARS)
    assert cut.repeated == pytest.approx(2.0)
    assert _end(cut.pieces[-1]) == pytest.approx(61.0)


def test_hold_form_bed_keeps_hold_form():
    bed = {"id": "bed", "at": 0.0, "hold": 60.0, "volume": 1.0, "params": {}}
    cut = plan_keep_end(bed, at=10.3, delta=-3.0, bars=BARS)
    a, b = cut.pieces
    assert "to" not in a and "to" not in b
    assert a["hold"] == pytest.approx(10.125)
    assert b["from"] == pytest.approx(12.875)
    assert b["hold"] == pytest.approx(47.125)
    assert b["params"]["fadeIn"] == pytest.approx(0.25)
    assert _end(b) == pytest.approx(57.0)


def test_skip_past_source_end_has_no_second_piece():
    bed = _bed(to=60.0)
    cut = plan_keep_end(bed, at=58.0, delta=-5.0, bars=BARS)
    assert len(cut.pieces) == 1
    assert cut.pieces[0]["params"]["fadeOut"] == pytest.approx(0.25)
    assert _end(cut.pieces[0]) == pytest.approx(58.125)
    assert cut.note == ("music: cut on the bar at 58.00 s, skips 5.00 s (2.50 bars), crossfade 0.25 s; "
                        "the music ends early: the removed span covers its end")


def test_repeat_before_source_start_plays_silence():
    cut = plan_keep_end(_bed(), at=1.0, delta=2.0)
    a, b = cut.pieces
    assert cut.repeated == pytest.approx(1.0)
    assert b["from"] == 0.0
    assert b["at"] == pytest.approx(2.0)
    assert _end(b) == pytest.approx(62.0)  # still lands on the bed's end + delta
    assert "0.88 s of silence" in cut.note


def test_repeat_reaching_source_start_has_no_silence():
    # the seam is bar 2.0; repeating 2 s needs source from 0.0 (less the crossfade half), so
    # B starts at the bed's start with no silence
    cut = plan_keep_end(_bed(), at=3.3, delta=2.0, bars=BARS)
    b = cut.pieces[-1]
    assert cut.repeated == pytest.approx(2.0)
    assert b["from"] == 0.0
    assert b["at"] == pytest.approx(2.0)
    assert _end(b) == pytest.approx(62.0)
    assert "silence" not in cut.note


def test_input_is_never_mutated():
    bed = _bed()
    before = copy.deepcopy(bed)
    bars = list(BARS)
    plan_keep_end(bed, at=10.3, delta=-3.0, bars=bars)
    plan_keep_end(bed, at=10.3, delta=2.0, bars=bars)
    plan_keep_end(bed, at=10.3, delta=0.0, bars=bars)
    assert bed == before
    assert bars == BARS
    cut = plan_keep_end(bed, at=10.3, delta=-3.0, bars=bars)
    cut.pieces[0]["params"]["fadeOut"] = 99
    assert bed == before


def test_under_one_frame_is_a_no_op():
    bed = _bed()
    cut = plan_keep_end(bed, at=10.3, delta=0.01, bars=BARS)
    assert len(cut.pieces) == 1
    assert cut.pieces[0] == bed
    assert cut.pieces[0] is not bed
    assert cut.overlap == 0.0
    assert cut.note == "music: no change to the music (the change is under one frame)"


def test_bed_not_spanning_change_is_unchanged():
    bed = _bed(at=20.0)
    cut = plan_keep_end(bed, at=10.3, delta=-3.0, bars=BARS)
    assert cut.pieces == [bed]
    assert cut.skipped == 0.0 and cut.repeated == 0.0
