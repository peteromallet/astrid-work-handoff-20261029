"""Where extension contributions come from, in precedence order (M-Core, X-3).

Scopes run from low to high precedence: built-in < installed < user < project.
Each scope lists roots (folders) that may hold contribution sidecars. Missing
folders are still reported (``exists=False``) so the chain can be printed.

Nothing here imports pack code or writes to disk. Callers pass ``cwd``, ``home``
and ``env`` explicitly for tests; the user root is never ``<home>/.astrid``.
"""

from __future__ import annotations

import os
import re
import tomllib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from astrid.core.pack.source_setup import active_sources

SCOPES = ("built-in", "installed", "user", "project")

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PROJECT_DIR = ".astrid"
_PACKS_DIR = "packs"
_CONFIG_FILE = "config.toml"
_PROJECT_ORIGIN = "<project>/.astrid/packs"


@dataclass(frozen=True)
class Root:
    scope: str
    path: Path
    exists: bool
    origin: str  # "source tree", "sdk", "managed:<identity>", "--pack-root", "user",
    #              "<project>/.astrid/packs", "ASTRID_PACKS_PATH"


def find_project(cwd: Path | None = None) -> Path | None:
    """Return the nearest ancestor of ``cwd`` (inclusive) holding a ``.astrid`` folder."""
    start = Path(cwd) if cwd is not None else Path.cwd()
    start = start.absolute()
    for candidate in (start, *start.parents):
        if (candidate / _PROJECT_DIR).is_dir():
            return candidate
    return None


def _root(scope: str, path: Path, origin: str) -> Root:
    return Root(scope, path, path.is_dir(), origin)


def _installed_roots(installed: Sequence[Path] | None) -> list[Root]:
    if installed is None:
        try:
            sources = active_sources(verify=False)
        except (RuntimeError, OSError, ValueError, KeyError, TypeError):
            return []
        return [_root("installed", s.pack_root, f"managed:{s.identity}") for s in sources]
    return [_root("installed", Path(p), f"managed:{p}") for p in installed]


def contribution_roots(
    *,
    cwd: Path | None = None,
    home: Path | None = None,
    env: Mapping[str, str] | None = None,
    extra_pack_roots: Sequence[str] = (),
    repo_root: Path | None = None,
    installed: Sequence[Path] | None = None,
) -> tuple[Root, ...]:
    """All contribution roots, ordered by ``SCOPES`` and then by source within a scope."""
    cwd = Path(cwd) if cwd is not None else Path.cwd()
    home = Path(home) if home is not None else Path.home()
    env = os.environ if env is None else env
    repo = Path(repo_root) if repo_root is not None else _REPO_ROOT

    roots: list[Root] = [
        _root("built-in", repo / "astrid" / _PACKS_DIR, "source tree"),
        _root("built-in", repo / "astrid" / "sdk" / "timeline" / "extensions", "sdk"),
    ]

    roots.extend(_installed_roots(installed))
    roots.extend(_root("installed", Path(p), "--pack-root") for p in extra_pack_roots)

    user_override = env.get("ASTRID_USER_PACKS")
    if user_override:
        user_path = Path(user_override)
    else:
        xdg = env.get("XDG_CONFIG_HOME")
        base = Path(xdg) if xdg else home / ".config"
        user_path = base / "astrid" / _PACKS_DIR
    roots.append(_root("user", user_path, "user"))

    project = find_project(cwd)
    if project is not None:
        roots.append(_root("project", project / _PROJECT_DIR / _PACKS_DIR, _PROJECT_ORIGIN))
    raw_env_roots = env.get("ASTRID_PACKS_PATH", "")
    for entry in raw_env_roots.split(os.pathsep):
        if entry:
            roots.append(_root("project", Path(entry), "ASTRID_PACKS_PATH"))

    order = {scope: index for index, scope in enumerate(SCOPES)}
    return tuple(sorted(roots, key=lambda root: order[root.scope]))


def format_chain(roots: Sequence[Root]) -> list[str]:
    """One printable line per root, in the order given."""
    lines = []
    for root in roots:
        status = "(exists)" if root.exists else "(missing)"
        lines.append(f"{root.scope:<10}{root.path}   {status}   {root.origin}")
    return lines


_LINE_RE = re.compile(r"at line (\d+)")


def _toml_error_line(error: tomllib.TOMLDecodeError, text: str) -> int:
    lineno = getattr(error, "lineno", None)
    if isinstance(lineno, int):
        return lineno
    match = _LINE_RE.search(str(error))
    if match:
        return int(match.group(1))
    pos = getattr(error, "pos", None)
    if isinstance(pos, int):
        return text.count("\n", 0, pos) + 1
    # tomllib gives no position for "at end of document": report the last line.
    return text.count("\n") + 1


def disabled_ids(*, cwd: Path | None = None) -> frozenset[str]:
    """Extension ids disabled in ``<project>/.astrid/config.toml`` under ``[extensions] disable``."""
    project = find_project(cwd)
    if project is None:
        return frozenset()
    config = project / _PROJECT_DIR / _CONFIG_FILE
    if not config.is_file():
        return frozenset()
    text = config.read_text(encoding="utf-8")
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        line = _toml_error_line(error, text)
        where = f" at line {line}" if line is not None else ""
        raise ValueError(f"malformed {config}{where}: {error}") from error
    section = data.get("extensions", {})
    if not isinstance(section, dict):
        raise ValueError(f"malformed {config}: [extensions] must be a table")
    disable = section.get("disable", [])
    if not isinstance(disable, list) or not all(isinstance(item, str) for item in disable):
        raise ValueError(f"malformed {config}: [extensions] disable must be a list of strings")
    return frozenset(disable)


__all__ = [
    "SCOPES",
    "Root",
    "contribution_roots",
    "disabled_ids",
    "find_project",
    "format_chain",
]
