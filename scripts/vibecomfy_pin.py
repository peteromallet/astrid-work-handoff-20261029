#!/usr/bin/env python3
"""Print or bump the VibeComfy revision Astrid is pinned to.

The pin lives in one place: ``VIBECOMFY_ENGINE_REVISION`` in
``astrid/core/generation/vibecomfy_dependency.py``. CI, the Windows GPU
environment and the tests read it from there.

    python scripts/vibecomfy_pin.py            # print the pinned revision
    python scripts/vibecomfy_pin.py <sha>      # bump it (full 40-hex commit)

After a bump, run the VibeComfy-related tests against a checkout at the new
revision and set the same sha in the hosted ``install-manifest.json`` (or drop
its ``vibecomfy`` entry so the installer uses this pin).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "astrid" / "core" / "generation" / "vibecomfy_dependency.py"
_PIN = re.compile(r'^(VIBECOMFY_ENGINE_REVISION = ")([0-9a-f]{40})(")$', re.M)


def read() -> str:
    match = _PIN.search(SOURCE.read_text(encoding="utf-8"))
    if match is None:
        raise SystemExit(f"VIBECOMFY_ENGINE_REVISION not found in {SOURCE}")
    return match.group(2)


def bump(revision: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise SystemExit("expected a full 40-character lowercase commit sha")
    text = SOURCE.read_text(encoding="utf-8")
    read()
    SOURCE.write_text(_PIN.sub(lambda m: m.group(1) + revision + m.group(3), text), encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        raise SystemExit(__doc__)
    if argv:
        bump(argv[0])
    print(read())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
