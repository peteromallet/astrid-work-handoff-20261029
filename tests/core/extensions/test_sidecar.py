"""The sidecar walker lists manifest files by location; nothing is imported (X-2)."""

from __future__ import annotations

from pathlib import Path

from astrid.core.extensions.sidecar import (
    ManifestFile,
    iter_extension_manifests,
    iter_sdk_manifests,
)


def _touch(path: Path, text: str = "") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def _pack(tmp_path: Path) -> Path:
    pack = tmp_path / "mypack"
    _touch(pack / "extensions" / "points" / "palette.yaml", "version: 1\n")
    _touch(pack / "extensions" / "points" / "mask_source.yaml", "version: 1\n")
    _touch(pack / "extensions" / "points" / "palette" / "with.schema.json", "{}")  # point asset: ignored
    _touch(pack / "extensions" / "timeline.operation" / "stagger.yaml", "api: 1\n")
    _touch(pack / "extensions" / "timeline.operation" / "duck.yaml", "api: 1\n")
    _touch(pack / "extensions" / "timeline.operation" / "duck.py", "x = 1\n")  # code: not a manifest
    _touch(pack / "extensions" / "timeline.operation" / "sub" / "deep.yaml", "api: 1\n")  # no recursion
    _touch(pack / "extensions" / "pixel.palette" / "gameboy.yaml", "api: 1\n")
    _touch(pack / "visualize_layers" / "grid.py", "")
    _touch(pack / "visualize_layers" / "__init__.py", "")  # ignored
    _touch(pack / "visualize_layers" / "_private.py", "")  # ignored
    _touch(pack / "rendering" / "visualize_layers" / "motion.py", "")
    return pack


def _rel(pack: Path, items: list[ManifestFile]) -> list[tuple[str, str | None, str, str]]:
    return [(m.kind, m.point, m.key, m.path.relative_to(pack).as_posix()) for m in items]


def test_lists_points_contributions_and_legacy_in_order(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    got = _rel(pack, list(iter_extension_manifests(pack)))
    assert got == [
        ("point", None, "mask_source", "extensions/points/mask_source.yaml"),
        ("point", None, "palette", "extensions/points/palette.yaml"),
        ("contribution", "pixel.palette", "gameboy", "extensions/pixel.palette/gameboy.yaml"),
        ("contribution", "timeline.operation", "duck", "extensions/timeline.operation/duck.yaml"),
        ("contribution", "timeline.operation", "stagger", "extensions/timeline.operation/stagger.yaml"),
        ("legacy", None, "grid", "visualize_layers/grid.py"),
        ("legacy", None, "motion", "rendering/visualize_layers/motion.py"),
    ]


def test_paths_are_absolute(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    assert all(m.path.is_absolute() for m in iter_extension_manifests(pack))


def test_points_have_no_point_field_and_contributions_do(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    for m in iter_extension_manifests(pack):
        if m.kind == "contribution":
            assert m.point is not None
        else:
            assert m.point is None


def test_missing_extensions_folder_yields_nothing(tmp_path: Path) -> None:
    pack = tmp_path / "bare"
    _touch(pack / "visualize_layers" / "only.py", "")
    got = list(iter_extension_manifests(pack))
    assert [m.kind for m in got] == ["legacy"]
    assert list(iter_extension_manifests(tmp_path / "empty")) == []


def test_escaping_symlink_is_skipped(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    outside = _touch(tmp_path / "outside.yaml", "api: 1\n")
    link = pack / "extensions" / "timeline.operation" / "evil.yaml"
    link.symlink_to(outside)
    keys = [m.key for m in iter_extension_manifests(pack)]
    assert "evil" not in keys


def test_symlink_inside_pack_is_kept(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    link = pack / "extensions" / "timeline.operation" / "alias.yaml"
    link.symlink_to(pack / "extensions" / "timeline.operation" / "stagger.yaml")
    keys = [m.key for m in iter_extension_manifests(pack)]
    assert "alias" in keys


def test_escaping_folder_symlink_is_skipped(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    elsewhere = tmp_path / "elsewhere"
    _touch(elsewhere / "far.yaml", "api: 1\n")
    (pack / "extensions" / "linked.point").symlink_to(elsewhere, target_is_directory=True)
    assert "far" not in [m.key for m in iter_extension_manifests(pack)]


def test_order_is_kind_then_point_then_key(tmp_path: Path) -> None:
    pack = _pack(tmp_path)
    got = list(iter_extension_manifests(pack))
    kinds = [m.kind for m in got]
    assert kinds == sorted(kinds, key=["point", "contribution", "legacy"].index)
    contrib = [(m.point, m.key) for m in got if m.kind == "contribution"]
    assert contrib == sorted(contrib)


def test_sdk_walk_points_and_contributions(tmp_path: Path) -> None:
    sdk = tmp_path / "extensions"
    _touch(sdk / "points" / "operation.yaml", "version: 1\n")
    _touch(sdk / "points" / "operation" / "schema.json", "{}")  # asset: ignored
    _touch(sdk / "timeline.view" / "clips.yaml", "api: 1\n")
    _touch(sdk / "timeline.view" / "nested" / "x.yaml", "api: 1\n")  # no recursion
    _touch(sdk / "timeline.view" / "readme.md", "")  # not YAML
    got = [(m.kind, m.point, m.key) for m in iter_sdk_manifests(sdk)]
    assert got == [
        ("point", None, "operation"),
        ("contribution", "timeline.view", "clips"),
    ]
    assert all(m.path.is_absolute() for m in iter_sdk_manifests(sdk))


def test_sdk_walk_missing_folder_and_no_legacy(tmp_path: Path) -> None:
    assert list(iter_sdk_manifests(tmp_path / "absent")) == []
    sdk = tmp_path / "extensions"
    _touch(sdk / "visualize_layers" / "old.py", "")  # legacy is not an SDK source
    assert list(iter_sdk_manifests(sdk)) == []


def test_sdk_walk_skips_escaping_symlink(tmp_path: Path) -> None:
    sdk = tmp_path / "extensions"
    _touch(sdk / "points" / "ok.yaml", "version: 1\n")
    outside = _touch(tmp_path / "far.yaml", "api: 1\n")
    (sdk / "points" / "far.yaml").symlink_to(outside)
    assert [m.key for m in iter_sdk_manifests(sdk)] == ["ok"]
