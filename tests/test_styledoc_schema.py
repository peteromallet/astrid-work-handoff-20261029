import json
import shutil
import tempfile
import unittest
from pathlib import Path

from astrid.core.theme import _schema as theme_schema
from astrid.core.theme import ThemeValidationError, load_theme, resolve_theme_asset


ROOT = Path(__file__).resolve().parents[2]


def base_theme() -> dict:
    return {
        "id": "fixture",
        "visual": {
            "color": {"fg": "#fff", "bg": "#000", "accent": "#f00"},
            "type": {
                "families": {"heading": "serif", "body": "serif"},
                "size": {"base": 64, "small": 36, "large": 96},
                "weight": {"normal": 400, "bold": 700},
                "lineHeight": 1.1,
            },
            "motion": {"fadeMs": 200},
            "canvas": {"width": 1920, "height": 1080, "fps": 30},
        },
    }


class StyledocSchemaTest(unittest.TestCase):
    def make_tempdir(self) -> Path:
        path = Path(tempfile.mkdtemp(prefix="styledoc-schema-"))
        self.addCleanup(shutil.rmtree, path, ignore_errors=True)
        return path

    def write_theme(self, payload: dict) -> Path:
        path = self.make_tempdir() / "theme.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_rejects_bare_string_references_with_specific_message(self) -> None:
        payload = base_theme()
        payload["generation"] = {"references": ["foo.jpg"]}
        with self.assertRaises(ThemeValidationError) as exc_info:
            load_theme(self.write_theme(payload))

        message = str(exc_info.exception)
        self.assertIn("references[0]", message)
        self.assertIn("'file'", message)
        self.assertIn("'description'", message)

    def test_missing_visual_is_rejected(self) -> None:
        payload = base_theme()
        payload.pop("visual")
        with self.assertRaises(ThemeValidationError):
            load_theme(self.write_theme(payload))

    def test_missing_voice_loads(self) -> None:
        payload = base_theme()
        loaded = load_theme(self.write_theme(payload))
        self.assertEqual(loaded["id"], "fixture")
        self.assertNotIn("voice", loaded)

    def test_resolve_theme_asset_rejects_path_escape(self) -> None:
        theme_dir = self.make_tempdir()
        with self.assertRaises(ThemeValidationError):
            resolve_theme_asset(theme_dir, "../etc/passwd")

    def test_hand_rolled_references_check_is_independent_of_jsonschema(self) -> None:
        payload = base_theme()
        payload["generation"] = {"references": ["foo.jpg"]}
        with self.assertRaises(ThemeValidationError) as exc_info:
            theme_schema._check_generation_file_items(payload)

        self.assertIn("references[0]", str(exc_info.exception))


if __name__ == "__main__":
    unittest.main()
