"""Cooperative cancellation scoped to foreground startup and its I/O waits.

Normal daemon operation and background launches have no cancellation scope.
Cleanup runs after leaving the scope so a stop request cannot cancel cleanup.
"""
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
import threading
import time
import urllib.error

_event = ContextVar("runtime_startup_stop", default=None)


class StartupCancelled(RuntimeError):
    pass


def active():
    return _event.get() is not None


def requested():
    event = _event.get()
    return event is not None and event.is_set()


def check():
    if requested():
        raise StartupCancelled("Runtime startup cancelled by a stop request")


def pause(seconds):
    event = _event.get()
    if event is None:
        time.sleep(seconds)
    else:
        event.wait(seconds)
        check()


def wait_for(operation, *args, **kwargs):
    """Wait for bounded startup I/O while also observing the stop token.

    Leave background launches on the calling thread. Foreground requests keep
    their normal timeouts in a daemon thread so cancellation can unwind startup
    and run cleanup immediately. An in-flight request may finish later; callers
    must wrap individual I/O calls, not sequences that could resume startup.
    """
    if not active():
        return operation(*args, **kwargs)
    check()
    context = copy_context()
    finished = threading.Event()
    outcome = []

    def invoke():
        try:
            check()
            outcome.append((True, operation(*args, **kwargs)))
        except BaseException as exc:
            outcome.append((False, exc))
        finally:
            finished.set()

    threading.Thread(target=context.run, args=(invoke,), name="runtime-startup-io", daemon=True).start()
    while not finished.wait(0.05):
        check()
    check()
    succeeded, value = outcome[0]
    if succeeded:
        return value
    raise value


def retry_timeouts(read, timeout):
    """Retry an idempotent readiness read within its original total budget."""
    if not active():
        return read(timeout)
    deadline = time.monotonic() + timeout
    while True:
        check()
        try:
            result = wait_for(read, max(0.001, deadline - time.monotonic()))
        except (TimeoutError, urllib.error.URLError) as exc:
            check()
            if isinstance(exc, urllib.error.URLError) and not isinstance(exc.reason, TimeoutError):
                raise
            if time.monotonic() >= deadline:
                raise
        else:
            check()
            return result


@contextmanager
def startup_scope(event):
    token = _event.set(event)
    try:
        check()
        yield
    finally:
        _event.reset(token)


@contextmanager
def cleanup_scope():
    token = _event.set(None)
    try:
        yield
    finally:
        _event.reset(token)
