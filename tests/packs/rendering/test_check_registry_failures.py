"""A check or layer that cannot be registered is loud, never a silent success (truth pattern 1, T1-11 / T1-12).

* A pack module that fails to load is named by ``broken_line()`` (the first line of every lint run).
* A check or layer whose name is taken by a different source is refused, naming both sources.
* Re-registering the same source (``discover(refresh=True)``) stays allowed and idempotent.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from astrid.packs.rendering.actions.timeline_visualize.layers import (
    base,
    builtin,  # noqa: F401  (imported before the fixture snapshots: built-ins must survive restore)
    builtin_checks,  # noqa: F401
)
from astrid.packs.rendering.actions.timeline_visualize.layers.base import broken_line, checks, discover
from astrid.packs.timeline.cli_lint_header import print_broken_header
from astrid.sdk.timeline_checkout import Checkout

PUBLISHABLE = Path(__file__).resolve().parents[2] / "fixtures" / "timeline_editing" / "tiny_publishable.json"

CLEAN_CHECK = (
    "from astrid.packs.rendering.actions.timeline_visualize.layers.base import Check\n"
    "CHECK = Check({name!r}, 'a probe', lambda ctx: [])\n"
)


@pytest.fixture(autouse=True)
def restore_registry():
    """Put the process-wide registry back exactly as it was, so no probe check leaks into other tests."""
    saved = (dict(base._CHECKS), dict(base._REGISTRY), dict(base._BROKEN), base._DISCOVERED)
    yield
    base._CHECKS.clear()
    base._CHECKS.update(saved[0])
    base._REGISTRY.clear()
    base._REGISTRY.update(saved[1])
    base._BROKEN.clear()
    base._BROKEN.update(saved[2])
    base._DISCOVERED = saved[3]


def _pack_module(root: Path, pack: str, stem: str, body: str) -> None:
    folder = root / pack / "visualize_layers"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{stem}.py").write_text(body)


def _scan(root: Path) -> None:
    discover(packs_root=root, refresh=True)


def test_a_module_that_raises_at_import_is_named_on_the_broken_line(tmp_path: Path):
    _pack_module(tmp_path / "packs", "timeline_kit", "read-time", "raise ImportError('no module named x')\n")
    _scan(tmp_path / "packs")

    line = broken_line()
    assert line is not None
    assert line.startswith("1 check module could not load: timeline_kit/read-time: ImportError: no module named x")
    assert "timelines lint --list-checks" in line
    assert base.broken() == {"timeline_kit/read-time": "ImportError: no module named x"}


def test_two_pack_checks_with_one_name_refuse_the_second_and_name_both_sources(tmp_path: Path):
    root = tmp_path / "packs"
    _pack_module(root, "alpha", "a", CLEAN_CHECK.format(name="zz-dup"))
    _pack_module(root, "beta", "b", CLEAN_CHECK.format(name="zz-dup"))
    _scan(root)

    assert base._CHECKS["zz-dup"].source.startswith("alpha pack")
    message = base.broken()["beta/b"]
    assert message.startswith("ValueError: check 'zz-dup' from beta pack")
    assert "would shadow the one from alpha pack" in message
    line = broken_line()
    assert "beta/b" in line and "alpha pack" in line and "beta pack" in line


def test_a_pack_check_named_like_a_built_in_is_refused(tmp_path: Path):
    root = tmp_path / "packs"
    _pack_module(root, "rogue", "shadow", CLEAN_CHECK.format(name="composition"))
    _scan(root)

    assert base._CHECKS["composition"].source == "built-in"
    assert "would shadow the one from built-in" in base.broken()["rogue/shadow"]


def test_a_refused_module_registers_nothing_from_itself(tmp_path: Path):
    root = tmp_path / "packs"
    _pack_module(root, "rogue", "partial", (
        "from astrid.packs.rendering.actions.timeline_visualize.layers.base import Check, Layer\n"
        "LAYER = Layer('zz-partial', 'h', lambda ctx: None, checks=(Check('composition', 'h', lambda ctx: []),))\n"
    ))
    _scan(root)

    assert "zz-partial" not in base._REGISTRY
    assert "rogue/partial" in base.broken()


def test_a_pack_layer_named_like_a_built_in_layer_is_refused(tmp_path: Path):
    root = tmp_path / "packs"
    _pack_module(root, "rogue", "sync", (
        "from astrid.packs.rendering.actions.timeline_visualize.layers.base import Layer\n"
        "LAYER = Layer('sync', 'h', lambda ctx: None)\n"
    ))
    _scan(root)

    assert base._REGISTRY["sync"].source == "built-in"
    assert "layer 'sync' from rogue pack" in base.broken()["rogue/sync"]


def test_rediscovering_the_same_source_is_idempotent(tmp_path: Path):
    root = tmp_path / "packs"
    _pack_module(root, "alpha", "a", CLEAN_CHECK.format(name="zz-stable"))
    _scan(root)
    first = sorted(checks())
    _scan(root)
    _scan(root)

    assert sorted(checks()) == first
    assert base.broken() == {}
    assert broken_line() is None


def test_rediscovering_the_real_packs_twice_raises_nothing():
    discover(refresh=True)
    first = base.broken()
    discover(refresh=True)
    assert base.broken() == first
    assert len(checks()) == len(set(checks()))


def test_checkout_lint_starts_with_the_broken_line_only_when_a_module_is_broken(tmp_path: Path):
    doc = json.loads(PUBLISHABLE.read_text())
    root = tmp_path / "packs"
    _pack_module(root, "timeline_kit", "read-time", "raise ImportError('no module named x')\n")
    _scan(root)
    broken_lines = Checkout(doc).lint()
    assert broken_lines[0].startswith("1 check module could not load: timeline_kit/read-time")

    empty = tmp_path / "empty-packs"
    empty.mkdir()
    _scan(empty)
    assert not any("could not load" in line for line in Checkout(doc).lint())


def test_print_broken_header_prints_and_reports(tmp_path: Path, capsys):
    _scan(tmp_path / "none")  # no pack modules: nothing broken
    assert print_broken_header() is False
    assert capsys.readouterr().out == ""

    _pack_module(tmp_path / "packs", "timeline_kit", "read-time", "raise ImportError('no module named x')\n")
    _scan(tmp_path / "packs")
    assert print_broken_header() is True
    assert "timeline_kit/read-time: ImportError: no module named x" in capsys.readouterr().out
