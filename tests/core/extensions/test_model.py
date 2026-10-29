"""X-1: the extension data model and manifest parsing (EXTENSIBILITY.md section 2, API.md section 2.2)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from astrid.core.extensions import (
    Contribution,
    Effects,
    ExtensionPoint,
    ManifestError,
    parse_contribution,
    parse_effects,
    parse_point,
    parse_ref,
)

# ---------------------------------------------------------------- the EXTENSIBILITY.md examples, verbatim

POINT_PALETTE = """\
description: A named colour palette that pixel.snap can quantise to.
version: 1
min_supported: 1
side: client                 # the only value accepted in v1 (§2.8)
cardinality: many            # many: all active, chosen by name | one: exactly one per use
effects_allowed: {mutates: false, io: []}    # §7.4: the most a contribution may declare
protocol: data               # data-only: the validated fields ARE the contribution
schema: palette/with.schema.json
template: palette/template/
"""

POINT_MASK_SOURCE = """\
description: A way to describe the mask for a transform from what the project already knows.
version: 1
min_supported: 1
side: client
cardinality: many
effects_allowed: {mutates: false, io: []}    # it returns a plan; the owner runs any admitted action (§2.8)
protocol: mask_source/protocol.py:MaskSource       # a typing.Protocol (pluggy's "hookspec")
schema: mask_source/with.schema.json
harness: mask_source/harness.py:check               # optional; the generic checks always run
docs: mask_source/docs.py:describe                  # optional; default = a table generated from `schema`
template: mask_source/template/
"""

CONTRIB_DUCK = """\
api: 1                                    # the point version written against (API.md §9: N and N-1 load)
effects: {mutates: true, touches: [audio], io: []}   # API.md §G.3; mutates = operations only, via the Operation runner (§7.4)
entry: duck-under-voice.py:apply          # relative to this file; first-party code may use "pkg.module:func"
summary: Lower the music under narration (declarative; re-derived after any re-flow).
example: timelines edit TL --op duck-under-voice --db -9
status: active                            # active | experimental (only when named) | deprecated
# deprecated: {since: 0.3.0, use: timeline_kit.duck, remove_after: 2027-01-01}
# point-specific fields, validated by timeline.operation's schema (= API.md §3.1):
selection: none
scope: timeline
args:
  db: {type: number, default: -9, help: level under the voice, dB}
"""

CONTRIB_GAMEBOY = """\
api: 1
effects: none                             # data-only (≡ {mutates: false, io: []}, no entry)
summary: Four-green Game Boy palette.
example: astrid pixel snap … --palette gameboy
colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]
"""

CONTRIB_STAGGER = """\
api: 1
effects: {mutates: true, touches: [timing], io: []}
entry: stagger.py:apply
summary: Offset each selected clip's start N frames after the previous one (in time order).
example: timelines edit TL --op stagger --select 'cut=c12 role=label' --by 3f
selection: required            # required | optional | none
scope: selection               # what it may change: selection | cut | timeline (enforced, §7.1)
args:
  by:    {type: duration, default: 3f, help: extra delay per clip}
  order: {type: enum, values: [time, x, y], default: time}
