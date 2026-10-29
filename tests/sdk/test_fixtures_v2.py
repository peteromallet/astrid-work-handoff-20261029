"""The v2 scenario fixtures (tests/editing_scenarios/fixtures): tiny3, tiny3-reflowed, empty."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline_checkout import Checkout

FIXTURES = Path(__file__).resolve().parents[1] / "editing_scenarios" / "fixtures"
NAMES = ["tiny3", "tiny3-reflowed", "empty"]


def _load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", NAMES)
def test_fixture_loads(name):
    tl = Checkout(_load(name))
    assert tl.bundle["schema_version"] == 1


@pytest.mark.parametrize("name", ["tiny3", "empty"])
def test_fixture_is_valid(name):
    report = Checkout(_load(name)).check()
    assert report.valid is True
    assert report.blocking == []


def test_tiny3_has_three_cuts_five_words_two_lines():
    tl = Checkout(_load("tiny3"))
    assert [c.picture.cut_id for c in tl.cuts] == ["c1", "c2", "c3"]
    assert len(tl.words()) == 5
    assert len(tl.lines()) == 2
    assert tl.duration == pytest.approx(12.0)


def test_tiny3_word_moments_and_beats():
    tl = Checkout(_load("tiny3"))
    assert tl.time('"two"') == pytest.approx(4.0)
    assert tl.time('"three"') == pytest.approx(8.0)
    assert tl.time('beat 1 after "one"') == pytest.approx(0.5)


def test_tiny3_chapters():
    tl = Checkout(_load("tiny3"))
    assert intent.chapters(tl.bundle) == [{"name": "01 OPEN", "from": "c1"}, {"name": "02 MIDDLE", "from": "c2"}]
    assert [c.picture.cut_id for c in tl.cuts(chapter="02")] == ["c2", "c3"]


def test_tiny3_has_base_fields_and_no_edits():
    bundle = _load("tiny3")
    for shot in bundle["shots"].values():
        assert "base_payload" in shot and "base_internal_timeline" in shot
    assert Checkout(bundle).edits()["changes"] == []


def test_edit_on_tiny3_shows_in_edits():
    tl = Checkout(_load("tiny3"))
    tl.clip("c2-title").set(text="Two!")
    changed = [row["clip_id"] for row in tl.edits()["changes"]]
    assert "c2-title" in changed


def test_reflowed_differs_only_in_s2_words():
    base = _load("tiny3")
    reflowed = _load("tiny3-reflowed")
    for doc in (base, reflowed):
        for shot in doc["shots"].values():
            for clip in shot["internal_timeline"]["clips"]:
                if clip["id"] == "a-vo2":
                    clip["app"].pop("words")
    assert base == reflowed
    old = _load("tiny3")["shots"]["A"]["internal_timeline"]["clips"]
    new = _load("tiny3-reflowed")["shots"]["A"]["internal_timeline"]["clips"]
    old_words = next(c for c in old if c["id"] == "a-vo2")["app"]["words"]
    new_words = next(c for c in new if c["id"] == "a-vo2")["app"]["words"]
    assert [[round(a + 1.0, 3), round(b + 1.0, 3), t] for a, b, t in old_words] == new_words
    # every other clip is byte-identical
    strip = lambda d: [c for c in d["shots"]["A"]["internal_timeline"]["clips"] if c["id"] != "a-vo2"]
    assert strip(_load("tiny3")) == strip(_load("tiny3-reflowed"))


def test_empty_is_one_cut_one_plate_no_vo_no_music():
    tl = Checkout(_load("empty"))
    assert tl.duration == pytest.approx(2.0)
    assert [c.picture.cut_id for c in tl.cuts] == ["c1"]
    assert len(tl.lines()) == 0
    assert all(not c.is_audio for c in tl.clips())
