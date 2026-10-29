from __future__ import annotations

import ast
import hashlib
from pathlib import Path

import pytest

from astrid.core import path_utils
from astrid.core.execution.generic_host import _managed_input_staging_name


@pytest.mark.parametrize("value", [r"C:\Users\Ada\clip.mp4", "D:/media/clip.mp4"])
def test_windows_drive_paths_are_not_url_schemes(value):
    assert path_utils.is_native_absolute_path(value, windows=True)
    assert not path_utils.has_url_scheme(value)


def test_file_uri_decoding_handles_windows_drive_and_percent_escapes():
    assert str(path_utils.file_uri_to_path("file:///C:/Users/Ada/My%20Clip.mp4", windows=True)) == r"C:\Users\Ada\My Clip.mp4"
    assert str(path_utils.file_uri_to_path("file:///C:/Users/Ada/%2520.mp4", windows=True)) == r"C:\Users\Ada\%20.mp4"


def test_file_uri_decoding_uses_native_posix_mapping():
    assert path_utils.file_uri_to_path("file:///tmp/My%20Clip.mp4", windows=False) == Path("/tmp/My Clip.mp4")


@pytest.mark.parametrize("filename", ["CON.txt", "NUL", "stream:payload.mp4", "trailing. ", "same.mp4"])
def test_managed_input_staging_names_never_include_user_filename(filename):
    digest = "a" * 64
    name = _managed_input_staging_name("source_video", digest, filename)
    assert name.startswith(f"managed-{hashlib.sha256(b'source_video').hexdigest()[:16]}-{digest}")
    assert filename not in name
    assert ":" not in name
    assert not name.endswith((".", " "))


def test_owned_omp_protocols_and_generated_readme_pin_utf8():
    root = Path(__file__).resolve().parents[2]
    paths = [
        root / "astrid/omp_agent.py",
        root / "astrid/core/execution/generic_host.py",
        root / "astrid/sdk/timeline/store.py",
        root / "scripts/render_readme.py",
    ]
    for path in paths:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            function = node.func
            method = function.attr if isinstance(function, ast.Attribute) else ""
            keywords = {keyword.arg: keyword.value for keyword in node.keywords}
            if method in {"read_text", "write_text"}:
                assert "encoding" in keywords, f"{path}:{node.lineno} {method} needs an explicit encoding"
            if isinstance(function, ast.Name) and function.id == "open":
                mode = keywords.get("mode") or (node.args[1] if len(node.args) > 1 else None)
                mode_value = ast.literal_eval(mode) if mode is not None else "r"
                if isinstance(mode_value, str) and "b" not in mode_value:
                    assert "encoding" in keywords, f"{path}:{node.lineno} text open needs an explicit encoding"
            if keywords.get("text") and ast.literal_eval(keywords["text"]):
                encoding = keywords.get("encoding")
                assert isinstance(encoding, ast.Constant) and encoding.value == "utf-8", (
                    f"{path}:{node.lineno} text child needs UTF-8"
                )
                errors = keywords.get("errors")
                assert isinstance(errors, ast.Constant) and errors.value == "replace", (
                    f"{path}:{node.lineno} foreign tool output needs replacement decoding"
                )
