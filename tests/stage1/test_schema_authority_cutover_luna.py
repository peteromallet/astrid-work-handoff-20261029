"""Negative proof for the flattened schema authority: Astrid carries no schema host or migrations."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from astrid.core.cli.domain_product import (
    REQUIRED_RUNTIME_MOUNTS,
    build_product_mounts,
)

ROOT = Path(__file__).resolve().parents[2]


def test_astrid_has_no_local_schema_host_or_migrations() -> None:
    astrid = ROOT / "astrid"
    assert not (astrid / "core" / "schema_packs").exists()
    assert not list(astrid.rglob("schema-pack.yaml"))
    assert not [path for path in astrid.rglob("migrations") if path.is_dir()]
    for path in astrid.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "astrid.core.schema_packs" not in source, path
        assert "schema-pack.yaml" not in source, path
    assert importlib.util.find_spec("astrid.core.schema_packs") is None


def test_executable_capability_manifests_and_runtime_mounts_remain() -> None:
    manifests = list((ROOT / "astrid" / "packs").glob("*/pack.yaml"))
    assert manifests
    assert (ROOT / "astrid/packs/rendering/pack.yaml").is_file()
    assert REQUIRED_RUNTIME_MOUNTS == {
        "timelines": ("timelines",),
        "shots": ("timelines", "shots"),
        "references": ("media", "references"),
    }
    mounts = build_product_mounts()
    assert {mount.family for mount in mounts} == {
        "projects",
        "documents",
        "preferences",
        "media",
        "tasks",
        "runs",
        "timelines",
        "shots",
        "references",
    }
    assert len(mounts) == 9
