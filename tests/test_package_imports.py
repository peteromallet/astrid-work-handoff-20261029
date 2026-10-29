"""Importing native helpers does not compose a workspace service."""

import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("module", ["runtime_protocol", "runtime_protocol.platform", "runtime_protocol.dirfd"])
def test_native_import_stays_free_of_storage_authority(module):
    result = subprocess.run(
        [sys.executable, "-c", (
            f"import {module}; import sys; "
            "assert not any(name in sys.modules for name in "
            "('sqlite3', 'runtime_protocol.store', 'runtime_protocol.backup', "
            "'runtime_protocol.service', 'runtime_protocol.daemon'))"
        )],
        cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_public_classes_keep_their_canonical_identity():
    result = subprocess.run(
        [sys.executable, "-c", (
            "import runtime_protocol as package; "
            "assert set(package.__all__) <= set(dir(package)); "
            "from runtime_protocol import *; "
            "from runtime_protocol.service import RuntimeService as Service; "
            "from runtime_protocol.daemon import RuntimeDaemon as Daemon; "
            "assert RuntimeService is Service is package.RuntimeService; "
            "assert RuntimeDaemon is Daemon is package.RuntimeDaemon; "
            "assert RuntimeErrorBase is package.RuntimeErrorBase; "
            "assert all(issubclass(error, RuntimeErrorBase) for error in "
            "(AuthorizationError, ConflictError, NotFoundError))"
        )],
        cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_unknown_package_export_raises_attribute_error():
    import runtime_protocol

    with pytest.raises(AttributeError, match="no attribute 'unknown_export'"):
        runtime_protocol.unknown_export
