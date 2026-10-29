"""A web-page capture that is cut off mid-capture leaves no Chromium behind.

The browser is a fake: a Python script whose file name is ``chrome-headless-shell``
and which starts a helper of the same name, then never answers the DevTools pipe.
So the capture client is stuck waiting for its first reply, exactly where a real
capture would be when its client goes away. No real Chrome, no network, no RAM.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

from astrid.core.env_vars import ASTRID_INTERNAL_INVOCATION

pytestmark = pytest.mark.posix_native

FAKE_BROWSER = """\
import os, subprocess, sys, time
from pathlib import Path

if "--helper" in sys.argv:
    time.sleep(600)
    raise SystemExit(0)
state = Path(os.environ["FAKE_CHROME_STATE"])
helper = subprocess.Popen([sys.executable, __file__, "--helper"])
(state / "pids.txt").write_text(f"{os.getpid()} {helper.pid}\\n", encoding="utf-8")
time.sleep(600)
"""


def _ps_rows() -> list[tuple[int, int, str]]:
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,command="], capture_output=True, text=True, check=True).stdout
    rows = []
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            rows.append((int(parts[0]), int(parts[1]), parts[2]))
    return rows


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _wait_for(predicate, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


@pytest.mark.parametrize("signum", [signal.SIGTERM, signal.SIGINT])
def test_client_cut_off_mid_capture_leaves_no_orphan_browser(tmp_path: Path, signum: int) -> None:
    state = tmp_path / "state"
    state.mkdir()
    browser = tmp_path / "chrome-headless-shell"
    browser.write_text(f"#!{sys.executable}\n" + FAKE_BROWSER, encoding="utf-8")
    browser.chmod(0o755)
    env = {
        **os.environ,
        ASTRID_INTERNAL_INVOCATION: "1",
        "ASTRID_CAPTURE_CHROME": str(browser),
        "FAKE_CHROME_STATE": str(state),
    }
    # Main admits capture only through the host broker contract; supply it so the
    # client reaches the browser launch. The fake browser never navigates.
    env.update({
        "ASTRID_BROKER_PROXY": "http://127.0.0.1:43123",
        "ASTRID_NETWORK_POLICY": json.dumps({
            "allowed_protocols": ["dns", "tcp"], "dynamic_url_inputs": ["url"], "allow_redirects": False,
            "broker": {"kind": "broker", "host_managed": True, "enforced": True, "observable": True},
        }),
        "ASTRID_NETWORK_ADMISSION": json.dumps({"allowed_routes": ["https://example.com:443"]}),
        "ASTRID_NETWORK_BROKER_EVIDENCE": str((tmp_path / "broker-evidence.json").resolve()),
    })
    client = subprocess.Popen(
        [
            sys.executable, "-m", "astrid.packs.capture.actions.web_page.run",
            "--url", "https://example.com/", "--out", str(tmp_path / "out"),
        ],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    pids_file = state / "pids.txt"
    browser_pid = helper_pid = None
    try:
        assert _wait_for(pids_file.exists, 60), "the fake browser never started"
        browser_pid, helper_pid = (int(x) for x in pids_file.read_text().split())
        assert _alive(browser_pid) and _alive(helper_pid)

        client.send_signal(signum)  # the client goes away mid-capture
        client.wait(timeout=60)
    finally:
        if client.poll() is None:
            client.kill()
            client.wait()
        # Failure-path cleanup: the fake browser leads its own session (the client
        # started it that way), so its group is exactly what this test spawned.
        if browser_pid is not None:
            try:
                os.killpg(browser_pid, signal.SIGKILL)
            except OSError:
                pass

    def _gone() -> bool:
        return not _alive(browser_pid) and not _alive(helper_pid)

    assert _wait_for(_gone, 10), "a fake browser process survived the client"
    # Nothing left that names this test's fake browser, orphaned or not.
    marker = str(browser)
    leftovers = [row for row in _ps_rows() if marker in row[2] and row[0] not in (os.getpid(),)]
    assert leftovers == [], f"leftover browser processes: {leftovers}"
