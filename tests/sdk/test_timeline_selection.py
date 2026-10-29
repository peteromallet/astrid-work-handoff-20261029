"""Selections (API.md §4.1–§4.2): every collection filters itself; legacy calls keep their answers."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline.api import Selection, SelectorError, parse_selector
from astrid.sdk.timeline_checkout import Checkout, TimelineEditError

ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing"


def tiny(name: str = "tiny.json") -> Checkout:
    return Checkout(json.loads((ROOT / name).read_text(encoding="utf-8")))


def ids(items) -> list[str]:
    return [item.id for item in items]


def with_chapters(tl: Checkout, *rows) -> Checkout:
    intent.set_chapters(tl.bundle, [{"name": name, "from": cut} for name, cut in rows])
    return Checkout(tl.bundle)


# ---- the string form -------------------------------------------------------------

def test_parse_selector_reads_key_value_pairs_quotes_and_lists():
    assert parse_selector('chapter=02 role=label text="the year"') == {"chapter": "02", "role": "label", "text": "the year"}
    assert parse_selector("cut=c06,c07") == {"cut": ["c06", "c07"]}
    assert parse_selector("cut=c06..c09a time=10..20") == {"cut": "c06..c09a", "time": "10..20"}
    assert parse_selector("") == {}


@pytest.mark.parametrize("bad", ["chapter", "=02", "text=\"open", "cut=c1 cut=c2", "cut="])
def test_parse_selector_refuses_malformed_selectors(bad):
    with pytest.raises(SelectorError):
        parse_selector(bad)


def test_selector_error_is_a_timeline_edit_error():
    assert issubclass(SelectorError, TimelineEditError)


# ---- the collection itself -------------------------------------------------------

def test_collections_are_selections_of_their_kind_in_order():
    tl = tiny()
    assert isinstance(tl.clips, Selection) and tl.clips.kind == "clip"
    assert isinstance(tl.cuts, Selection) and tl.cuts.kind == "cut"
    assert isinstance(tl.words, Selection) and tl.words.kind == "word"
    assert isinstance(tl.lines, Selection) and tl.lines.kind == "line"
    assert ids(tl.clips()) == ["a-music", "a-plate", "a-vo", "a-rocket", "b-plate", "b-type", "b-vo"]
    assert [c.n for c in tl.cuts()] == [1, 2]


def test_a_call_with_no_filter_is_the_whole_collection():
    tl = tiny()
    assert ids(tl.clips()) == ids(tl.clips)
    assert len(tl.clips(element=None)) == len(tl.clips)


def test_legacy_calls_return_what_they_returned_before():
    tl = tiny()
    assert ids(tl.clips(element="am-sprite")) == ["a-rocket"]
    assert ids(tl.clips(cut="c1")) == ["a-plate", "a-rocket"]
    assert ids(tl.clips(audio=True)) == ["a-music", "a-vo", "b-vo"]
    assert ids(tl.clips(audio=False)) == ["a-plate", "a-rocket", "b-plate", "b-type"]
    assert ids(tl.clips(shot=1)) == ["a-music", "a-plate", "a-vo", "a-rocket"]
    assert ids(tl.clips(track="plate")) == ["a-plate", "b-plate"]
    assert [w.id for w in tl.words(between=(1.0, 5.0))] == ["s1:2"]
    assert [w.id for w in tl.words()] == ["s1:0", "s1:1", "s1:2", "s2:0", "s2:1"]
    assert [v.segment for v in tl.lines()] == ["s1", "s2"]
    assert [[c.id for c in cut.clips] for cut in tl.cuts] == [["a-plate", "a-rocket"], ["b-plate", "b-type"]]


def test_a_filter_that_matches_nothing_is_empty_not_an_error():
    tl = tiny()
    assert tl.clips(element="am-nothing") == []
    assert isinstance(tl.clips(element="am-nothing"), Selection)
    assert tl.words(text="zebra") == []


# ---- clip filters ------------------------------------------------------------------

def test_element_takes_the_full_name_or_the_sheet_short_form():
    tl = tiny()
    assert ids(tl.clips(element="am-type")) == ["b-type"]
    assert ids(tl.clips(element="type")) == ["b-type"]


def test_asset_is_case_insensitive():
    assert ids(tiny().clips(asset="p")) == ["a-plate", "a-vo", "b-vo"]


def test_text_is_a_normalized_substring_a_regex_or_a_has_text_test():
    tl = tiny()
    assert ids(tl.clips(text="live")) == ["b-type"]
    assert ids(tl.clips(text="/^LI/")) == ["b-type"]
    assert ids(tl.clips(text=True)) == ["b-type"]
    assert ids(tl.clips(text="true")) == ["b-type"]
    assert tl.clips(text="nowhere") == []


def test_track_and_audio_and_shot_filters():
    tl = tiny()
    assert ids(tl.clips(track="sprite")) == ["a-rocket"]
    assert ids(tl.clips(audio=True, shot="B")) == ["b-vo"]
    assert ids(tl.clips(shot="B")) == ["b-plate", "b-type", "b-vo"]


def test_a_list_value_is_or_and_separate_keys_are_and():
    tl = tiny()
    assert ids(tl.clips(element=["am-type", "am-sprite"])) == ["a-rocket", "b-type"]
    assert ids(tl.clips(element=["am-type", "am-sprite"], shot="B")) == ["b-type"]


def test_one_cut_by_number_or_id_or_time_keeps_today_s_meaning():
    tl = tiny()
    assert ids(tl.clips(cut=2)) == ["b-plate", "b-type"]
    assert ids(tl.clips(cut="c2")) == ["b-plate", "b-type"]
    assert ids(tl.clips(cut="@5")) == ["b-plate", "b-type"]


def test_cut_as_a_list_or_a_comma_string_is_the_union_and_a_range_is_inclusive():
    tl = tiny()
    # a-music and a-vo carry no cut id, so the cuts' clips are the four placed ones
    four = ["a-plate", "a-rocket", "b-plate", "b-type"]
    assert ids(tl.clips(cut=["c1", "c2"])) == four
    assert ids(tl.clips("cut=c1,c2")) == four
    assert ids(tl.clips(cut="c1..c2")) == four
    assert ids(tl.clips(cut="c2..c2")) == ["b-plate", "b-type"]


def test_chapter_from_labels_and_by_number_or_name():
    tl = with_chapters(tiny(), ("01 OPEN", "c1"), ("02 THE VISION", "c2"))
    assert ids(tl.clips(chapter="02")) == ["b-plate", "b-type", "b-vo"]
    assert ids(tl.clips(chapter=1)) == ["a-music", "a-plate", "a-vo", "a-rocket"]
    assert ids(tl.clips(chapter="02 the vision")) == ["b-plate", "b-type", "b-vo"]
    # the clips with no cut id are placed by the cut on screen at their start (a-music, a-vo start in c1)
    assert ids(tl.clips(chapter="01")) == ["a-music", "a-plate", "a-vo", "a-rocket"]


def test_consecutive_labels_with_one_name_are_one_chapter():
    tl = with_chapters(tiny(), ("01 OPEN", "c1"), ("01 OPEN", "c2"))
    assert [c.id for c in tl.clips(chapter="01")] == ids(tl.clips)
    with pytest.raises(SelectorError, match="no chapter '02'"):
        tl.clips(chapter="02")


def test_chapter_without_labels_is_the_shot_and_an_unknown_chapter_lists_the_chapters():
    tl = tiny()
    assert len(tl.clips(chapter="SHOT")) == len(tl.clips)
    with pytest.raises(SelectorError, match="chapters are"):
        with_chapters(tiny(), ("01 OPEN", "c1")).clips(chapter="99")


def test_role_from_the_clip_its_element_or_its_audio_track():
    tl = tiny()
    tl.clip("a-rocket").data.setdefault("app", {})["role"] = "label"
    assert ids(tl.clips(role="label")) == ["a-rocket"]
    assert ids(tl.clips(role="voice")) == ["a-vo", "b-vo"]
    assert ids(tl.clips(role="music")) == ["a-music"]


def test_role_outside_the_vocabulary_and_unused_is_refused_with_the_list():
    with pytest.raises(SelectorError, match="the roles are"):
        tiny().clips(role="lable")


def test_time_is_on_screen_at_a_point_or_overlapping_a_range():
    tl = tiny()
    assert ids(tl.clips(time="1.5")) == ["a-music", "a-plate", "a-vo", "a-rocket"]
    assert ids(tl.clips(time="4.5")) == ["b-plate", "b-type"]
    assert ids(tl.clips(time="6..7")) == ["b-plate", "b-vo"]
    assert ids(tl.clips(time=(6.0, 7.0))) == ["b-plate", "b-vo"]


def test_a_callable_and_a_selector_string_compose_with_keywords():
    tl = tiny()
    assert ids(tl.clips(lambda c: c.start >= 4.0, track="plate")) == ["b-plate"]
    assert ids(tl.clips("cut=c1 track=sprite")) == ["a-rocket"]
    assert ids(tl.clips("cut=c1")(track="sprite")) == ["a-rocket"]


def test_an_unknown_key_is_refused_and_the_valid_keys_are_listed():
    with pytest.raises(SelectorError, match="the keys are: element"):
        tiny().clips(colour="red")


# ---- cuts, words, lines -------------------------------------------------------------

def test_cuts_filter_by_chapter_cut_time_and_has():
    tl = with_chapters(tiny(), ("01 OPEN", "c1"), ("02 THE VISION", "c2"))
    assert [c.id for c in tl.cuts(chapter="02")] == ["c2"]
    assert [c.n for c in tl.cuts(cut="c1")] == [1]
    assert [c.n for c in tl.cuts(time="5")] == [2]
    assert [c.n for c in tl.cuts(has="track=sprite")] == [1]
    assert [c.n for c in tl.cuts(has='text=true')] == [2]


def test_words_filter_by_text_phrase_line_time_and_between():
    tl = tiny()
    assert ids(tl.words(text="viral")) == ["s1:2"]
    assert ids(tl.words(text="went viral")) == ["s1:1"]
    assert ids(tl.words(line="s2")) == ["s2:0", "s2:1"]
    assert ids(tl.words(time="1.5")) == ["s1:2"]
    assert ids(tl.words(between=(0.0, 7.0))) == ["s1:0", "s1:1", "s1:2", "s2:0", "s2:1"]
    assert ids(tl.words(between=(0.0, 6.0))) == ["s1:0", "s1:1", "s1:2"]


def test_lines_filter_by_text_and_time():
    tl = tiny()
    assert [v.segment for v in tl.lines(text="live now")] == ["s2"]
    assert [v.segment for v in tl.lines(time="1")] == ["s1"]


def test_a_collection_filter_keyword_must_belong_to_its_kind():
    with pytest.raises(SelectorError, match="no filter 'element' for words"):
        tiny().words(element="am-type")


# ---- indexing, one, sorted ------------------------------------------------------------

def test_string_index_is_the_one_item_by_address_id_or_text():
    tl = tiny()
    assert tl.clips["c1.rocket"].id == "a-rocket"
    assert tl.clips["b-type"].text == "Live."
    assert tl.cuts["c2"].n == 2
    assert tl.cuts["c1"].id == "c1"
    assert tl.lines["s1"].segment == "s1"
    assert tl.words["viral"].id == "s1:2"
    assert tl.words["s2:1"].text == "now"


def test_string_index_refuses_no_match_and_several_matches_listing_the_candidates():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="no clip matches 'nope'"):
        tl.clips["nope"]
    # a second "viral" on the same VO clip: the word is no longer unique, so the index refuses
    tl.clip("a-vo").data["app"]["astrid"]["words"].append([1.95, 1.99, "viral"])
    with pytest.raises(TimelineEditError, match="matches 2 words"):
        tl.words["viral"]


def test_one_returns_the_only_item_and_refuses_otherwise():
    tl = tiny()
    assert tl.clips(element="am-sprite").one().id == "a-rocket"
    with pytest.raises(TimelineEditError, match="found 0"):
        tl.clips(element="am-nothing").one()
    with pytest.raises(TimelineEditError, match="found 7"):
        tl.clips.one()


def test_slices_are_selections_and_sorted_orders_by_an_attribute_or_a_function():
    tl = tiny()
    head = tl.clips[:2]
    assert isinstance(head, Selection) and head.kind == "clip" and len(head) == 2
    assert ids(tl.clips.sorted("start", reverse=True))[0] == "b-vo"
    assert ids(tl.clips.sorted(lambda c: c.id))[0] == "a-music"
    assert [c.start for c in tl.clips.sorted("start")] == sorted(c.start for c in tl.clips)


# ---- the read properties added by this ticket ----------------------------------------------

def test_cut_id_clip_cut_alias_and_the_cut_and_voice_collections():
    tl = tiny()
    cut = tl.cuts[0]
    assert cut.id == "c1"
    assert tl.clip("a-rocket").cut == "c1" == tl.clip("a-rocket").cut_id
    assert isinstance(cut.clips, Selection) and cut.clips.kind == "clip"
    assert ids(cut.clips) == ["a-plate", "a-rocket"]
    assert isinstance(cut.words, Selection) and cut.words.kind == "word"
    assert [w.id for w in cut.words] == ["s1:0", "s1:1", "s1:2"]
    assert isinstance(tl.voice("s1").words, Selection)
    assert [w.id for w in tl.voice("s1").words] == ["s1:0", "s1:1", "s1:2"]
    assert tl.voice("s1").words(text="viral")[0].id == "s1:2"
