"""CK4: the astrid-intent schema (schemas/astrid-intent) validates what the A1 code writes.

(a) the S0 film (tests/editing_conformance/test_platform_safety_net.py, its `film` builder) is checked out
    and its clip and film intent validate; (b) an old-only film validates after migration; (c) a clash keeps
    the legacy value under _legacy and still validates; (d) clearly invalid objects fail.

Nothing is written outside the S0 builder's temp dir, which this module removes after each test.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from jsonschema import Draft202012Validator  # noqa: E402

from astrid.core.timeline import astrid_ns as ns  # noqa: E402
from astrid.sdk import timeline_checkout as tc  # noqa: E402
from astrid.sdk.timeline_checkout import Checkout  # noqa: E402

# The S0 builder: the `film` fixture makes a CLI film with clip, sequence, chapter, slot and cut-note intent.
from tests.editing_conformance.test_platform_safety_net import PROJECT, TIMELINE, film  # noqa: E402,F401

REPO = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO / "schemas" / "astrid-intent" / "astrid-intent.schema.json"
TINY = REPO / "tests" / "fixtures" / "timeline_editing" / "tiny.json"


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _validator(def_name: str) -> Draft202012Validator:
    """A validator for one definition (clipIntent or filmIntent) of the schema."""
    schema = _schema()
    return Draft202012Validator({"$schema": schema["$schema"], "$ref": f"#/$defs/{def_name}", "$defs": schema["$defs"]})


def _errors(def_name: str, instance) -> list[str]:
    return [e.message for e in _validator(def_name).iter_errors(instance)]


def _flat_legacy(bundle: dict) -> list[str]:
    found = []
    for shot in bundle["shots"].values():
        for clip in (shot.get("internal_timeline") or {}).get("clips") or []:
            found += [k for k in (clip.get("app") or {}) if k in ns.CLIP_INTENT_KEYS]
    found += [k for k in (bundle.get("parent") or {}).get("config") or {} if k in ns.FILM_INTENT_KEYS]
    return found


def _validate_bundle(bundle: dict) -> tuple[int, int]:
    """Validate every clip's app.astrid and the film's parent.config.app.astrid. Returns (clips, films) checked."""
    clips = films = 0
    for shot in bundle["shots"].values():
        for clip in (shot.get("internal_timeline") or {}).get("clips") or []:
            if "astrid" in (clip.get("app") or {}):
                assert _errors("clipIntent", clip["app"]["astrid"]) == [], clip["id"]
                clips += 1
    config = (bundle.get("parent") or {}).get("config") or {}
    if "astrid" in (config.get("app") or {}):
        assert _errors("filmIntent", config["app"]["astrid"]) == []
        films += 1
    return clips, films


def _legacy_bundle() -> dict:
    """tiny.json with intent in the OLD places only (flat clip.app keys, loose parent.config keys)."""
    bundle = json.loads(TINY.read_text(encoding="utf-8"))
    clips = bundle["shots"]["A"]["internal_timeline"]["clips"]
    clips[0]["app"] = {"on": 'start of "viral"', "cut": "c1", "layer": "hero", "kind": "keep-me",
                       "formulas": {"params.x": {"word": "viral", "field": "start"}}}
    config = bundle.setdefault("parent", {}).setdefault("config", {})
    config["chapters"] = [{"name": "01 OPEN", "from": "c1"}]
    config["slots"] = {"hero": {"kind": "footage"}}
    config["cut_notes"] = {"c1": {"why": "the opener"}}
    return bundle


@pytest.fixture
def s0_film(film):  # noqa: F811 - the S0 builder; its temp dir is removed after the test
    yield film
    shutil.rmtree(film, ignore_errors=True)


def test_schema_is_valid_draft_2020_12():
    schema = _schema()
    Draft202012Validator.check_schema(schema)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert set(schema["$defs"]) >= {"clipIntent", "filmIntent"}


def test_s0_film_checkout_round_trips_through_schema(s0_film, monkeypatch):
    """(a) the S0 film, checked out again after its save: no legacy left, and its intent validates."""
    tl = Checkout.draft(PROJECT, TIMELINE)
    assert _flat_legacy(tl.bundle) == [], "checkout left legacy intent keys behind"
    clips, films = _validate_bundle(tl.bundle)
    assert clips >= 2, "the S0 film should carry clip-level app.astrid intent"
    assert films == 1, "the S0 film should carry film-level app.astrid intent"
    ns_film = tl.bundle["parent"]["config"]["app"]["astrid"]
    assert set(ns_film) == {"chapters", "slots", "cut_notes"}


def test_s0_film_on_disk_round_trips_through_schema(s0_film):
    """(a) the same film as saved to the working copy file validates too."""
    draft = tc.find_draft(PROJECT, TIMELINE)
    assert draft is not None, "the S0 film has no working copy"
    doc = json.loads(Path(draft).read_text(encoding="utf-8"))
    clips, films = _validate_bundle(doc)
    assert clips >= 2 and films == 1


def test_legacy_only_film_validates_after_migration():
    """(b) an old-only film: migrate it, then the moved intent validates and no legacy key remains."""
    bundle = _legacy_bundle()
    assert ns.migrate_bundle(bundle) is True
    assert _flat_legacy(bundle) == []
    clips, films = _validate_bundle(bundle)
    assert clips == 6 and films == 1  # six tiny.json clips carry intent; a-music carries none
    clip = bundle["shots"]["A"]["internal_timeline"]["clips"][0]
    assert clip["app"]["astrid"] == {
        "on": 'start of "viral"', "cut": "c1", "layer": "hero",
        "formulas": {"params.x": {"word": "viral", "field": "start"}},
    }
    assert clip["app"]["kind"] == "keep-me", "non-intent app keys stay where they are"


def test_clash_keeps_legacy_value_under_legacy_and_still_validates():
    """(c) a namespace value that differs from the legacy one wins; the legacy one is kept in _legacy."""
    bundle = _legacy_bundle()
    clip = bundle["shots"]["A"]["internal_timeline"]["clips"][0]
    clip["app"]["astrid"] = {"on": "new"}
    bundle["parent"]["config"]["app"] = {"astrid": {"chapters": [{"name": "00 NEW", "from": "c9"}]}}
    assert ns.migrate_bundle(bundle) is True
    assert bundle["shots"]["A"]["internal_timeline"]["clips"][0]["app"]["astrid"]["on"] == "new"
    assert clip["app"]["astrid"]["_legacy"] == {"on": 'start of "viral"'}
    config_ns = bundle["parent"]["config"]["app"]["astrid"]
    assert config_ns["chapters"] == [{"name": "00 NEW", "from": "c9"}]
    assert config_ns["_legacy"] == {"chapters": [{"name": "01 OPEN", "from": "c1"}]}
    _validate_bundle(bundle)


def test_sequence_schema_accepts_real_writer_and_preserves_legacy():
    from astrid.sdk import timeline_intent as intent
    clip = {'id': 'sequence-schema-proof', 'app': {'sequence': 'old-seq', 'sequence_index': 7}}
    intent.set_sequence(clip, 'seq-1', 1)
    actual = clip['app']['astrid']
    assert actual['sequence'] == {'id': 'seq-1', 'index': 1}
    assert 'sequence_index' not in actual and 'sequence_index' not in clip['app']
    assert intent.sequence(clip) == ('seq-1', 1)
    assert _errors('clipIntent', actual) == []
    legacy = {'sequence': 'old-seq', 'sequence_index': 7}
    assert _errors('clipIntent', legacy) == []
    assert intent.sequence({'app': {'astrid': legacy}}) == ('old-seq', 7)


@pytest.mark.parametrize("instance", [
    {'sequence': {'id': 'seq-1'}},
    {'sequence': {'index': 0}},
    {'sequence': {'id': 7, 'index': 0}},
    {'sequence': {'id': 'seq-1', 'index': '1'}},
    {'sequence': {'id': 'seq-1', 'index': True}},
    {'sequence': {'id': 'seq-1', 'index': -1}},
    {'sequence': {'id': 'seq-1', 'index': 0, 'bogus': True}},
    {"cut": 7},                                # wrong type
    {"sequence_index": -1},                    # below minimum
    {"role": "source"},                        # not in ROLE_VOCABULARY (the M2 role is not a vocabulary word)
    {"bogus_key": 1},                          # a key the module does not own
    {"words": [[0.1, 0.3]]},                   # a word row needs [start, end, text]
    {"beats": {"bpm": 120}},                   # a beat grid needs beats
    {"_legacy": {"bad key!": 1}},              # legacy names are identifiers (key or key#2)
])
def test_invalid_clip_intent_fails(instance):
    """(d) clearly invalid clip intent is rejected."""
    assert _errors("clipIntent", instance), f"expected a failure for {instance!r}"


@pytest.mark.parametrize("instance", [
    {"chapters": [{"name": "01 OPEN"}]},                     # a chapter needs from
    {"cut_notes": {"c1": {"bogus": True}}},                  # a cut note only has why, why_layers, hold
    {"slots": "hero"},                                       # slots is a table
    {"bogus": 1},                                            # a key the module does not own
])
def test_invalid_film_intent_fails(instance):
    """(d) clearly invalid film intent is rejected."""
    assert _errors("filmIntent", instance), f"expected a failure for {instance!r}"


def test_valid_minimal_intent_passes():
    assert _errors("clipIntent", {}) == []
    assert _errors("filmIntent", {}) == []
    assert _errors("clipIntent", {"beats": [0.5, 1.0], "_legacy": {"on": "old", "on#2": "older"}}) == []
