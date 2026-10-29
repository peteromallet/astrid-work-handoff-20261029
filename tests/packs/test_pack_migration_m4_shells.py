"""Pins the taxonomy and declared content kinds of the twelve core packs.

Packs are schema-v3 (``pack.yaml`` with ``actions`` / ``rendering`` maps; commit
71d43e00). The retired v2 layout (``content`` roots of executors/orchestrators/
elements, each capability directory carrying its own ``executor.yaml`` /
``orchestrator.yaml``) is no longer asserted; see tests/removed.yaml.
"""

from __future__ import annotations

import unittest
from pathlib import Path

from astrid.core.pack import load_pack_manifest

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKS_ROOT = REPO_ROOT / "astrid" / "packs"

# Reviewable table: pack id -> (domain, rendering descriptor types it declares).
# Every pack here declares actions; only `rendering` also declares rendering
# descriptors (renderers, finalizers, and the render-time elements).
CORE_PACKS: dict[str, tuple[str, frozenset[str]]] = {
    "rendering": ("media", frozenset({"renderer", "finalizer", "element"})),
    "understanding": ("media", frozenset()),
    "generation": ("generation", frozenset()),
    "editorial": ("editorial", frozenset()),
    "video_editing": ("media", frozenset()),
    "foley": ("media", frozenset()),
    "training": ("development", frozenset()),
    "youtube": ("integration", frozenset()),
    "fal": ("integration", frozenset()),
    "vibecomfy": ("integration", frozenset()),
    "runpod": ("infrastructure", frozenset()),
    "moirae": ("integration", frozenset()),
}

RETIRED_V2_MANIFESTS = {"executor.yaml", "orchestrator.yaml"}


class TestCorePackTaxonomyV3(unittest.TestCase):
    def test_core_pack_taxonomy_and_declared_content_kinds(self) -> None:
        for pack_id, (domain, rendering_types) in CORE_PACKS.items():
            with self.subTest(pack=pack_id):
                pack = load_pack_manifest(PACKS_ROOT / pack_id / "pack.yaml")
                self.assertEqual(pack.id, pack_id)
                self.assertEqual(str(pack.schema_version), "3")
                self.assertEqual(pack.domain, domain)
                self.assertEqual(pack.stability, "stable")
                self.assertEqual(pack.support, "core")
                self.assertEqual(pack.visibility, "visible")
                self.assertEqual(pack.status, "active")
                self.assertEqual(len(pack.aliases), 0)
                # v3 has no `content` roots; capabilities are declared maps.
                self.assertEqual(pack.content, {})
                self.assertTrue(pack.actions, "pack declares no actions")
                self.assertEqual(
                    {descriptor["type"] for descriptor in pack.rendering.values()},
                    set(rendering_types),
                )

    def test_declared_rendering_elements_match_element_manifests_on_disk(self) -> None:
        for pack_id in CORE_PACKS:
            with self.subTest(pack=pack_id):
                pack_root = PACKS_ROOT / pack_id
                pack = load_pack_manifest(pack_root / "pack.yaml")
                declared = {
                    descriptor["path"]
                    for descriptor in pack.rendering.values()
                    if descriptor["type"] == "element"
                }
                on_disk = {
                    path.relative_to(pack_root).as_posix()
                    for path in pack_root.rglob("element.yaml")
                }
                # Every element manifest is declared, and every declared
                # descriptor exists: none orphaned in either direction.
                self.assertEqual(declared, on_disk)

    def test_no_retired_v2_capability_manifests_remain(self) -> None:
        for pack_id in CORE_PACKS:
            with self.subTest(pack=pack_id):
                pack_root = PACKS_ROOT / pack_id
                leftovers = sorted(
                    path.relative_to(pack_root).as_posix()
                    for path in pack_root.rglob("*")
                    if path.name in RETIRED_V2_MANIFESTS
                )
                self.assertEqual(leftovers, [])


if __name__ == "__main__":
    unittest.main()
