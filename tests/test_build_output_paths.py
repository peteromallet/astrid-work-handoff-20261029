from __future__ import annotations

import os
import runpy
import shutil
import subprocess
from pathlib import Path

import pytest
import setuptools
from setuptools import Distribution
from setuptools.command.build_py import build_py
from setuptools.errors import OptionError


@pytest.fixture
def build_command(tmp_path, monkeypatch):
    source = tmp_path / "repository with spaces"
    source.mkdir()
    shutil.copy2(Path(__file__).resolve().parents[1] / "setup.py", source / "setup.py")
    monkeypatch.setattr(setuptools, "setup", lambda **kwargs: None)
    command_type = runpy.run_path(str(source / "setup.py"))["CleanBuildPy"]
    command = command_type(Distribution())
    calls = []
    monkeypatch.setattr(build_py, "run", lambda self: calls.append(self))
    return source, command, calls


def directory_alias(alias, target):
    if os.name == "nt":
        subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(alias), str(target)], check=True)
    else:
        alias.symlink_to(target, target_is_directory=True)


def test_build_output_under_repository_alias_is_cleared(build_command):
    source, command, calls = build_command
    stale = source / "build" / "lib" / "stale.py"
    stale.parent.mkdir(parents=True)
    stale.write_text("stale")
    alias = source.parent / "alias"
    directory_alias(alias, source)
    # Like an 8.3 name, the alias has a different absolute spelling but resolves
    # to the same repository. Windows also accepts differently cased paths.
    output = alias / "build" / "lib"
    command.build_lib = str(output).swapcase() if os.name == "nt" else str(output)

    command.run()

    assert not stale.exists()
    assert calls == [command]


@pytest.mark.parametrize("destination", ["outside", "build-root", "escaping-alias"])
def test_unsafe_build_output_is_preserved(build_command, destination):
    source, command, calls = build_command
    build = source / "build"
    build.mkdir()
    outside = source.parent / "outside"
    outside.mkdir()
    marker = outside / "keep.py"
    marker.write_text("keep")
    root_marker = build / "keep.py"
    root_marker.write_text("keep")
    if destination == "escaping-alias":
        output = build / "escape"
        directory_alias(output, outside)
    else:
        output = outside if destination == "outside" else build
    command.build_lib = str(output)

    with pytest.raises(OptionError):
        command.run()

    assert marker.read_text() == "keep"
    assert root_marker.read_text() == "keep"
    assert calls == []


def test_in_tree_symlink_is_still_refused(build_command):
    source, command, calls = build_command
    target = source / "build" / "lib"
    target.mkdir(parents=True)
    marker = target / "keep.py"
    marker.write_text("keep")
    alias = source / "build" / "alias"
    directory_alias(alias, target)
    command.build_lib = str(alias)

    with pytest.raises(OptionError):
        command.run()

    assert marker.read_text() == "keep"
    assert calls == []
