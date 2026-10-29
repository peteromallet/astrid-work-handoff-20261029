from __future__ import annotations

import os
from pathlib import Path

import pytest

from runtime_protocol import dirfd
from tests.lanes import requires_linux_o_path

pytestmark = requires_linux_o_path


def test_chain_does_not_need_read_access_to_ancestors(tmp_path: Path):
    """Landlock (OpenShell, Flatpak) and 0711 homes grant search but not read on parents."""
    parent = tmp_path / "search-only"
    leaf = parent / "leaf"
    leaf.mkdir(parents=True)
    (leaf / "marker").write_text("ok", encoding="utf-8")
    parent.chmod(0o311)
    try:
        fd = dirfd.open_directory_chain(leaf)
        try:
            assert os.path.samestat(os.fstat(fd), os.stat(leaf))
            assert os.listdir(fd) == ["marker"]
        finally:
            os.close(fd)
    finally:
        parent.chmod(0o755)


def test_chain_still_rejects_a_symlinked_ancestor(tmp_path: Path):
    (tmp_path / "real" / "leaf").mkdir(parents=True)
    (tmp_path / "alias").symlink_to(tmp_path / "real", target_is_directory=True)
    with pytest.raises(OSError):
        dirfd.open_directory_chain(tmp_path / "alias" / "leaf")


def test_chain_still_rejects_a_symlinked_leaf(tmp_path: Path):
    (tmp_path / "real").mkdir()
    (tmp_path / "alias").symlink_to(tmp_path / "real", target_is_directory=True)
    with pytest.raises(OSError):
        dirfd.open_directory_chain(tmp_path / "alias")
