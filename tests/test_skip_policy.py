"""No test leaves itself out by hand: a skip is a lane marker from the registry in tests/lanes.py.

The runtime guard (tests/test_skip_guard.py) fails a run on any skip that no registry entry declares. This is its
static half: it finds the skip and xfail calls that would only fire on some other machine, so they cannot wait there
to hide a test. tests/lanes.py is the one place that may build a skip.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
REGISTRY = "tests/lanes.py"
HIDDEN = {
    "pytest.skip", "pytest.importorskip", "pytest.xfail", "pytest.mark.skip", "pytest.mark.skipif", "pytest.mark.xfail",
    "unittest.skip", "unittest.skipIf", "unittest.skipUnless", "unittest.SkipTest", "unittest.case.SkipTest",
}
HIDDEN_METHODS = {"skipTest"}


def hidden_gates(source: str) -> list[tuple[int, str]]:
    """The (line, dotted name) of every skip or xfail the source calls, names resolved through its imports."""
    tree = ast.parse(source)
    imported: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported[(alias.asname or alias.name).split(".")[0]] = alias.name if alias.asname else alias.name.split(".")[0]
        elif isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                imported[alias.asname or alias.name] = f"{node.module}.{alias.name}"
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            parts = [node.attr]
            value = node.value
            while isinstance(value, ast.Attribute):
                parts.append(value.attr)
                value = value.value
            if isinstance(value, ast.Name):
                dotted = ".".join([imported.get(value.id, value.id), *reversed(parts)])
                if dotted in HIDDEN or node.attr in HIDDEN_METHODS:
                    found.append((node.lineno, dotted))
        elif isinstance(node, ast.Name) and imported.get(node.id) in HIDDEN:
            found.append((node.lineno, imported[node.id]))
    return sorted(set(found))


@pytest.mark.parametrize("source", [
    "import pytest\npytest.skip('x')\n",
    "import pytest\npytest.importorskip('x')\n",
    "import pytest\n@pytest.mark.skipif(True, reason='x')\ndef test(): pass\n",
    "import pytest\n@pytest.mark.skip(reason='x')\ndef test(): pass\n",
    "import pytest\n@pytest.mark.xfail\ndef test(): pass\n",
    "import pytest\npytest.xfail('x')\n",
    "import unittest\n@unittest.skipUnless(False, 'x')\nclass T(unittest.TestCase): pass\n",
    "import unittest\nclass T(unittest.TestCase):\n    def test(self):\n        self.skipTest('x')\n",
    "import pytest as p\np.skip('x')\n",
    "from pytest import skip as omit\nomit('x')\n",
    "from unittest import SkipTest\nraise SkipTest('x')\n",
], ids=["skip", "importorskip", "skipif", "skip-mark", "xfail-mark", "xfail", "unittest", "skipTest", "alias", "from-import", "SkipTest"])
def test_the_scanner_finds_every_way_to_hide_a_test(source: str) -> None:
    assert hidden_gates(source)


def test_the_scanner_leaves_lane_markers_and_plain_strings_alone() -> None:
    source = "import pytest\n\n@pytest.mark.ffmpeg\ndef test():\n    text = 'pytest.skip is not called'\n"
    assert hidden_gates(source) == []


def _test_python_files():
    """Every Python file in this repo that holds tests: any tests directory, test_*.py and *_test.py."""
    seen = set()
    for path in REPO.rglob("*.py"):
        parts = set(path.relative_to(REPO).parts)
        if parts & {".venv", "node_modules", ".git", "build", "dist"} or any(p.startswith(".venv") for p in parts):
            continue
        if "tests" in parts or path.name.startswith("test_") or path.name.endswith("_test.py") or path.name == "conftest.py":
            seen.add(path)
    return sorted(seen)


def test_no_test_file_skips_by_hand() -> None:
    offenders = []
    files = _test_python_files()
    assert files, "the scan found no test files"
    for path in files:
        relative = path.relative_to(REPO).as_posix()
        if relative == REGISTRY:
            continue
        offenders += [f"{relative}:{line} {name}" for line, name in hidden_gates(path.read_text(encoding="utf-8"))]
    assert not offenders, "mark the test with an entry from tests/lanes.py instead of skipping by hand: " + ", ".join(offenders)
