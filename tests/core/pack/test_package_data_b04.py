from __future__ import annotations

import tomllib
from pathlib import Path


def test_tool_catalog_has_an_explicit_narrow_package_data_slot() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    config = tomllib.loads((repo_root / "pyproject.toml").read_text(encoding="utf-8"))
    patterns = config["tool"]["setuptools"]["package-data"]["astrid"]

    assert "tools/*.json" in patterns
    assert "tools/**" not in patterns
