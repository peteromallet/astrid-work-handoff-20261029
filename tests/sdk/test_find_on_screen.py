"""find: what is on screen, however deep (chat lines, terminal lines), the narration line's text, element=/role=
filters, and values printed in full (no "…" hiding them)."""
from __future__ import annotations

import copy

import pytest

from astrid.sdk.timeline.selection import ROLE_VOCABULARY
from astrid.sdk.timeline_address import describe_found, find
from astrid.sdk.timeline_checkout import Checkout, TimelineEditError

from tests.sdk.test_timeline_reflow_golden import film

TERMINAL_LINE = "hello from the terminal: deploy the rocket"  # 39 characters, one line of a nested list
LONG = ("word " * 30).strip()  # 149 characters
LONGER = "x" * 250


def _bundle():
    doc = copy.deepcopy(film())
    shot = doc["shots"]["F"]["internal_timeline"]
    # the narration line s1 says "One more thing, it went viral": the words the timing knows are "it went viral"
    for clip in shot["clips"]:
        if clip["id"] == "vo-s1":
            clip["app"]["text"] = "One more thing, it went viral."
    shot["clips"] += [
        # a terminal: its lines are a list of dicts, the text is nested two levels down
        {"id": "c1-term", "clipType": "am-terminal", "track": "type", "at": 0.0, "hold": 4.0,
         "params": {"lines": [{"text": "$ ls"}, {"text": "ready"}, {"text": "build ok"}, {"text": TERMINAL_LINE}]},
         "app": {"cut": "c1", "layer": "term"}},
        # a callout: its label is a plain param; it is a label by role
        {"id": "c1-callout", "clipType": "am-callout", "track": "type", "at": 1.0, "hold": 2.0,
         "params": {"label": "Ship it now"}, "app": {"cut": "c1", "layer": "callout", "role": "label"}},
        # long values: one of 149 characters (printed in full), one of 250 (cut at 200, and says how to see the rest)
        {"id": "c3-long", "clipType": "am-type", "track": "type", "at": 6.0, "hold": 1.0,
         "params": {"text": LONG}, "app": {"cut": "c3", "layer": "long"}},
        {"id": "c3-longer", "clipType": "am-type", "track": "type", "at": 7.0, "hold": 1.0,
         "params": {"text": LONGER}, "app": {"cut": "c3", "layer": "longer"}},
    ]
    return doc


@pytest.fixture
def tl():
    t = Checkout(_bundle())
    t.resolve()
    return t


def test_nested_chat_and_terminal_text_is_found_with_its_param_path(tl):
    hits = find(tl, "hello from the terminal")
    assert [(h.kind, h.address, h.where) for h in hits] == [("text", "c1.term", "params.lines[3].text")]
    assert hits[0].value == TERMINAL_LINE
    assert any("params.lines[3].text" in line for line in describe_found(tl, hits))


def test_a_narration_line_is_found_by_a_phrase_the_word_timing_does_not_carry(tl):
    hits = find(tl, "more thing")  # "more thing" is in the line's text, not in its timed words
    assert [(h.kind, h.line, h.address) for h in hits] == [("spoken", "s1", "s1")]
    lines = describe_found(tl, hits)
    assert lines[0].startswith("heard  s1") and "whole line s1" in lines[0]
    assert '"One more thing, it went viral."' in lines[0]


def test_element_filters_the_hits_exact_or_part_any_case(tl):
    assert [h.address for h in find(tl, "ship", element="callout")] == ["c1.callout"]
    assert [h.address for h in find(tl, "ship", element="CALLOUT")] == ["c1.callout"]
    assert find(tl, "hello", element="callout") == []  # the terminal is not a callout
    assert [h.address for h in find(tl, "hello", element="term")] == ["c1.term"]


def test_role_filters_by_the_models_role_and_rejects_an_unknown_one(tl):
    assert [h.address for h in find(tl, "ship", role="label")] == ["c1.callout"]
    assert find(tl, "ship", role="footage") == []  # a valid role that no clip here has
    assert "label" in ROLE_VOCABULARY
    with pytest.raises(TimelineEditError, match="no role 'nonsense'"):
        find(tl, "ship", role="nonsense")


def test_element_alone_lists_every_clip_of_that_element_with_address_and_span(tl):
    listed = find(tl, element="am-sprite")
    expected = sorted(c.address for c in tl.clips() if c.element == "am-sprite")
    assert expected, "the fixture has sprites"
    assert sorted(h.address for h in listed) == expected
    assert all(h.kind == "layer" and h.end > h.start for h in listed)
    out = describe_found(tl, listed)
    assert all(line.startswith("layer") for line in out[:-1]) and out[-1].startswith("next:")


def test_role_alone_lists_the_clips_with_that_role(tl):
    assert [h.address for h in find(tl, role="label")] == ["c1.callout"]


def test_a_150_character_value_is_printed_in_full_and_a_250_one_says_how_to_see_the_rest(tl):
    text = "\n".join(describe_found(tl, find(tl, "word word word")))
    assert LONG in text and "more characters" not in text
    text = "\n".join(describe_found(tl, find(tl, "xxxxxxxx")))
    assert "x" * 200 in text and "x" * 201 not in text
    assert "(50 more characters: timelines show TL --project P c3.longer --full)" in text
