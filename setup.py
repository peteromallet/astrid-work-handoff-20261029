from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py
from setuptools.errors import OptionError


def _is_link(path):
    try:
        return path.is_symlink() or bool(
            getattr(path.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        )
    except FileNotFoundError:
        return False


class CleanBuildPy(build_py):
    """Never package modules left behind by an older source build."""

    def run(self):
        if getattr(self, "editable_mode", False):
            super().run()
            return

        build_root = Path(__file__).resolve().parent / "build"
        build_lib = Path(os.path.abspath(self.build_lib))
        if _is_link(build_root):
            raise OptionError("refusing to clear output through a symlinked build/ directory")
        canonical_root = build_root.resolve()
        try:
            relative = build_lib.resolve().relative_to(canonical_root)
        except ValueError as exc:
            raise OptionError(
                "Runtime wheel builds may only clear build output under the repository build/ directory"
            ) from exc
        if not relative.parts:
            raise OptionError("refusing to clear the build/ directory itself")
        # Inspect the original spelling too: resolving an in-tree symlink must
        # not turn it into an allowed deletion target. Repository aliases (such
        # as Windows short names) above build/ are harmless.
        cursor = build_lib
        while True:
            if _is_link(cursor):
                raise OptionError("refusing to clear output through a symlinked build path")
            if cursor.resolve() == canonical_root:
                break
            parent = cursor.parent
            if parent == cursor:
                raise OptionError("refusing to clear output without a repository build/ ancestor")
            cursor = parent

        shutil.rmtree(build_lib, ignore_errors=True)
        super().run()


setup(cmdclass={"build_py": CleanBuildPy})
