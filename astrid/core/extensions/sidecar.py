"""List extension manifest files in a pack folder, without importing anything (M-Core, X-2).

The walk looks at fixed places only (EXTENSIBILITY §2.3):

- ``<pack>/extensions/points/*.yaml``            -> kind "point"
- ``<pack>/extensions/<point>/*.yaml``           -> kind "contribution" (any folder but "points")
- ``<pack>/visualize_layers/*.py`` and
  ``<pack>/rendering/visualize_layers/*.py``     -> kind "legacy" (not ``__init__.py``, not ``_*``)

No recursion below those levels, so a point's own assets (``points/<name>/``) are never
manifests. A symlink that resolves outside the pack root is skipped.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_KIND_ORDER = {"point": 0, "contribution": 1, "legacy": 2}
_LEGACY_DIRS = ("visualize_layers", "rendering/visualize_layers")


@dataclass(frozen=True)
class ManifestFile:
    kind: Literal["point", "contribution", "legacy"]
    path: Path  # absolute
    point: str | None  # contributions: the folder name ("timeline.operation"); points/legacy: None
    key: str  # the file stem (points: the point's name; legacy: the module stem)


def _inside(path: Path, base: Path) -> bool:
    """True when ``path`` (after resolving symlinks) stays inside ``base`` (already resolved)."""
    try:
        path.resolve().relative_to(base)
    except (ValueError, OSError):
        return False
    return True


def _files(folder: Path, base: Path, suffix: str) -> list[Path]:
    """Regular files directly in ``folder`` with ``suffix`` whose resolved location is inside ``base``."""
    if not folder.is_dir():
        return []
    found = []
    for entry in folder.iterdir():
        if entry.suffix != suffix or not entry.is_file():
            continue
        if _inside(entry, base):
            found.append(entry)
    return found


def _sorted(items: list[ManifestFile]) -> Iterator[ManifestFile]:
    items.sort(key=lambda m: (_KIND_ORDER[m.kind], m.point or "", m.key, str(m.path)))
    yield from items


def _extension_manifests(extensions: Path, base: Path) -> list[ManifestFile]:
    """Point and contribution manifests under ``extensions/`` (``base`` is the resolved containment root)."""
    out: list[ManifestFile] = []
    for path in _files(extensions / "points", base, ".yaml"):
        out.append(ManifestFile("point", path, None, path.stem))
    if extensions.is_dir():
        for folder in extensions.iterdir():
            if folder.name == "points" or not folder.is_dir():
                continue
            for path in _files(folder, base, ".yaml"):
                out.append(ManifestFile("contribution", path, folder.name, path.stem))
    return out


def iter_extension_manifests(pack_root: Path) -> Iterator[ManifestFile]:
    """Every extension manifest in one pack folder: points, contributions, then legacy layer modules."""
    root = pack_root.absolute()
    base = root.resolve()
    items = _extension_manifests(root / "extensions", base)
    for rel in _LEGACY_DIRS:
        for path in _files(root / rel, base, ".py"):
            if path.name == "__init__.py" or path.stem.startswith("_"):
                continue
            items.append(ManifestFile("legacy", path, None, path.stem))
    yield from _sorted(items)


def iter_sdk_manifests(sdk_root: Path) -> Iterator[ManifestFile]:
    """The same walk over an SDK extensions folder (``sdk_root`` is ``.../extensions``: it holds ``points/``
    and one folder per point). No legacy source."""
    extensions = sdk_root.absolute()
    base = extensions.resolve()
    yield from _sorted(_extension_manifests(extensions, base))
