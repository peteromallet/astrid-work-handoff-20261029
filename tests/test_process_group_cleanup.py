from __future__ import annotations

import os
import sys

import pytest


@pytest.mark.posix_native  # POSIX-only process-group API
def test_isolated_child_group_is_reaped_after_interrupted_journey(owned_process_groups):
    process = owned_process_groups.popen(
        [sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True
    )
    pgid = os.getpgid(process.pid)
    try:
        with pytest.raises(TimeoutError, match="simulated pytest timeout"):
            raise TimeoutError("simulated pytest timeout during host journey")
    finally:
        owned_process_groups.terminate_all()
    with pytest.raises(ProcessLookupError):
        os.killpg(pgid, 0)


def test_a_group_is_signalled_only_while_it_is_still_ours(monkeypatch):
    import subprocess
    import sys

    import tests.process_groups as groups

    leader = subprocess.Popen([sys.executable, "-c", "pass"], start_new_session=True)
    leader.wait()
    monkeypatch.setattr(groups, "_group_members", lambda pgid: [])
    assert not groups._still_ours(leader.pid, [leader])  # nothing left to reap
    monkeypatch.setattr(groups, "_group_members", lambda pgid: [pgid])
    assert not groups._still_ours(leader.pid, [leader])  # a new process took the id: a stranger
    monkeypatch.setattr(groups, "_group_members", lambda pgid: [pgid + 1])
    assert groups._still_ours(leader.pid, [leader])  # our orphan outlived the leader
