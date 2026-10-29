"""Clone a regular file when the filesystem supports it, otherwise copy it safely."""

from __future__ import annotations

import ctypes
import errno
from .dirfd import filesystem as os
from pathlib import Path
import stat

from .dirfd import copy_file_at

_UNSUPPORTED = {errno.ENOSYS, errno.ENOTSUP, errno.EOPNOTSUPP, errno.EXDEV, errno.EINVAL}


def clone_file(source: Path, destination: Path) -> bool:
    """Create destination with APFS clonefileat; return False for unsupported volumes."""
    if not hasattr(ctypes.CDLL(None), "clonefileat"):
        return False
    source_fd = os.open(source.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    destination_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        metadata = os.stat(source.name, dir_fd=source_fd, follow_symlinks=False)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"clone source is not a regular file: {source}")
        libc = ctypes.CDLL(None, use_errno=True)
        clonefileat = libc.clonefileat
        clonefileat.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
        clonefileat.restype = ctypes.c_int
        # CLONE_NOFOLLOW is 1 on Darwin. Source entries were also lstat-checked.
        result = clonefileat(source_fd, os.fsencode(source.name), destination_fd, os.fsencode(destination.name), 1)
        if result == 0:
            return True
        error = ctypes.get_errno()
        if error in _UNSUPPORTED:
            return False
        raise OSError(error, os.strerror(error), str(source))
    finally:
        os.close(destination_fd)
        os.close(source_fd)


def clone_or_copy_file(source: Path, destination: Path, *, allow_copy: bool = True) -> str:
    """Materialize one file, preserving mode and rejecting symlinks."""
    if clone_file(source, destination):
        return "cloned"
    if not allow_copy:
        return "unsupported"
    source_fd = os.open(source.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    destination_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        copy_file_at(source_fd, source.name, destination_fd, destination.name)
    finally:
        os.close(destination_fd)
        os.close(source_fd)
    return "copied"