sheet: {alias: stagger}        # the form is always "@stagger 3f order=x"
undo: "stagger {n} clips by {by}"
# built-ins only: cli: {flag: --opacity, arg: value}, order: 40 (their place in the edit pipeline)
"""

CONTRIB_HAS_TRACK = """\
api: 1
effects: read
entry: has-track.py:match
summary: Clips that carry a data track of this name (has-track=face).
example: timelines show TL --as clips --select 'has-track=face'
value: {type: text}
"""

CONTRIB_MARKER = """\
api: 1
effects: read
entry: marker.py                      # module exposes points() and resolve()
summary: A named point from a 'markers' data track (marker intro, marker intro +6f).
example: timelines edit TL --clip c12.title --on 'marker intro +6f'
grammar: "marker <label>"
track: markers
"""

CONTRIB_CLIPS_VIEW = """\
api: 1
effects: read
entry: astrid.sdk.timeline.views.clips:render
summary: Every clip as a row (address, element, start, end, text, asset), filterable by --select.
example: timelines show TL --as clips --select 'chapter=02' --format csv
output: rows
row: clip
columns: [address, element, start, end, text, asset]
"""

CONTRIB_FACE_OVERLAP = """\
api: 1
effects: read
entry: face-overlap.py:value
summary: Share of the presenter's face this clip covers (0–1).
example: timelines show TL --as clips --columns address,element,face-overlap
applies_to: clip
header: "face%"
format: "{:.0%}"
"""

CONTRIB_CAPTIONS = """\
api: 1
effects: read
entry: captions.py:render
summary: On-screen text clips as bars with their text, over the spoken words.
example: timelines visualize TL --view scan --range 10..20 --lane captions,words
axis: time
needs: [doc, words]
height: 90
frame_budget: 0
order: 25
"""

CONTRIB_SAFE = """\
api: 1
effects: read
entry: safe.py:draw
summary: Title-safe (90%) and action-safe (95%) rectangles on every tile.
example: timelines visualize TL --view overview --overlay safe
needs: [doc]
"""

CONTRIB_DOWNBEATS = """\
api: 1
effects: read
entry: downbeats.py:frames
summary: One frame on every music downbeat in the window.
example: timelines visualize TL --range 20..40 --sample downbeats
reads: [beats]
max_frames: 48
"""

CONTRIB_READ_TIME = """\
api: 1
effects: read                    # a check never writes: its fix is an OpCall the Operation runner applies
entry: read-time.py:run
summary: On-screen text shorter than its reading time (words / words_per_s + read_pad_s).
example: timelines lint TL --only READ
scope: clip                    # clip | cut | timeline | diff
needs: [doc]                   # [frames] = a probe; scope diff = a sweep comparator
codes: {READ: warn}            # blocking | error | warn | info; astrid-lint.toml overrides per code
params: {words_per_s: 3.0, read_pad_s: 0.5}     # shared keys, with the existing conflict check (layers/base.py:154-160)
applies_to: "role=label"
fixtures: {bad: read-time/flash.json}           # a planted defect: the harness requires ≥1 finding on it
"""

CONTRIB_SRT = """\
api: 1
effects: read                    # import RETURNS OpCalls; the Operation runner applies them
entry: srt.py                         # export() and import_()
summary: Subtitles from the narration words (export); caption text clips from an .srt (import).
example: timelines export TL --format srt --out film.srt
extensions: [.srt]
input: model
export: {select: optional}
import: {emits: [timeline.add_text]}
"""

CONTRIBUTION_EXAMPLES = {
    "duck-under-voice": ("timeline.operation", CONTRIB_DUCK),
    "gameboy": ("pixel.palette", CONTRIB_GAMEBOY),
    "stagger": ("timeline.operation", CONTRIB_STAGGER),
    "has-track": ("timeline.selector", CONTRIB_HAS_TRACK),
    "marker": ("timeline.anchor", CONTRIB_MARKER),
    "clips": ("timeline.view", CONTRIB_CLIPS_VIEW),
    "face-overlap": ("timeline.column", CONTRIB_FACE_OVERLAP),
    "captions": ("timeline.lane", CONTRIB_CAPTIONS),
    "safe": ("timeline.overlay", CONTRIB_SAFE),
    "downbeats": ("timeline.sampler", CONTRIB_DOWNBEATS),
    "read-time": ("timeline.check", CONTRIB_READ_TIME),
    "srt": ("timeline.format", CONTRIB_SRT),
}

PACK_VERSION = "0.4.0"


# ---------------------------------------------------------------- helpers


def _pack(tmp_path: Path) -> Path:
    root = tmp_path / "pack"
    root.mkdir()
    return root


def _write_contribution(pack: Path, folder: str, key: str, text: str) -> Path:
    """Write <pack>/extensions/<folder>/<key>.yaml and a stub for its file entry, so the entry resolves."""
    folder_path = pack / "extensions" / folder
    folder_path.mkdir(parents=True, exist_ok=True)
    manifest = folder_path / f"{key}.yaml"
    manifest.write_text(text, encoding="utf-8")
    match = re.search(r"^entry:\s*([^\s#]+)", text, re.M)
    if match and match.group(1).split(":")[0].endswith(".py"):
        code = match.group(1).split(":")[0]
        (folder_path / code).write_text("def apply(*args, **kwargs):\n    return None\n", encoding="utf-8")
    return manifest


def _contribution(pack: Path, folder: str, key: str, text: str, *, point: ExtensionPoint | None = None) -> Contribution:
    manifest = _write_contribution(pack, folder, key, text)
    return parse_contribution(manifest, pack="pack", pack_root=pack, scope="project", pack_version=PACK_VERSION, point=point)


def _point(pack: Path, name: str, text: str, *, owner: str = "pack") -> ExtensionPoint:
    points = pack / "extensions" / "points"
    points.mkdir(parents=True, exist_ok=True)
    manifest = points / f"{name}.yaml"
    manifest.write_text(text, encoding="utf-8")
    return parse_point(manifest, owner=owner)


POINT_SHOUT = """\
description: Shout a value at the given volume.
version: 2
min_supported: 1
side: client
cardinality: many
effects_allowed: [none, read]
protocol: data
schema:
  type: object
  additionalProperties: false
  properties:
    db: {type: number}
