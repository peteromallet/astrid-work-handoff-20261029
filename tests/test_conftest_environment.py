"""The test bootstrap keeps its bytecode cache configuration local."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


def test_bootstrap_environment_keeps_bytecode_configuration_local(tmp_path: Path) -> None:
    """The bootstrap does not redirect child bytecode caches.

    The bootstrap runs in a child with no PYTHON* variables of its own, so a developer's shell cannot
    change the result.
    """
    clean = {"PATH": os.environ["PATH"], "HOME": str(tmp_path), "PYTHONPATH": str(REPO)}
    result = subprocess.run(
        [sys.executable, "-c", "import json, os, tests.conftest; print(json.dumps(dict(os.environ)))"],
        cwd=REPO, env=clean, capture_output=True, text=True, timeout=120, check=True,
    )
    bootstrapped = json.loads(result.stdout.splitlines()[-1])
    bootstrapped.pop("PYTHONPATH")
    assert bootstrapped["PYTHONDONTWRITEBYTECODE"] == "1"
    assert "PYTHONPYCACHEPREFIX" not in bootstrapped
