"""Element param VALUES are checked against element.yaml on every write path (Clip.set, the sheet): type, enum, range."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from astrid.sdk import timeline_address
from astrid.sdk.timeline.model import validate_param_value
from astrid.sdk.timeline._common import TimelineEditError
from astrid.sdk.timeline_checkout import Checkout
from astrid.sdk.timeline_sheet import SheetError, apply_sheet, render_sheet

TINY = Path(__file__).resolve().parents[1] / "fixtures" / "timeline_editing" / "tiny.json"


def tiny() -> Checkout:
    tl = Checkout(copy.deepcopy(json.loads(TINY.read_text(encoding="utf-8"))))
    tl.resolve()
    return tl


def test_enum_refuses_a_value_outside_the_schema_and_names_the_allowed_ones():
    tl = tiny()
    with pytest.raises(TimelineEditError, match=r'c2\.card\.reveal: "fade" is not allowed; reveal takes slideUp \| type \| none'):
        tl.clip("c2.card").set(reveal="fade")
    with pytest.raises(TimelineEditError, match=r'c1\.rocket\.enter: "fade" is not allowed; enter takes stamp \| slideIn \| cut'):
        tl.clip("c1.rocket").set(enter="fade")


def test_enum_allows_a_declared_value():
    tl = tiny()
    tl.clip("c2.card").set(reveal="type")
    tl.clip("c1.rocket").set(enter="stamp")
    assert tl.clip("c2.card").params["reveal"] == "type"
    assert tl.clip("c1.rocket").params["enter"] == "stamp"


def test_integer_range_refuses_above_the_maximum_and_below_the_minimum():
    tl = tiny()
    with pytest.raises(TimelineEditError, match=r"c1\.rocket\.scale: 30 is above its maximum 24"):
        tl.clip("c1.rocket").set(scale=30)
    with pytest.raises(TimelineEditError, match=r"c1\.rocket\.scale: 0 is below its minimum 1"):
        tl.clip("c1.rocket").set(scale=0)
    tl.clip("c1.rocket").set(scale=24)
    assert tl.clip("c1.rocket").params["scale"] == 24


def test_type_refuses_a_string_for_a_number_and_a_bool_for_a_number():
    tl = tiny()
    with pytest.raises(TimelineEditError, match=r'c1\.rocket\.scale: "big" is not an integer'):
        tl.clip("c1.rocket").set(scale="big")
    with pytest.raises(TimelineEditError, match=r"c1\.rocket\.scale: true is not an integer"):
        tl.clip("c1.rocket").set(scale=True)


def test_a_number_is_fine_where_an_integer_is_declared_and_a_px_position_is_a_number():
    validate_param_value("am-sprite", "scale", 2.0)
    validate_param_value("am-sprite", "x", "20px")
    validate_param_value("am-type", "size", "120px")
    with pytest.raises(TimelineEditError, match="flipX: 1 is not true or false"):
        validate_param_value("am-sprite", "flipX", 1)


def test_a_formula_value_is_not_checked():
    validate_param_value("am-sprite", "x", "ƒ(B2-HAND -42)")
    validate_param_value("am-sprite", "x", "f(-60)")
    validate_param_value("am-sprite", "scale", "ƒ(words of n05b)")


def test_a_moment_value_is_not_checked():
    validate_param_value("am-sprite", "x", '"viral"')
    validate_param_value("am-sprite", "x", 'after "viral"')
    tl = tiny()
    tl.clip("c1.rocket").set(x='"viral"')  # a moment puts the param on that moment; no number check on it


def test_an_undeclared_key_is_left_to_the_key_check():
    tl = tiny()
    with pytest.raises(TimelineEditError, match="has no param zzbogus"):
        tl.clip("c1.rocket").set(zzbogus="anything")
    validate_param_value("am-sprite", "zzbogus", "anything")  # the value check says nothing about an undeclared key


def test_a_nested_path_is_not_checked_in_this_ticket():
    validate_param_value("am-sprite", "keyframes[3].x", "not a number")


def test_all_or_nothing_when_one_key_is_bad():
    tl = tiny()
    before = copy.deepcopy(tl.clip("c1.rocket").data)
    with pytest.raises(TimelineEditError, match=r"c1\.rocket\.scale: 99 is above its maximum 24"):
        tl.clip("c1.rocket").set(enter="stamp", scale=99)
    assert tl.clip("c1.rocket").data == before
    assert "enter" not in tl.clip("c1.rocket").params


def test_the_logical_grid_range_is_checked_on_the_stored_value(monkeypatch):
    """am-sprite x is stored on a 6-px grid; a schema bound describes the STORED value, the message says so."""
    real = timeline_address.element_schema

    def bounded(element: str):
        schema = copy.deepcopy(real(element))
        if element == "am-sprite":
            schema["properties"]["x"]["maximum"] = 50
        return schema

    monkeypatch.setattr(timeline_address, "element_schema", bounded)
    validate_param_value("am-sprite", "x", 300, where="c1.rocket")  # stored 50: at the bound, allowed
    with pytest.raises(TimelineEditError, match=r"c1\.rocket\.x: 306 \(stored 51 on the logical grid\) is above its maximum 50"):
        validate_param_value("am-sprite", "x", 306, where="c1.rocket")


def test_the_sheet_refuses_a_bad_value_and_writes_nothing():
    tl = tiny()
    before = json.dumps(tl.bundle, sort_keys=True, default=str)
    sheet = render_sheet(tl)
    assert sheet.count('"Live."') == 1  # the c2 card's text: the only place this replace lands
    with pytest.raises(SheetError, match=r'c2\.card\.reveal: "fade" is not allowed; reveal takes slideUp \| type \| none'):
        apply_sheet(tl, sheet.replace('"Live."', '"Live." reveal=fade'))
    assert json.dumps(tl.bundle, sort_keys=True, default=str) == before


def test_the_sheet_refuses_a_bad_range_on_the_rocket():
    tl = tiny()
    sheet = render_sheet(tl)
    assert sheet.count("x=60") == 1
    with pytest.raises(SheetError, match=r"c1\.rocket\.scale: 30 is above its maximum 24"):
        apply_sheet(tl, sheet.replace("x=60", "x=60 scale=30"))


def test_tl_add_refuses_an_out_of_enum_value_before_the_clip_exists():
    tl = tiny()
    before = json.dumps(tl.bundle, sort_keys=True, default=str)
    with pytest.raises(TimelineEditError, match=r'am-type\.reveal: "fade" is not allowed; reveal takes slideUp \| type \| none'):
        tl.add("am-type", at=0.5, params={"text": "Hi.", "reveal": "fade"})
    assert json.dumps(tl.bundle, sort_keys=True, default=str) == before  # nothing was added


def test_tl_add_accepts_a_valid_value():
    tl = tiny()
    clip = tl.add("am-type", at=0.5, params={"text": "Hi.", "reveal": "type"})
    assert clip.params["reveal"] == "type"
