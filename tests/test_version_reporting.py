"""Astrid product-version contracts."""

from __future__ import annotations

import importlib
import importlib.metadata
import os
import subprocess
import sys
import tomllib
from importlib.metadata import PackageNotFoundError
from pathlib import Path

import pytest

from astrid import __version__, omp_agent
from astrid import version as version_module
from astrid.core.gateway import main as gateway_main

REPO_ROOT = Path(__file__).parents[1]


def test_version_is_read_from_project_metadata() -> None:
    metadata = Path(__file__).parents[1] / "pyproject.toml"
    with metadata.open("rb") as stream:
        project = tomllib.load(stream)["project"]
    assert __version__ == project["version"]


def test_astrid_version_flag_does_not_launch_omp(capsys, monkeypatch) -> None:
    monkeypatch.setattr(omp_agent, "replace_process", lambda *_args: (_ for _ in ()).throw(AssertionError("OMP launched")))

    assert omp_agent.main(["--version"]) == 0
    assert capsys.readouterr().out == f"astrid/{__version__}\n"


def test_explicit_agent_version_flag_uses_astrid_version(capsys, monkeypatch) -> None:
    monkeypatch.setattr(omp_agent, "replace_process", lambda *_args: (_ for _ in ()).throw(AssertionError("OMP launched")))

    assert omp_agent.main(["agent", "--version"]) == 0
    assert capsys.readouterr().out == f"astrid/{__version__}\n"


def test_gateway_version_flag_uses_the_same_astrid_version(capsys) -> None:
    assert gateway_main(["--version"]) == 0
    assert capsys.readouterr().out == f"astrid/{__version__}\n"


def _project_version() -> str:
    with (REPO_ROOT / "pyproject.toml").open("rb") as stream:
        return tomllib.load(stream)["project"]["version"]


@pytest.fixture
def reload_version_without_distribution(monkeypatch):
    """Reload astrid.version as if no ``astrid`` distribution metadata is installed."""

    original = importlib.metadata.version

    def fake_version(name: str) -> str:
        if name == "astrid":
            raise PackageNotFoundError(name)
        return original(name)

    monkeypatch.setattr(importlib.metadata, "version", fake_version)
    yield lambda: importlib.reload(version_module)
    monkeypatch.undo()
    importlib.reload(version_module)


def test_version_falls_back_to_pyproject_when_distribution_metadata_is_missing(
    reload_version_without_distribution,
) -> None:
    reloaded = reload_version_without_distribution()

    assert reloaded.__version__ == _project_version()
    assert reloaded.ASTRID_VERSION == _project_version()


@pytest.mark.parametrize(
    "pyproject_text",
    [
        "[project]\nname = 'astrid'\n",
        "[project]\nname = 'astrid'\nversion = ''\n",
        "[project]\nname = 'astrid'\nversion = '   '\n",
        "[project]\nname = 'astrid'\nversion = 3\n",
        "[tool.other]\nx = 1\n",
    ],
)
def test_source_version_rejects_missing_or_empty_project_version(
    tmp_path, monkeypatch, pyproject_text
) -> None:
    (tmp_path / "pyproject.toml").write_text(pyproject_text, encoding="utf-8")
    package_dir = tmp_path / "astrid"
    package_dir.mkdir()
    monkeypatch.setattr(version_module, "__file__", str(package_dir / "version.py"))

    with pytest.raises(RuntimeError, match="no valid version"):
        version_module._source_version()


def test_source_version_reads_a_source_checkout_pyproject(tmp_path, monkeypatch) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname = 'astrid'\nversion = ' 9.8.7 '\n", encoding="utf-8")
    package_dir = tmp_path / "astrid"
    package_dir.mkdir()
    monkeypatch.setattr(version_module, "__file__", str(package_dir / "version.py"))

    assert version_module._source_version() == "9.8.7"


def test_cli_help_and_sdk_import_work_without_distribution_metadata(tmp_path) -> None:
    bootstrap = tmp_path / "bootstrap"
    bootstrap.mkdir()
    (bootstrap / "sitecustomize.py").write_text(
        "import importlib.metadata as metadata\n"
        "original_version = metadata.version\n"
        "def version(name):\n"
        "    if name == 'astrid':\n"
        "        raise metadata.PackageNotFoundError(name)\n"
        "    return original_version(name)\n"
        "metadata.version = version\n",
        encoding="utf-8",
    )
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": os.pathsep.join((str(bootstrap), str(REPO_ROOT))),
        "PYTHONNOUSERSITE": "1",
    }

    help_result = subprocess.run(
        [sys.executable, "-m", "astrid", "--help"],
        env=environment, cwd=tmp_path, capture_output=True, text=True, timeout=60, check=False,
    )
    assert help_result.returncode == 0, help_result.stderr

    version_result = subprocess.run(
        [sys.executable, "-c", "import astrid.sdk, astrid; print(astrid.__version__)"],
        env=environment, cwd=tmp_path, capture_output=True, text=True, timeout=60, check=False,
    )
    assert version_result.returncode == 0, version_result.stderr
    assert version_result.stdout.strip() == _project_version()
