"""Layer creation uses the same cut, moment and canvas units as SDK edits."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from astrid.packs.timeline import cli, cli_sweep
from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline_checkout import Checkout

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "timeline_editing" / "tiny.json"


@pytest.fixture
def draft(monkeypatch):
    tl = Checkout(json.loads(FIXTURE.read_text(encoding="utf-8")))
    monkeypatch.setattr(tl, "save", lambda **_kwargs: None)
    monkeypatch.setattr(cli, "_edit_checkout", lambda _parsed: tl)
    monkeypatch.setattr(cli_sweep, "touched_cuts", lambda *_args: set())
    monkeypatch.setattr(cli_sweep, "auto_sweep_after_edit", lambda *_args, **_kwargs: 0)
    return tl


def _run(*args):
    parsed = cli.build_parser(None).parse_args(["edit", "main", "--project", "p", *args])
    return parsed.handler(parsed)


def test_add_sprite_keeps_its_identity_moment_and_canvas_coordinates(draft):
    assert _run("--add-layer", "sprite", "--on", '"now"', "--layer", "pin", "--layer-asset", "R",
                "--for", "1.5", "--set", "x=600", "--set", "y=300", "--id", "new-pin") == 0
    clip = draft.clip("c2.pin")
    assert (clip.id, clip.element, clip.asset) == ("new-pin", "am-sprite", "R")
    assert (clip.start, clip.duration) == (pytest.approx(6.4), pytest.approx(1.5))
    assert intent.on(clip.data) == '"now"'
    assert (clip.get("x"), clip.get("y")) == (600, 300)


def test_add_type_until_a_moment_applies_look_fields(draft):
    assert _run("--add-layer", "am-type", "--on", '"Live"', "--until", '"now"', "--layer", "label",
                "--set", 'text="Now."', "--opacity", "0.6", "--entrance", "fade", "8f") == 0
    clip = draft.clip("c2.label")
    assert clip.text == "Now."
    assert clip.end == pytest.approx(draft.word("now").start)
    assert intent.until(clip.data) == '"now"'
    assert clip.data["opacity"] == 0.6
    assert clip.data["entrance"] == {"type": "fade", "duration": 0.2667}


@pytest.mark.parametrize("args,message", [
    (("--add-layer", "sprite"), "needs --on MOMENT"),
    (("--add-layer", "sprite", "--on", "1", "--clip", "c1.rocket"), "do not combine"),
    (("--add-layer", "sprite", "--on", "1", "--add-media", "Q"), "separate edits"),
    (("--add-layer", "sprite", "--on", "1", "--at", "2"), "does not take --at"),
    (("--add-layer", "sprite", "--on", "1", "--swap-asset", "R"), "does not take --swap-asset"),
    (("--add-layer", "sprite", "--on", "1", "--beats", "keep"), "does not take --beats"),
    (("--add-layer", "sprite", "--on", "1", "--remove"), "does not take --remove"),
])
def test_add_layer_refuses_ambiguous_or_incomplete_edits(draft, capsys, args, message):
    before = draft.document()
    assert _run(*args) == 2
    assert message in capsys.readouterr().err
    assert draft.document() == before


def test_add_layer_validates_params_and_rolls_back_a_refused_add(draft, capsys):
    before = draft.document()
    args = ("--add-layer", "sprite", "--on", "1", "--layer", "pin", "--set", "zzbogus=2")
    assert _run(*args) == 2
    assert "has no param zzbogus" in capsys.readouterr().err
    assert draft.document() == before
    assert _run(*args, "--allow-new-params") == 0
    assert draft.clip("c1.pin").params["zzbogus"] == 2
