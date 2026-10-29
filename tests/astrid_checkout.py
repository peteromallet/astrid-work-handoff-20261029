"""Locate the second checkout the integration lane needs: Astrid.

``ASTRID_CHECKOUT`` names the Astrid repository root (the folder that holds the
``astrid`` package). Without it the sibling ``../astrid`` is used. A missing
checkout fails the test; it is never a skip.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

RUNTIME_ROOT = Path(__file__).resolve().parents[1]


def astrid_checkout() -> Path:
    root = Path(os.environ.get("ASTRID_CHECKOUT") or RUNTIME_ROOT.parent / "astrid").resolve()
    if not (root / "astrid" / "core" / "execution" / "generic_host.py").is_file():
        raise AssertionError(
            f"Astrid checkout is unavailable: {root} (set ASTRID_CHECKOUT to the Astrid repository root)"
        )
    return root


@pytest.fixture
def astrid_importable(monkeypatch):
    """Import ``astrid`` from the checkout; its third-party dependencies come from the interpreter."""
    monkeypatch.syspath_prepend(str(astrid_checkout()))
    for name in [n for n in sys.modules if n == "astrid" or n.startswith("astrid.")]:
        if not str(getattr(sys.modules[name], "__file__", "") or "").startswith(str(astrid_checkout())):
            monkeypatch.delitem(sys.modules, name)
    return astrid_checkout()
