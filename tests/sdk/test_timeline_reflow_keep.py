"""Closing silence never deletes a clip whose anchor survives: it follows its anchor; an un-anchored clip
inside closed silence is kept as an orphan (listed, blocks publish). Free-time removal still deletes."""
from __future__ import annotations

import json
from pathlib import Path

from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline_checkout import Checkout

ROOT = Path(__file__).resolve().parents[1]


def tiny() -> Checkout:
    return Checkout(json.loads((ROOT / "fixtures" / "timeline_editing" / "tiny.json").read_text(encoding="utf-8")))


def shot_a_clips(tl: Checkout) -> list[dict]:
    sid = tl._shot_ids()[0]
    return tl._internal(sid)["clips"]


def add_loose(tl: Checkout, clip_id: str = "loose", at: float = 2.7, hold: float = 0.2) -> None:
    """An un-anchored clip (no cut, no ``on``) wholly inside the 2.5-5.9 s silence."""
    shot_a_clips(tl).append({"id": clip_id, "clipType": "am-sprite", "track": "sprite", "asset": "R", "at": at, "hold": hold,
                             "params": {"x": 5, "enter": "stamp"}})
    tl._mcache = None


def test_gap_after_keeps_the_cut_layer_and_it_follows_its_cut():
    tl = tiny()
    tl.voice("s1").set_gap_after(0.8)
    ids = {c.id for c in tl.clips()}
    assert "b-type" in ids
    assert tl.clip("b-type").start == tl.clip("b-plate").start


def test_close_gap_keeps_the_cut_layer_and_it_follows_its_cut():
    tl = tiny()
    tl.close_gap(before='"Live"')
    assert "b-type" in {c.id for c in tl.clips()}
    assert tl.clip("b-type").start == tl.clip("b-plate").start


def test_un_anchored_clip_in_closed_silence_becomes_an_orphan():
    tl = tiny()
    add_loose(tl)
    tl.voice("s1").set_gap_after(0.8)
    assert "loose" in {c.id for c in tl.clips()}
    assert any("loose" in line for line in tl.orphans())
    assert tl.check().valid is False


def test_free_time_ripple_delete_still_removes_un_anchored_clip():
    tl = tiny()
    add_loose(tl)
    tl.ripple_delete(2.6, 3.0)
    assert "loose" not in {c.id for c in tl.clips()}


def test_cut_wholly_inside_closed_silence_is_orphaned_not_lost():
    tl = tiny()
    shot_a_clips(tl).extend([
        {"id": "c9-plate", "clipType": "am-snap-plate", "track": "plate", "asset": "R", "at": 3.0, "hold": 0.5,
         "params": {}, "app": {"cut": "c9"}},
        {"id": "c9-layer", "clipType": "am-sprite", "track": "sprite", "asset": "R", "at": 3.1, "hold": 0.2,
         "params": {"x": 5, "enter": "stamp"}, "app": {"cut": "c9"}},
    ])
    tl._mcache = None
    tl.voice("s1").set_gap_after(0.8)
    assert "c9-layer" in {c.id for c in tl.clips()}
    assert intent.orphan(tl.clip("c9-layer").data)
    assert any("c9-layer" in line for line in tl.orphans())
