"""Check the public doctor command's C2 contract in a hermetic workspace.

The doctor observes the Runtime without starting it. This gate gives it an
empty support root and isolated user directories so host configuration cannot
change the result; either a healthy response or a typed C2 failure is valid.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _run(
    command: list[str], *, env: dict[str, str], cwd: Path
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        env=env,
        cwd=cwd,
        text=True,
        capture_output=True,
    )


def _report_failure(label: str, result: subprocess.CompletedProcess[str]) -> None:
    print(f"CI doctor {label} failed (exit {result.returncode})", file=sys.stderr)
    if result.stdout:
        print(result.stdout, file=sys.stderr, end="")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")


def hermetic_env(home: Path) -> dict[str, str]:
    """Drop inherited machine state and route all writable roots to temp."""
    env = {
        "PATH": os.environ.get("PATH", os.defpath),
        "HOME": str(home),
        "TMPDIR": str(home),
        "ASTRID_RUNTIME_DATA_ROOT": str(home / "data"),
        "ASTRID_STATE_HOME": str(home / "astrid-state"),
    }
    for name in ("XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"):
        env[name] = str(home / name.lower())
    return env


def contract_errors(payload: object, returncode: int) -> list[str]:
    """Validate the C2 document and consistency with the command's health."""
    from astrid.core.gateway import diagnostics

    if returncode not in (0, 1):
        return [f"doctor exited {returncode}; expected 0 (healthy) or 1 (typed failure)"]
    if not isinstance(payload, dict):
        return ["doctor --json did not print a JSON object"]

    report = payload.get("diagnostic")
    if not isinstance(report, dict):
        return ["doctor --json carries no C2 diagnostic"]

    errors = list(diagnostics.validate_diagnostic(report))
    is_healthy = report.get("problemCode") is None
    if is_healthy != (returncode == 0):
        errors.append(
            f"problemCode={report.get('problemCode')!r} disagrees with exit {returncode}"
        )
    if not is_healthy and not report.get("nextActions"):
        errors.append("a failed diagnostic must carry a typed next action")
    for key in ("healthy", "ok"):
        if key in payload and (not isinstance(payload[key], bool) or payload[key] != is_healthy):
            errors.append(f"{key} disagrees with the diagnostic's problemCode")
    return errors


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="astrid-ci-doctor-") as raw:
        home = Path(raw).resolve()
        result = _run(
            [sys.executable, "-m", "astrid", "doctor", "--json"],
            env=hermetic_env(home),
            cwd=home,
        )
    try:
        payload = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        errors = [f"doctor --json did not print a JSON object: {exc}"]
    else:
        errors = contract_errors(payload, result.returncode)
    if errors:
        _report_failure("contract check", result)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
