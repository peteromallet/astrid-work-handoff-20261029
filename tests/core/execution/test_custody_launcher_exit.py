"""A launcher process must be able to exit while the detached child it launched is still running."""
from __future__ import annotations

import subprocess
import sys
import textwrap
import time

import pytest

CHILD_SECONDS = 8

LAUNCHER = textwrap.dedent(
    """
    import sys
    from astrid.core.execution import custody_broker as cb
    from astrid.core.execution.process_group import popen_owned_group

    # A faithful pack-source policy: the launch is delegated to the inventory owner, as with an active pack source.
    cb._inventory_launch_policy = lambda env, cwd: {
        "state_path": "/nonexistent", "state_sha256": "x", "roots": {}, "git": "/usr/bin/git",
        "git_sha256": "x", "cwd": cwd, "environment": dict(env)}
    p = popen_owned_group(["/bin/sleep", sys.argv[1]], detached=True, stdin=-3, stdout=-3, stderr=-3, close_fds=True)
    owner = getattr(p._astrid_custody, "_inventory_owner", None)
    print("owner", owner is not None, "daemon", getattr(getattr(owner, "thread", None), "daemon", None), flush=True)
    """
)


@pytest.mark.darwin_native
def test_a_detached_child_does_not_keep_its_launcher_alive() -> None:
    started = time.monotonic()
    result = subprocess.run([sys.executable, "-c", LAUNCHER, str(CHILD_SECONDS)], capture_output=True, text=True,
                            timeout=CHILD_SECONDS + 30)
    elapsed = time.monotonic() - started
    assert result.returncode == 0, result.stderr[-800:]
    assert "owner True daemon True" in result.stdout, result.stdout
    # The launcher returned long before the child's end: nothing it started holds the interpreter open.
    assert elapsed < CHILD_SECONDS - 2, f"launcher stayed alive {elapsed:.2f}s behind a {CHILD_SECONDS}s child"
