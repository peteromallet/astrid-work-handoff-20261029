"""Bounded, deadline-aware subprocess pipe I/O on every OS.

Only daemon workers block in OS reads/writes. Owners must stop and wait for
the process tree before closing these workers, then close the pipe handles.
Protocol framing and cancellation errors remain with the caller.
"""
from __future__ import annotations

import os
import queue
import threading
import time


def _check(deadline, guard):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("pipe I/O timed out")
    guard()
    return remaining


def close_pipe_workers(*workers, timeout=1.0):
    """Join every worker even when one pipe fails to close."""
    errors = []
    for worker in workers:
        if worker is not None:
            try:
                worker.close(timeout=timeout)
            except Exception as error:  # noqa: BLE001 - join the remaining workers before raising
                errors.append(error)
    if errors:
        raise errors[0]


class PipeReader:
    """One reader, at most sixteen queued chunks, and sticky EOF/errors.

    A shared queue allows several pipes to be drained together. A sink instead
    consumes chunks on the reader thread (for bounded diagnostic tails).
    """

    def __init__(self, stream, *, chunk_size=65536, events=None, name=None, sink=None):
        self._stream = stream
        self._chunk_size = chunk_size
        self._events = events if events is not None else queue.Queue(maxsize=16)
        self._name, self._sink = name, sink
        self._stop = threading.Event()
        self._pending = b""
        self._terminal = None
        self._error = None
        self._thread = threading.Thread(target=self._run, name="astrid-pipe-reader", daemon=True)
        self._thread.start()

    def _run(self):
        try:
            try:
                fd = self._stream if isinstance(self._stream, int) else self._stream.fileno()
            except (AttributeError, OSError):
                fd = None
            while not self._stop.is_set():
                data = os.read(fd, self._chunk_size) if fd is not None else self._stream.read(self._chunk_size)
                if data and self._sink is not None:
                    self._sink(data)
                elif self._sink is None:
                    self._put(data)
                if not data:
                    return
        except Exception as error:  # noqa: BLE001 - deliver worker failures to the owner
            self._error = error
            if self._sink is None:
                self._put(error)

    def _put(self, value):
        while not self._stop.is_set():
            try:
                self._events.put((self._name, value), timeout=0.05)
                return
            except queue.Full:
                pass

    @property
    def error(self):
        """Return the sticky underlying reader or sink error, if any."""
        return self._error

    @property
    def alive(self):
        """Whether the blocking reader worker is still using its pipe."""
        return self._thread.is_alive()

    @staticmethod
    def receive(events, *, deadline, guard=lambda: None, poll_interval=0.05):
        while True:
            remaining = _check(deadline, guard)
            try:
                name, value = events.get(timeout=min(poll_interval, remaining))
            except queue.Empty:
                continue
            if isinstance(value, Exception):
                raise value
            return name, value

    def read(self, count=65536, *, deadline, guard=lambda: None, poll_interval=0.05):
        _check(deadline, guard)
        if self._stop.is_set():
            raise ValueError("pipe reader is closed")
        if self._terminal is not None:
            if isinstance(self._terminal, Exception):
                raise self._terminal
            return b""
        if not self._pending:
            try:
                _, self._pending = self.receive(self._events, deadline=deadline, guard=guard,
                                               poll_interval=poll_interval)
            except Exception as error:
                # A guard failure is cancellation, not a pipe failure.
                if error is self._error:
                    self._terminal = error
                raise
            if not self._pending:
                self._terminal = b""
        data, self._pending = self._pending[:count], self._pending[count:]
        return data

    def close(self, timeout=1.0):
        if self._sink is not None:
            # The stopped child may still have diagnostics buffered in its pipe.
            self._thread.join(timeout=timeout)
        self._stop.set()
        self._thread.join(timeout=0 if self._sink is not None else timeout)
        if self._thread.is_alive():
            raise RuntimeError("pipe reader remains live after close")
        if self._sink is not None and self._error is not None:
            raise self._error


class PipeWriter:
    """Serialize writes without blocking the owner's deadline/cancellation loop."""

    def __init__(self, stream):
        self._stream = stream
        self._jobs = queue.Queue(maxsize=1)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="astrid-pipe-writer", daemon=True)
        self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            try:
                data, deadline, done, cancelled, errors = self._jobs.get(timeout=0.05)
            except queue.Empty:
                continue
            try:
                fd = self._stream if isinstance(self._stream, int) else self._stream.fileno()
                view = memoryview(data)
                while view and not self._stop.is_set() and not cancelled.is_set():
                    if time.monotonic() >= deadline:
                        raise TimeoutError("pipe I/O timed out")
                    try:
                        written = os.write(fd, view[:65536])
                    except BlockingIOError:
                        self._stop.wait(0.01)
                        continue
                    if written <= 0:
                        raise BrokenPipeError("pipe write made no progress")
                    view = view[written:]
            except Exception as error:  # noqa: BLE001 - deliver worker failures to the owner
                errors.append(error)
            finally:
                done.set()

    def write(self, data, *, deadline, guard=lambda: None, poll_interval=0.05):
        done, cancelled, errors = threading.Event(), threading.Event(), []
        job = (data, deadline, done, cancelled, errors)
        try:
            while True:
                remaining = _check(deadline, guard)
                if self._stop.is_set():
                    raise ValueError("pipe writer is closed")
                try:
                    self._jobs.put(job, timeout=min(poll_interval, remaining))
                    break
                except queue.Full:
                    pass
            while not done.is_set():
                remaining = _check(deadline, guard)
                if self._stop.is_set():
                    raise ValueError("pipe writer is closed")
                done.wait(min(poll_interval, remaining))
            _check(deadline, lambda: None)
            if errors:
                raise errors[0]
        finally:
            cancelled.set()

    def close(self, timeout=1.0):
        self._stop.set()
        self._thread.join(timeout=timeout)
        if self._thread.is_alive():
            raise RuntimeError("pipe writer remains live after close")
