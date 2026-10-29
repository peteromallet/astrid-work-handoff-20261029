"""Network backpressure must not retain the shared SQLite route lock."""
import io
import threading
from types import SimpleNamespace

from runtime_protocol.server import RuntimeHandler


def test_stalled_response_does_not_block_other_database_route():
    entered = threading.Event()
    release = threading.Event()
    completed = threading.Event()
    mutex = threading.RLock()

    class StalledWriter:
        def write(self, data):
            entered.set()
            assert release.wait(2)
            return len(data)

    class Handler(RuntimeHandler):
        def _route(self):
            self._send(200, {"healthy": True})

        def send_response(self, status):
            self.status = status

        def send_header(self, *_):
            pass

        def end_headers(self):
            pass

    def handler(writer):
        h = object.__new__(Handler)
        h.server = SimpleNamespace(runtime=SimpleNamespace(store=SimpleNamespace(_mutex=mutex)))
        h.headers = {}
        h.command = "GET"
        h.wfile = writer
        return h

    blocked = handler(StalledWriter())
    healthy = handler(io.BytesIO())
    first = threading.Thread(target=blocked._dispatch)
    second = threading.Thread(target=lambda: (healthy._dispatch(), completed.set()))
    first.start()
    try:
        assert entered.wait(1)
        second.start()
        assert completed.wait(1), "A stalled response held the shared database lock"
        assert healthy.status == 200
        assert healthy.wfile.getvalue() == b'{"healthy": true}'
    finally:
        release.set()
        first.join(2)
        if second.ident is not None:
            second.join(2)


def test_abandoned_response_does_not_attempt_second_response():
    class Handler(RuntimeHandler):
        def _route(self):
            raise BrokenPipeError("client closed")

        def _error(self, exc):
            raise AssertionError("must not write an error to a broken connection")

    h = object.__new__(Handler)
    h.server = SimpleNamespace(runtime=SimpleNamespace(store=SimpleNamespace(_mutex=threading.RLock())))
    h._dispatch()
    assert h.close_connection


def test_slow_request_body_is_read_before_the_shared_database_lock():
    reading = threading.Event()
    release = threading.Event()
    completed = threading.Event()
    mutex = threading.RLock()

    class SlowBody:
        def read(self, size):
            reading.set()
            assert release.wait(30)
            return b'{"slow": true}'[:size]

    class Handler(RuntimeHandler):
        def _route(self):
            self._send(200, self._body())

        def send_response(self, status):
            self.status = status

        def send_header(self, *_):
            pass

        def end_headers(self):
            pass

    def handler(body, headers):
        h = object.__new__(Handler)
        h.server = SimpleNamespace(runtime=SimpleNamespace(store=SimpleNamespace(_mutex=mutex)))
        h.headers = headers
        h.command = "POST"
        h.path = "/v1/projects"
        h.rfile = body
        h.wfile = io.BytesIO()
        return h

    slow = handler(SlowBody(), {"Content-Length": str(len(b'{"slow": true}'))})
    other = handler(io.BytesIO(b"{}"), {"Content-Length": "2"})
    first = threading.Thread(target=slow._dispatch)
    second = threading.Thread(target=lambda: (other._dispatch(), completed.set()))
    first.start()
    try:
        assert reading.wait(10)
        second.start()
        assert completed.wait(10), "a client still sending its body held the shared database lock"
        assert other.status == 200
    finally:
        release.set()
        first.join(10)
        if second.ident is not None:
            second.join(10)
    assert slow.status == 200
    assert slow.wfile.getvalue() == b'{"slow": true}'
