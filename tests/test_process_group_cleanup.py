from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from runtime_protocol.store import RealmStore
from tests.lanes import requires_posix_process_group_id_reuse


def test_real_daemon_group_is_reaped_after_interrupted_journey(tmp_path, owned_process_groups):
    root = tmp_path / "realm"
    RealmStore.initialize(root).close()
    support = tmp_path / "support"
    support.mkdir()
    process = owned_process_groups.popen(
        [sys.executable, "-m", "runtime_protocol", "start", "--root", str(root), "--support-root", str(support)],
        cwd=Path(__file__).parents[1],
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.2)
    assert process.poll() is None, "real runtime daemon did not stay up for interruption check"
    try:
        with pytest.raises(TimeoutError, match="simulated pytest timeout"):
            raise TimeoutError("simulated pytest timeout during daemon journey")
    finally:
            owned_process_groups.terminate_all()
    assert process.poll() is not None


@requires_posix_process_group_id_reuse
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
