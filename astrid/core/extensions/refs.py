"""References from a manifest to code: ``file.py[:attr]`` or ``pkg.module[:attr]``.

Pure path and name handling. Nothing here imports the referenced code.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_MODULE_RE = re.compile(r"^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$")
_ATTR_RE = re.compile(r"^[A-Za-z_]\w*$")


@dataclass(frozen=True)
class Ref:
    kind: Literal[
        "file", "module"
    ]  # "file.py:func" (relative to the manifest's folder) | "pkg.module:attr"
    target: str  # the file path (resolved, absolute) or the module name
    attr: str | None  # None = the whole module (an entry "marker.py" with points()/resolve())


def one_line(text: object) -> str:
    """Collapse any text to a single line (manifest errors must be one line)."""
    return " ".join(str(text).split())


def _fail(what: str, fix: str):  # noqa: ANN202 - returns ManifestError
    # Imported lazily: model.py imports this module at load time.
    from .model import ManifestError

    return ManifestError(f"{one_line(what)}; {one_line(fix)}")


def resolve_in_pack(target: str, *, base_dir: Path, pack_root: Path, what: str) -> Path:
    """Resolve ``target`` against the manifest folder; it must stay inside ``pack_root``.

    Symlinks and ``..`` are resolved before the check, so an escape cannot hide behind either.
    """
    root = pack_root.resolve()
    candidate = (base_dir / target).resolve()
    if not candidate.is_relative_to(root):
        raise _fail(
            f"escapes its pack: {what} resolves to {candidate}",
            f"keep the file inside {root}",
        )
    return candidate


def parse_ref(text: str, *, base_dir: Path, pack_root: Path, allow_module: bool = True) -> Ref:
    """Parse "x.py", "x.py:func", "sub/x.py:func", "pkg.mod:attr" or "pkg.mod".

    Raises ManifestError (one line, without the file path; callers prefix ``<path>: <field>:``).
    """
    if not isinstance(text, str) or not text.strip():
        raise _fail(
            "the reference is empty",
            "write a file such as run.py:func or a module such as pkg.mod:func",
        )
    raw = text.strip()
    target, colon, attr_text = raw.partition(":")
    attr: str | None = None
    if colon:
        attr = attr_text.strip()
        if not _ATTR_RE.match(attr):
            raise _fail(
                f"{raw!r} names {attr_text.strip()!r}, which is not a Python name",
                "name the function or attribute as a plain identifier after the colon",
            )
    target = target.strip()
    if target.endswith(".py"):
        resolved = resolve_in_pack(target, base_dir=base_dir, pack_root=pack_root, what=repr(raw))
        if not resolved.is_file():
            raise _fail(
                f"file {target!r} does not exist beside the manifest",
                "create the file or fix the path",
            )
        return Ref("file", str(resolved), attr)
    if not allow_module:
        raise _fail(f"{raw!r} is not a file reference", "point it at a .py file inside the pack")
    if not _MODULE_RE.match(target):
        raise _fail(
            f"{raw!r} is neither a .py file nor a dotted module name",
            "write run.py:func or pkg.module:func",
        )
    return Ref("module", target, attr)
