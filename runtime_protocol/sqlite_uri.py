"""Escaped filesystem paths for SQLite's URI connection interface."""

from pathlib import Path


def sqlite_file_uri(path: str | Path, *, mode: str = "ro") -> str:
    """Keep filename delimiters literal and append an explicit access mode."""
    if mode not in {"ro", "rw", "rwc"}:
        raise ValueError("unsupported SQLite URI access mode")
    return f"{Path(path).absolute().as_uri()}?mode={mode}"
