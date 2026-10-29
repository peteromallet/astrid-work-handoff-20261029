"""Bearer tokens for the local daemon never travel through a configured HTTP proxy."""
from __future__ import annotations

import socket
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from astrid_runtime.loopback_http import urlopen_loopback
from astrid_runtime.runtime_boundary import LocalRuntimeBoundary
from astrid_runtime_client import WorkspaceClient
from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.store import RealmStore


def _closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
def dead_proxy(monkeypatch):
    proxy = f"http://127.0.0.1:{_closed_port()}"
    for name in ("no_proxy", "NO_PROXY"):
        monkeypatch.delenv(name, raising=False)
    for name in ("http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"):
        monkeypatch.setenv(name, proxy)
    return proxy


@pytest.fixture
def daemon(tmp_path):
    realm = tmp_path / "realm"
    RealmStore.initialize(realm).close()
    running = RuntimeDaemon(realm, support_root=tmp_path / "support").start()
    try:
        yield running
    finally:
        running.stop()


def test_the_configured_proxy_is_in_effect_for_a_default_opener(dead_proxy, daemon):
    with pytest.raises(urllib.error.URLError):
        urllib.request.build_opener().open(f"{daemon.endpoint}/v1/health", timeout=5)


def test_loopback_helper_reaches_the_daemon_past_a_dead_proxy(dead_proxy, daemon):
    request = urllib.request.Request(f"{daemon.endpoint}/v1/health", headers={"Accept": "application/json"})
    with urlopen_loopback(request, timeout=5) as response:
        assert response.status == 200


def test_generated_client_reaches_the_daemon_past_a_dead_proxy(dead_proxy, daemon):
    assert WorkspaceClient(daemon.endpoint, daemon.token).health().status == "ok"


def test_runtime_boundary_health_reaches_the_daemon_past_a_dead_proxy(dead_proxy, daemon):
    assert LocalRuntimeBoundary._http_health(daemon.endpoint) is True


@pytest.mark.parametrize("url", ["http://example.com/v1/health", "http://10.0.0.5:8080/v1/health", "http://127.0.0.1.example.com/"])
def test_helper_refuses_non_loopback_hosts(url):
    with pytest.raises(ValueError, match="non-loopback"):
        urlopen_loopback(urllib.request.Request(url, headers={"Authorization": "Bearer secret"}), timeout=1)


def test_generated_client_refuses_a_non_loopback_base_url():
    with pytest.raises(ValueError, match="non-loopback"):
        WorkspaceClient("http://example.com:8080", "secret").health()


@pytest.fixture
def redirecting_server():
    """A loopback server whose every GET answers 302 to the Location in ``server.location``."""
    requests: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            requests.append(self.path)
            self.send_response(302)
            self.send_header("Location", httpd.location)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    httpd.location = ""
    httpd.requests = requests
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=30)


@pytest.mark.parametrize("target", ["http://example.com/v1/health", "http://10.0.0.5:8080/", "http://127.0.0.1.example.com/"])
def test_helper_refuses_a_loopback_redirect_to_a_non_loopback_host(redirecting_server, target):
    redirecting_server.location = target
    request = urllib.request.Request(
        f"http://127.0.0.1:{redirecting_server.server_address[1]}/v1/health",
        headers={"Authorization": "Bearer secret"},
    )
    with pytest.raises(ValueError, match="non-loopback"):
        urlopen_loopback(request, timeout=5)
    assert redirecting_server.requests == ["/v1/health"]


def test_helper_follows_a_redirect_that_stays_on_loopback(redirecting_server):
    redirecting_server.location = f"http://127.0.0.1:{redirecting_server.server_address[1]}/again"
    request = urllib.request.Request(f"http://127.0.0.1:{redirecting_server.server_address[1]}/start")
    with pytest.raises(urllib.error.HTTPError):  # the fixture keeps redirecting: urllib stops at its loop limit
        urlopen_loopback(request, timeout=5)
    assert redirecting_server.requests[:2] == ["/start", "/again"]
