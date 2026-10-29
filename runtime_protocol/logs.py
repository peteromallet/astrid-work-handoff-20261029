"""Rotating UTF-8 logs shared by the Runtime and its profile services."""

from __future__ import annotations

import io
import sys
import threading
from pathlib import Path

from . import platform


def _replace(source, destination):
    def operation():
        return source.replace(destination)
    if sys.platform == "win32":
        return platform._retry_windows_sharing_violation(operation)
    return operation()


class RotatingLog(io.TextIOBase):
    def __init__(self, path, *, max_bytes=5 * 1024 * 1024, backups=3):
        super().__init__()
        self.path = Path(path)
        self.max_bytes = max_bytes
        self.backups = backups
        self._lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        platform.owner_only(self.path.parent)
        self._file = None
        self._open()

    @property
    def encoding(self):
        return "utf-8"

    def _open(self):
        self._file = self.path.open("ab", buffering=0)
        try:
            platform.owner_only(self.path)
        except BaseException:
            self._file.close()
            raise
        self._size = self._file.tell()

    def write(self, value):
        encoded = value.encode("utf-8", "replace")
        with self._lock:
            if self.closed:
                raise ValueError("write to closed log")
            if self._size and self._size + len(encoded) > self.max_bytes:
                self._file.close()
                try:
                    for index in range(self.backups, 0, -1):
                        source = self.path if index == 1 else self.path.with_name(self.path.name + f".{index - 1}")
                        if source.exists():
                            _replace(source, self.path.with_name(self.path.name + f".{index}"))
                finally:
                    self._open()
            self._file.write(encoded)
            self._size += len(encoded)
        return len(value)

    def flush(self):
        with self._lock:
            if self._file is not None and not self._file.closed:
                self._file.flush()

    def close(self):
        with self._lock:
            try:
                super().close()
            finally:
                if self._file is not None:
                    self._file.close()
