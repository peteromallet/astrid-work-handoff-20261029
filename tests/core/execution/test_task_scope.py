from __future__ import annotations

import os
import signal
import subprocess
import sys
import time

import pytest

from astrid.core.execution import generic_host, task_scope
from astrid.core.execution.task_scope import TaskScopeUnresolved, spawn

PY = sys.executable
pytestmark = pytest.mark.posix_native

GRANDCHILDREN = (
    "import subprocess,sys,time;"
    "c=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);"
    "print(c.pid,flush=True);time.sleep(60)"
)
STUBBORN = (
    "import signal,sys,time,subprocess;"
    "signal.signal(signal.SIGTERM,signal.SIG_IGN);"
    "c=subprocess.Popen([sys.executable,'-c','import signal,time;"
    "signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)']);"
    "print(c.pid,flush=True);time.sleep(60)"
)
ESCAPEE = (
    "import subprocess,sys,time;"
    "c=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],start_new_session=True);"
    "print(c.pid,flush=True);time.sleep(60)"
)


def alive(pid: int) -> bool:
    out = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(out) and not out.startswith("Z")


def launch(code: str):
    process = spawn([PY, "-c", code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return process, int(process.stdout.readline())


def test_group_with_grandchildren_is_killed_at_teardown():
    process, child = launch(GRANDCHILDREN)
    assert alive(child)
    assert task_scope.stop(process, 1.0).status == "settled"
    assert not alive(child) and process.returncode is not None


def test_kill_escalation_for_term_ignorers(monkeypatch):
    process, child = launch(STUBBORN)
    time.sleep(0.3)
    sent = []
    killpg = task_scope._killpg

    def record_signal(pgid, sig):
        sent.append(sig)
        return killpg(pgid, sig)

    monkeypatch.setattr(task_scope, "_killpg", record_signal)
    report = task_scope.stop(process, 0.3)
    assert report.status == "settled"
    assert signal.SIGKILL in sent
    assert not alive(child)
    assert process.returncode is not None


def test_cancel_midrun_leaves_nothing():
    process, child = launch(GRANDCHILDREN)
    assert process.poll() is None
    generic_host._terminate_process_group(process, grace_seconds=0.5)
    assert not alive(child) and not alive(process.pid)


def test_leader_exits_before_helper():
    code = ("import subprocess,sys;"
            "c=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);"
            "print(c.pid,flush=True)")
    process, helper = launch(code)
    process.wait()
    assert alive(helper)
    assert task_scope.stop(process, 0.5).status == "settled"
    assert not alive(helper)


def test_setsid_escapee_is_reported_unresolved_and_not_signalled():
    process, escapee = launch(ESCAPEE)
    try:
        with pytest.raises(TaskScopeUnresolved) as raised:
            generic_host._terminate_process_group(process, grace_seconds=0.3)
        report = raised.value.report
        assert report.status == "unresolved"
        assert [s.pid for s in report.survivors] == [escapee]
        assert str(escapee) in str(raised.value)
        assert alive(escapee)  # a census finding is never signal authority
        # Unresolved fails the task, it is not a host-latching custody error.
        assert not issubclass(TaskScopeUnresolved, generic_host.CleanupUncertainError)
    finally:
        os.kill(escapee, 9)


# --- crash-orphan journal ---------------------------------------------------

def _gone(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    return False


def test_journal_records_scope_owner_only_and_clears_on_settle(tmp_path):
    journal = tmp_path / "scopes.json"
    task_scope.set_orphan_journal(journal)
    try:
        process = spawn([PY, "-c", "import time;time.sleep(60)"], cwd=str(tmp_path))
        import json, stat
        entries = json.loads(journal.read_text())
        assert [(e["pid"], e["pgid"]) for e in entries] == [(process.pid, process.pid)]
        assert entries[0]["start"] and entries[0]["task"] == str(tmp_path)
        assert stat.S_IMODE(journal.stat().st_mode) == 0o600
        assert task_scope.stop(process, 0.3).status == "settled"
        assert json.loads(journal.read_text()) == []
    finally:
        task_scope.set_orphan_journal(None)


def test_startup_kills_recorded_live_group_from_a_crashed_host(tmp_path):
    journal = tmp_path / "scopes.json"
    task_scope.set_orphan_journal(journal)
    try:
        process = spawn([PY, "-c", GRANDCHILDREN.replace("time.sleep(60)", "time.sleep(60)")],
                        stdout=subprocess.PIPE, text=True)
        grandchild = int(process.stdout.readline())
    finally:
        task_scope.set_orphan_journal(None)  # the host "crashed": no stop, entry stays
    try:
        notes = task_scope.reap_orphans(journal)
        assert notes and "killed orphan task scope" in notes[0]
        process.wait(timeout=5)
        deadline = time.monotonic() + 5
        while not _gone(grandchild) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert _gone(grandchild)
        assert journal.read_text() == "[]"
    finally:
        for pid in (process.pid, grandchild):
            try:
                os.killpg(pid, 9)
            except (ProcessLookupError, PermissionError):
                pass


def test_managed_stdin_eof_waits_for_host_task_tree_cleanup(tmp_path):
    from astrid.core.execution.generic_host import _ManagedStdinShutdown

    journal = tmp_path / "scopes.json"
    read_fd, write_fd = os.pipe()
    stream = os.fdopen(read_fd, "r", encoding="utf-8")
    host = generic_host.GenericPackHost(pack_roots=[], client=None)
    process = None
    task_scope.set_orphan_journal(journal)
    try:
        process = spawn(
            [PY, "-c", GRANDCHILDREN], cwd=str(tmp_path), stdout=subprocess.PIPE, text=True
        )
        assert process.stdout is not None
        grandchild = int(process.stdout.readline())
        host._track_process(process)
        lifecycle = _ManagedStdinShutdown(host, stream)
        lifecycle.start()
        os.close(write_fd)
        write_fd = -1

        assert lifecycle.run_loop(lambda: host._shutdown.wait(timeout=5))
        assert process.wait(timeout=5) is not None
        deadline = time.monotonic() + 5
        while not _gone(grandchild) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert _gone(grandchild)
        assert journal.read_text() == "[]"
    finally:
        if write_fd >= 0:
            os.close(write_fd)
        stream.close()
        if process is not None and process.poll() is None:
            task_scope.stop(process, 0.5)
        if process is not None and process.stdout is not None:
            process.stdout.close()
        task_scope.set_orphan_journal(None)


def test_startup_never_signals_a_recorded_pid_now_owned_by_an_unrelated_process(tmp_path):
    import json
    bystander = subprocess.Popen([PY, "-c", "import time;time.sleep(60)"], start_new_session=True)
    try:
        # Same pid and group number as the bystander, but a different start time:
        # the recorded owner died and the pid was reused.
        journal = tmp_path / "scopes.json"
        journal.write_text(json.dumps([{"pid": bystander.pid, "pgid": bystander.pid,
                                        "start": "long-ago", "task": "t"}]))
        assert task_scope.reap_orphans(journal) == []
        assert bystander.poll() is None
        assert journal.read_text() == "[]"
    finally:
        bystander.kill()
        bystander.wait()
