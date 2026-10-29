from __future__ import annotations

import unittest
from pathlib import Path

from astrid.core.execution.executor.registry import load_default_registry as load_executor_registry
from astrid.core.execution.orchestrator.registry import (
    load_default_registry as load_orchestrator_registry,
)


class DefaultRegistryScopeTest(unittest.TestCase):
    def test_default_executor_registries_include_packs(self) -> None:
        canonical = load_executor_registry()
        canonical_ids = set(canonical.as_mapping())

        self.assertIn("rendering.render", canonical_ids)
        self.assertIn("youtube.upload", canonical_ids)
        self.assertIn("moirae.moirae", canonical_ids)
        self.assertIn("vibecomfy.run", canonical_ids)
        self.assertIn("vibecomfy.validate", canonical_ids)

        youtube = canonical.get("youtube.upload")
        self.assertEqual(youtube.metadata["source"], "pack")
        self.assertEqual(youtube.metadata["source_pack"], "youtube")
        self.assertNotIn("pack_id", youtube.metadata)
        self.assertTrue(youtube.metadata["pack_root"].endswith("astrid/packs/youtube"))
        self.assertEqual(youtube.metadata["runtime_file"], "actions/upload/run.py")
        self.assertTrue((Path(youtube.metadata["pack_root"]) / "pack.yaml").is_file())

        for executor_id, folder in (
            ("understanding.audio_understand", "audio_understand"),
            ("understanding.visual_understand", "visual_understand"),
            ("understanding.video_understand", "video_understand"),
        ):
            with self.subTest(executor_id=executor_id):
                action = canonical.get(executor_id)
                self.assertEqual(action.metadata["source"], "pack")
                self.assertEqual(action.metadata["source_pack"], "understanding")
                self.assertNotIn("pack_id", action.metadata)
                self.assertTrue(action.metadata["pack_root"].endswith("astrid/packs/understanding"))
                self.assertEqual(action.metadata["runtime_file"], f"actions/{folder}/run.py")
                self.assertTrue((Path(action.metadata["pack_root"]) / "pack.yaml").is_file())

        vibecomfy = canonical.get("vibecomfy.run")
        self.assertEqual(vibecomfy.kind, "external")
        self.assertEqual(vibecomfy.metadata["pack_id"], "vibecomfy")
        self.assertEqual(vibecomfy.metadata["source_pack"], "vibecomfy")
        self.assertEqual(vibecomfy.metadata["source"], "pack")
        self.assertTrue(vibecomfy.metadata["pack_root"].endswith("astrid/packs/vibecomfy"))
        self.assertEqual(vibecomfy.metadata["runtime_file"], "actions/run/run.py")

    def test_default_orchestrator_registries_do_not_classify_vibecomfy_as_orchestrator(self) -> None:
        canonical = load_orchestrator_registry(executor_registry=load_executor_registry())
        canonical_ids = set(canonical.as_mapping())

        # Only metadata.local_orchestrator actions are orchestrators. The
        # video_editing workflows are host executors under schema v3 pack.yaml.
        self.assertEqual(canonical_ids, {"h3_av.transform"})
        self.assertIn("video_editing.hype", load_executor_registry().as_mapping())
        self.assertFalse(any("vibecomfy" in orchestrator_id for orchestrator_id in canonical_ids))
        self.assertFalse(any(orchestrator_id == "youtube.upload" for orchestrator_id in canonical_ids))
        with self.assertRaises(KeyError):
            canonical.get("vibecomfy.run")

    def test_canonical_builtin_executor_runtime_module(self) -> None:
        canonical = load_executor_registry()
        render = canonical.get("rendering.render")
        self.assertEqual(render.metadata["runtime_module"], "astrid.packs.rendering.actions.render.run")

    def test_external_executor_roots_are_pack_native(self) -> None:
        registry = load_executor_registry()

        moirae = registry.get("moirae.moirae").metadata
        self.assertTrue(moirae["pack_root"].endswith("astrid/packs/moirae"))
        self.assertEqual(moirae["runtime_file"], "actions/moirae/run.py")
        vibecomfy = registry.get("vibecomfy.run").metadata
        self.assertTrue(vibecomfy["pack_root"].endswith("astrid/packs/vibecomfy"))
        self.assertEqual(vibecomfy["runtime_file"], "actions/run/run.py")


if __name__ == "__main__":
    unittest.main()
