"""Shared installer support guidance and visible support-bundle locations."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HELP_URL = "https://github.com/banodoco/astrid-agent/blob/main/docs/setup/troubleshooting.md#asking-for-help"
HELP_MESSAGE = f"For help, attach the doctor bundle using the instructions at {HELP_URL}"
FAILURE_MESSAGE = "Astrid couldn't finish. Your work is kept."


def default_doctor_bundle() -> Path:
    home = Path.home()
    folder = home / "Desktop" if (home / "Desktop").is_dir() else home / "Downloads"
    return folder / "astrid-doctor.zip"


def reveal_bundle(bundle: Path) -> None:
    """Reveal a saved bundle without making headless doctor runs fail."""
    if sys.platform == "darwin":
        argv = ["open", "-R", str(bundle)]
    elif sys.platform == "win32":
        explorer = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "explorer.exe"
        argv = [str(explorer), f"/select,{bundle}"]
    else:
        argv = ["xdg-open", str(bundle.parent)]
    try:
        subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, close_fds=True)
    except OSError:
        pass  # The printed path remains usable without a desktop session.
