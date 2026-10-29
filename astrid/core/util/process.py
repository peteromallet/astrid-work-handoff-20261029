"""Keep terminal hand-offs attached until the selected program exits."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from collections.abc import Mapping
from typing import NoReturn


def replace_process(argv: list[str], env: Mapping[str, str] | None = None) -> NoReturn:
    """Replace this process, or wait and forward its status on Windows."""
    if sys.platform != "win32":
        os.execvpe(argv[0], argv, os.environ if env is None else env)

    # The child shares our console and receives Ctrl+C itself. A callable
    # handler keeps this parent waiting without passing SIG_IGN to the child.
    previous_handler = signal.signal(signal.SIGINT, lambda _signum, _frame: None)
    try:
        result = subprocess.run(argv, env=env, check=False)
    finally:
        signal.signal(signal.SIGINT, previous_handler)
    # Older Python versions convert SystemExit through a signed Windows long.
    # Preserve the child's DWORD bit pattern without overflowing that conversion.
    returncode = result.returncode
    if returncode > 0x7FFFFFFF:
        returncode -= 0x100000000
    raise SystemExit(returncode)
