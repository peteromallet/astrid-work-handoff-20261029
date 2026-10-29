"""Doctor lists elements that discovery skipped, with the reason (element admission).

Only the doctor section is ported: the validator short_description limit and the
timeline skip-reason message it also pins are not on main.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest import mock

from astrid.core.element.registry import ElementRegistry, SkippedElement, element_skip_section


class DoctorElementSkipSectionTest(unittest.TestCase):
    def test_section_lists_skipped_elements_with_reason(self) -> None:
        skipped = SkippedElement(
            pack_id="test_pack",
            kind="effects",
            path=Path("/packs/test_pack/elements/effects/am-footage/element.yaml"),
            error="effects/am-footage: short_description is 166 chars; max is 120",
        )
        registry = ElementRegistry(diagnostics=[skipped])
        with mock.patch("astrid.core.element.registry.load_default_registry", return_value=registry):
            section = element_skip_section()
        self.assertEqual(section["count"], 1)
        record = section["skipped"][0]
        self.assertEqual(record["element_id"], "am-footage")
        self.assertEqual(record["pack_id"], "test_pack")
        self.assertIn("short_description is 166 chars", record["error"])
        self.assertIn("fix", record)

    def test_section_never_raises(self) -> None:
        with mock.patch(
            "astrid.core.element.registry.load_default_registry",
            side_effect=RuntimeError("boom"),
        ):
            section = element_skip_section()
        self.assertEqual(section, {"count": 0, "skipped": [], "error": "boom"})


if __name__ == "__main__":
    unittest.main()
