"""The one HTTP opener for runtime calls that carry a local bearer token."""
from __future__ import annotations

import urllib.request
from typing import Any
from urllib.parse import urlsplit

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def _require_loopback(url: str) -> None:
    host = urlsplit(url).hostname
    if host not in LOOPBACK_HOSTS:
        raise ValueError(f"refusing to send a runtime credential to non-loopback host {host!r}")


class _LoopbackRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _require_loopback(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def urlopen_loopback(request: urllib.request.Request, *, timeout: float) -> Any:
    """Open `request` without any configured HTTP proxy; loopback hosts only."""
    _require_loopback(request.full_url)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _LoopbackRedirects)
    return opener.open(request, timeout=timeout)
