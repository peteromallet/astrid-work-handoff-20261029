from __future__ import annotations

import ntpath
from pathlib import Path, PureWindowsPath
from types import SimpleNamespace

from astrid.core.element import catalog
from astrid.core.element.catalog import _element_revision


def _definition(root: Path) -> SimpleNamespace:
    root.mkdir(parents=True, exist_ok=True)
    component = root / "component.tsx"
    component.write_bytes(b"component")
    for relative, content in {"Z.tsx": b"upperZ", "a.tsx": b"lowerA", "a/x.tsx": b"child"}.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    external = root.parent / "_shared" / "mosaic.tsx"
    external.parent.mkdir(parents=True, exist_ok=True)
    external.write_bytes(b"external")
    payload = {
        "id": "revision-fixture", "kind": "effects", "root": str(root), "source": "test",
        "editable": False, "priority": 0, "component": str(component), "schema": {},
        "defaults": {}, "metadata": {}, "dependencies": {}, "description": "",
        "short_description": "", "keywords": [], "inputs": [], "outputs": [], "runtime": {},
    }
    return SimpleNamespace(
        root=root, component=component, support_files=(external,), assets=(),
        to_dict=lambda: dict(payload),
    )


def _simulate_windows_path_order(monkeypatch):
    path_type = type(Path())
    monkeypatch.setattr(path_type, "parts", property(lambda path: PureWindowsPath(path.as_posix()).parts))
    monkeypatch.setattr(
        path_type,
        "__lt__",
        lambda path, other: tuple(part.casefold() for part in path.parts)
        < tuple(part.casefold() for part in other.parts),
    )


def test_element_revision_pins_posix_key_spelling_and_outside_helpers(tmp_path, monkeypatch):
    definition = _definition(tmp_path / "elements" / "fixture")
    expected = "sha256:09d88f641fcf050b79f88becd230c7758da100c79b9bfa69587bc2e0028b8522"
    assert _element_revision(definition) == expected

    _simulate_windows_path_order(monkeypatch)
    # ntpath and PureWindowsPath supply native Windows relpath spelling here.
    monkeypatch.setattr(catalog, "Path", PureWindowsPath)
    monkeypatch.setattr(catalog.os.path, "relpath", ntpath.relpath)
    assert _element_revision(definition) == expected
