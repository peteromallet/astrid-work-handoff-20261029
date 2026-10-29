"""The Windows lock probes must collect without the POSIX-only fcntl module."""
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("module", [
    "tests.sdk.test_rrp_launcher_boundary",
    "tests.packs.runpod.test_worker_release",
    "tests.sdk.test_child_bridge_d18",
    "tests.core.execution.test_generic_host_child_bridge_d18",
    "tests.core.execution.test_generic_host_actions_v3",
    "tests.scripts.test_claim_runpod_5090_backup",
])
def test_lock_probe_modules_import_without_fcntl(module):
    script = """
import importlib.abc
import sys
class WithoutFcntl(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'fcntl':
            raise ModuleNotFoundError("Windows has no fcntl", name='fcntl')
sys.modules.pop('fcntl', None)
sys.meta_path.insert(0, WithoutFcntl())
__import__(sys.argv[1])
"""
    result = subprocess.run(
        [sys.executable, "-c", script, module], cwd=Path(__file__).resolve().parents[1],
        env=dict(os.environ), capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
