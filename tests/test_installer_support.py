"""Support bundles are easy to find and reveal without requiring a desktop."""

import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from astrid.installer import support
from astrid.installer.backend import Backend
from astrid.installer.core import Version


@pytest.mark.parametrize("desktop", [True, False])
def test_default_bundle_uses_visible_desktop_or_downloads(tmp_path, monkeypatch, desktop):
    monkeypatch.setattr(support.Path, "home", lambda: tmp_path)
    if desktop:
        (tmp_path / "Desktop").mkdir()
    folder = "Desktop" if desktop else "Downloads"

    assert support.default_doctor_bundle() == tmp_path / folder / "astrid-doctor.zip"


@pytest.mark.parametrize("system", ["darwin", "win32", "linux"])
def test_bundle_reveal_uses_native_file_browser(tmp_path, monkeypatch, system):
    monkeypatch.setattr(support.sys, "platform", system)
    monkeypatch.setenv("SystemRoot", str(tmp_path / "Windows"))
    launch = Mock()
    monkeypatch.setattr(support.subprocess, "Popen", launch)
    bundle = tmp_path / "My Downloads" / "astrid-doctor.zip"

    support.reveal_bundle(bundle)

    argv = launch.call_args.args[0]
    assert argv == ({
        "darwin": ["open", "-R", str(bundle)],
        "win32": [str(tmp_path / "Windows/explorer.exe"), f"/select,{bundle}"],
        "linux": ["xdg-open", str(bundle.parent)],
    }[system])
    assert launch.call_args.kwargs["stdin"] == subprocess.DEVNULL


def test_missing_file_browser_does_not_fail_doctor(monkeypatch):
    monkeypatch.setattr(support.subprocess, "Popen", Mock(side_effect=FileNotFoundError))

    support.reveal_bundle(Path("/Downloads/astrid-doctor.zip"))


def test_backend_reveals_only_a_newly_written_bundle(tmp_path, monkeypatch):
    backend = Backend(tmp_path / "program", tmp_path / "install.log", tmp_path / "uv")
    version = Version(tmp_path / "v1", tmp_path / "python", tmp_path / "profile", {})
    bundle = tmp_path / "astrid-doctor.zip"
    reveal = Mock()
    monkeypatch.setattr("astrid.installer.backend.reveal_bundle", reveal)

    def run(*_args, **_kwargs):
        bundle.write_bytes(b"fresh diagnostic")
        raise subprocess.CalledProcessError(1, "doctor")

    monkeypatch.setattr(backend, "run", run)
    assert backend.doctor(version, tmp_path / "workspace", bundle) == bundle
    reveal.assert_called_once_with(bundle)
    reveal.reset_mock()
    monkeypatch.setattr(backend, "run", Mock(side_effect=subprocess.CalledProcessError(1, "doctor")))
    with pytest.raises(subprocess.CalledProcessError):
        backend.doctor(version, tmp_path / "workspace", bundle)
    reveal.assert_not_called()
