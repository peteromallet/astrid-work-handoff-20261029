"""Shared exact-count gate for the Ruff and mypy baselines (testing plan, Owned debt).

Both gates compare a finding count with the committed baseline. The baseline is exact, like
`compare_structure_baseline`: a higher count is a regression, and a lower count fails until the
baseline is rewritten with `--write-baseline`, so deleted code cannot leave slack for a later
regression to fill.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any


def verdict(label: str, current: int, baseline: int) -> tuple[int, str]:
    """Return (exit code, message) for a current finding count against its baseline."""
    summary = f"{label} findings: current={current} baseline={baseline}"
    if current > baseline:
        return 1, f"{summary}\nERROR: {label} regressed by {current - baseline}; fix the new findings."
    if current < baseline:
        return 1, (
            f"{summary}\nERROR: {label} improved by {baseline - current}; lock it in with "
            f"`python -m scripts.reshape.compare_{label.lower()}_baseline --write-baseline`."
        )
    return 0, summary


def main(label: str, default_baseline: Path, run: Callable[[], dict[str, Any]]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, default=default_baseline)
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()

    try:
        current = run()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.write_baseline:
        args.baseline.write_text(json.dumps(current, indent=2) + "\n")
        print(f"Wrote {label} baseline to {args.baseline} ({current['finding_count']} findings)")
        return 0

    baseline = json.loads(args.baseline.read_text())
    code, message = verdict(label, int(current["finding_count"]), int(baseline["finding_count"]))
    print(message, file=sys.stderr if code else sys.stdout)
    return code
