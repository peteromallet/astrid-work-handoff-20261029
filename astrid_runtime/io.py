"""Small crash-safe, owner-only support-file primitives."""

from __future__ import annotations

import json
from runtime_protocol.dirfd import filesystem as os
from pathlib import Path

from runtime_protocol import platform
from typing import Any


def owner_only(path: Path, directory: bool = False) -> None:
    if platform.sys.platform == "win32":
        platform.owner_only(path, directory=directory)
        return  # Windows security failures must never be suppressed.
    try:
        platform.owner_only(path, directory=directory)
    except OSError:
        pass


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    if platform.sys.platform == "win32":
        platform.private_directory(path.parent)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        owner_only(path.parent, directory=True)
    payload = json.dumps(value, sort_keys=True, indent=2) + "\n"
    fd, temporary = platform.private_temporary(path.parent, f".{path.name}.")
    temporary_path = Path(temporary)
    try:
        owner_only(temporary_path)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        platform.durable_replace(temporary_path, path)
        owner_only(path)
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def remove_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