"""


def _assert_one_line(error: ManifestError, manifest: Path, field: str) -> None:
    message = str(error)
    assert "\n" not in message, message
    assert str(manifest) in message, message
    assert f"{field}:" in message, message
    assert "; " in message, message  # "<what is wrong>; <what to write>"


# ---------------------------------------------------------------- the examples parse


def test_point_examples_parse(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    (pack / "extensions" / "points" / "palette").mkdir(parents=True)
    (pack / "extensions" / "points" / "palette" / "with.schema.json").write_text('{"type": "object"}', encoding="utf-8")
    palette = _point(pack, "palette", POINT_PALETTE, owner="pixel")
    assert palette.id == "pixel.palette"
    assert palette.protocol is None  # protocol: data
    assert palette.effects_allowed == frozenset({"none", "read"})
    assert palette.schema == {"type": "object"}
    assert palette.template == pack / "extensions" / "points" / "palette" / "template"

    schema_dir = pack / "extensions" / "points" / "mask_source"
    schema_dir.mkdir(parents=True)
    (schema_dir / "with.schema.json").write_text('{"type": "object"}', encoding="utf-8")
    (schema_dir / "protocol.py").write_text("class MaskSource:\n    pass\n", encoding="utf-8")
    (schema_dir / "harness.py").write_text("def check(*a):\n    return []\n", encoding="utf-8")
    (schema_dir / "docs.py").write_text("def describe():\n    return ''\n", encoding="utf-8")
    mask = _point(pack, "mask_source", POINT_MASK_SOURCE, owner="pixel")
    assert mask.id == "pixel.mask_source"
    assert mask.protocol is not None and mask.protocol.kind == "file" and mask.protocol.attr == "MaskSource"
    assert mask.harness is not None and mask.harness.attr == "check"
    assert mask.docs is not None and mask.docs.attr == "describe"
    assert mask.schema == {"type": "object"}
    assert mask.effects_allowed == frozenset({"none", "read"})


@pytest.mark.parametrize("key", sorted(CONTRIBUTION_EXAMPLES))
def test_every_contribution_example_parses(tmp_path: Path, key: str) -> None:
    folder, text = CONTRIBUTION_EXAMPLES[key]
    pack = _pack(tmp_path)
    contribution = _contribution(pack, folder, key, text)
    assert contribution.key == key
    assert contribution.point == folder
    assert contribution.id == f"pack.{key}"
    assert contribution.version == PACK_VERSION  # no version in the example: the pack's version
    assert contribution.api == 1
    if contribution.effects.level == "none":
        assert contribution.entry is None
    else:
        assert contribution.entry is not None


def test_file_and_module_entries_resolve_as_declared(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    stagger = _contribution(pack, "timeline.operation", "stagger", CONTRIB_STAGGER)
    assert stagger.entry is not None
    assert stagger.entry.kind == "file" and stagger.entry.attr == "apply"
    assert Path(stagger.entry.target) == (pack / "extensions" / "timeline.operation" / "stagger.py").resolve()
    marker = _contribution(pack, "timeline.anchor", "marker", CONTRIB_MARKER)
    assert marker.entry is not None and marker.entry.attr is None  # the whole module
    clips = _contribution(pack, "timeline.view", "clips", CONTRIB_CLIPS_VIEW)
    assert clips.entry is not None
    assert clips.entry.kind == "module"
    assert clips.entry.target == "astrid.sdk.timeline.views.clips"
    assert clips.entry.attr == "render"


# ---------------------------------------------------------------- rejections: one line, names the file and the field


def test_bad_key_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    manifest = _write_contribution(pack, "timeline.check", "Bad_Key", CONTRIB_SAFE.replace("entry: safe.py:draw", "effects: none").replace("effects: read", "effects: none"))
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "key")


def test_entry_escaping_pack_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    # From pack/extensions/<point>/, one ".." stays inside the pack; three leave it.
    manifest = _write_contribution(pack, "timeline.operation", "escape", CONTRIB_STAGGER.replace("entry: stagger.py:apply", "entry: ../../../x.py:f"))
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "entry")
    assert "escapes its pack" in str(info.value)


def test_bad_specifier_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_SAFE.replace("needs: [doc]", 'compatibility: ">=1,,<3"')
    manifest = _write_contribution(pack, "timeline.overlay", "safe", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "compatibility")


def test_unknown_field_rejected_by_point_schema(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    shout = _point(pack, "shout", POINT_SHOUT)
    text = "api: 2\neffects: none\nsummary: Shout it.\nexample: pack shout loud\ndb: -9\nbogus: 1\n"
    manifest = _write_contribution(pack, "pack.shout", "loud", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project", point=shout)
    _assert_one_line(info.value, manifest, "bogus")


def test_summary_over_120_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_SAFE.replace("Title-safe (90%) and action-safe (95%) rectangles on every tile.", "x" * 121)
    manifest = _write_contribution(pack, "timeline.overlay", "safe", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "summary")


def test_read_with_touches_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_SAFE.replace("effects: read", "effects: {mutates: false, touches: [timing]}")
    manifest = _write_contribution(pack, "timeline.overlay", "safe", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "effects")
    assert "touches" in str(info.value)


def test_network_io_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_STAGGER.replace("effects: {mutates: true, touches: [timing], io: []}", "effects: {mutates: true, touches: [timing], io: [network]}")
    manifest = _write_contribution(pack, "timeline.operation", "stagger", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "effects")
    assert "network" in str(info.value)


def test_api_outside_point_range_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    shout = _point(pack, "shout", POINT_SHOUT)  # version 2, min_supported 1
    text = "api: 3\neffects: none\nsummary: Shout it.\nexample: pack shout loud\n"
    manifest = _write_contribution(pack, "pack.shout", "loud", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project", point=shout)
    _assert_one_line(info.value, manifest, "api")


def test_effects_level_the_point_does_not_allow_rejected(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    shout = _point(pack, "shout", POINT_SHOUT)  # allows none and read only
    text = "api: 2\neffects: edit\nentry: loud.py:apply\nsummary: Shout it.\nexample: pack shout loud\n"
    manifest = _write_contribution(pack, "pack.shout", "loud", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project", point=shout)
    _assert_one_line(info.value, manifest, "effects")


def test_name_must_match_file_stem(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_SAFE.replace("api: 1", "api: 1\nname: other")
    manifest = _write_contribution(pack, "timeline.overlay", "safe", text)
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "name")


def test_entry_required_unless_effects_none(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    manifest = _write_contribution(pack, "timeline.overlay", "safe", CONTRIB_SAFE.replace("entry: safe.py:draw\n", ""))
    with pytest.raises(ManifestError) as info:
        parse_contribution(manifest, pack="pack", pack_root=pack, scope="project")
    _assert_one_line(info.value, manifest, "entry")


# ---------------------------------------------------------------- identity, digest, effects, refs, deprecation


def test_ref_is_pack_key_version_and_digest(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    contribution = _contribution(pack, "timeline.overlay", "safe", CONTRIB_SAFE)
    assert re.fullmatch(r"pack\.safe@0\.4\.0#[0-9a-f]{12}", contribution.ref), contribution.ref
    assert contribution.ref.startswith(f"{contribution.id}@{PACK_VERSION}#")


def test_digest_changes_when_manifest_bytes_change(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    first = _contribution(pack, "timeline.overlay", "safe", CONTRIB_SAFE)
    second = _contribution(pack, "timeline.overlay", "safe", CONTRIB_SAFE + "# a comment changes the bytes\n")
    assert first.digest != second.digest
    assert len(second.digest) == 12


def test_effects_short_and_long_forms_normalize() -> None:
    where = "x.yaml: effects"
    assert parse_effects("read", where=where) == parse_effects({"mutates": False}, where=where) == Effects("read")
    assert parse_effects("none", where=where) == Effects("none")
    assert parse_effects("none", where=where) != parse_effects("read", where=where)
    assert parse_effects("edit", where=where) == parse_effects({"mutates": True}, where=where) == Effects("edit")
    assert parse_effects({"mutates": True, "touches": ["timing"]}, where=where) == Effects("edit", ("timing",))
    assert parse_effects({"mutates": True, "touches": ["audio"], "io": []}, where=where).touches == ("audio",)


@pytest.mark.parametrize(
    "value",
    [{"mutates": False, "touches": ["timing"]}, {"mutates": True, "touches": ["colour"]}, {"mutates": True, "io": ["network"]}, "write", 3],
)
def test_effects_rejects_bad_values(value: object) -> None:
    with pytest.raises(ManifestError) as info:
        parse_effects(value, where="x.yaml: effects")
    assert "\n" not in str(info.value)
    assert str(info.value).startswith("x.yaml: effects: ")


@pytest.mark.parametrize(
    ("text", "kind", "attr"),
    [
        ("x.py", "file", None),
        ("x.py:func", "file", "func"),
        ("sub/x.py:func", "file", "func"),
        ("pkg.mod:attr", "module", "attr"),
        ("pkg.mod", "module", None),
    ],
)
def test_parse_ref_forms(tmp_path: Path, text: str, kind: str, attr: str | None) -> None:
    pack = _pack(tmp_path)
    (pack / "sub").mkdir()
    for file in ("x.py", "sub/x.py"):
        (pack / file).write_text("", encoding="utf-8")
    ref = parse_ref(text, base_dir=pack, pack_root=pack)
    assert ref.kind == kind and ref.attr == attr
    if kind == "file":
        assert Path(ref.target).is_absolute()


def test_module_ref_refused_when_not_allowed(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    with pytest.raises(ManifestError, match="not a file reference"):
        parse_ref("pkg.mod:attr", base_dir=pack, pack_root=pack, allow_module=False)


def test_deprecated_block_keeps_remove_after_as_text(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    text = CONTRIB_DUCK.replace("# deprecated:", "deprecated:").replace("status: active", "status: deprecated")
    contribution = _contribution(pack, "timeline.operation", "duck-under-voice", text)
    assert contribution.status == "deprecated"
    assert contribution.deprecated is not None
    assert contribution.deprecated.since == "0.3.0"
    assert contribution.deprecated.use == "timeline_kit.duck"
    assert contribution.deprecated.remove_after == "2027-01-01"
    assert contribution.fields["args"]["db"]["default"] == -9
