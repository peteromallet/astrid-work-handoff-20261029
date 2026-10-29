"""Splitting the last cut (or adding a cut inside it) must not make the film longer: the new picture takes only
what remains of the old one after the split point. A mid-film split is unchanged (its new picture ends at the next cut)."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline import store as _store
from astrid.sdk.timeline_checkout import Checkout

TINY = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing" / "tiny.json"


def tiny() -> dict:
    return json.loads(TINY.read_text(encoding="utf-8"))


def plate(tl: Checkout, address: str) -> tuple[float, float]:
    clip = next(c for c in tl.clips() if c.address == address)
    return clip.start, clip.end


def placement(tl: Checkout, sid: str) -> int:
    return next(int(p["duration_ms"]) for p in tl.document()["placements"] if p["shot_id"] == sid)


def test_add_cut_on_now_keeps_the_film_length():
    tl = Checkout(tiny())
    tl.add_cut('"now"')
    assert tl.duration == pytest.approx(8.0)
    assert placement(tl, "B") == 4000
    start, end = plate(tl, "c2a.plate")
    assert start == pytest.approx(6.4, abs=1e-3)
    assert end == pytest.approx(8.0, abs=1e-3)


def test_splitting_the_last_cut_on_now_keeps_the_film_length():
    tl = Checkout(tiny())
    tl.cut("c2").split('"now"')
    assert tl.duration == pytest.approx(8.0)
    assert placement(tl, "B") == 4000
    assert plate(tl, "c2a.plate") == pytest.approx((6.4, 8.0), abs=1e-3)


def test_mid_film_split_is_unchanged():
    tl = Checkout(tiny())
    tl.cut("c1").split('"went"')
    assert tl.duration == pytest.approx(8.0)
    assert plate(tl, "c1.plate") == pytest.approx((0.0, 0.9), abs=1e-3)
    assert plate(tl, "c1a.plate") == pytest.approx((0.9, 4.0), abs=1e-3)
    assert plate(tl, "c2.plate") == pytest.approx((4.0, 8.0), abs=1e-3)
    assert placement(tl, "A") == 4000
    assert placement(tl, "B") == 4000


def test_old_picture_ends_where_the_new_one_starts():
    tl = Checkout(tiny())
    tl.add_cut('"now"')
    old_start, old_end = plate(tl, "c2.plate")
    new_start, new_end = plate(tl, "c2a.plate")
    assert old_end == pytest.approx(new_start, abs=1e-6)
    assert old_start == pytest.approx(4.0, abs=1e-6)
    assert new_end == pytest.approx(8.0, abs=1e-6)


def test_footage_split_keeps_the_remaining_source_range():
    data = tiny()
    shot_b = data["shots"]["B"]["internal_timeline"]["clips"]
    picture = next(c for c in shot_b if c.get("track") == "plate")
    picture.pop("hold", None)
    picture["from"], picture["to"] = 1.0, 5.0  # 4.0 s of source
    tl = Checkout(data)
    tl.add_cut('"now"')
    assert tl.duration == pytest.approx(8.0)
    new = next(c for c in tl.document()["shots"]["B"]["internal_timeline"]["clips"] if intent.cut_of(c) == "c2a")
    assert new["from"] == pytest.approx(3.4, abs=1e-3)
    assert new["to"] == pytest.approx(5.0, abs=1e-3)


def test_undo_restores_the_film_after_a_split_on_the_last_cut(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(_store, "drafts_root", lambda: tmp_path)  # undo history is kept for drafts only
    tl = Checkout(tiny(), path=tmp_path / "work.checkout.json")
    tl.save(quiet=True)
    tl.add_cut('"now"')
    tl.save(quiet=True)  # the edit is one undo step
    assert tl.duration == pytest.approx(8.0)
    tl.undo()
    assert tl.duration == pytest.approx(8.0)
    assert placement(tl, "B") == 4000
    assert not any(c.address == "c2a.plate" for c in tl.clips())
    assert plate(tl, "c2.plate") == pytest.approx((4.0, 8.0), abs=1e-3)
