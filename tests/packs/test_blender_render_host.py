"""Refusals of the Blender render host: bind, token, mesh_url scheme, zip paths, deploy args.

Nothing here starts Blender or touches the network except a loopback socket.
The one HTTP server started binds ``127.0.0.1`` on an ephemeral port; request
timeouts are hang ceilings, not assertions about speed.
"""

from __future__ import annotations

import importlib
import importlib.util
import io
import json
import threading
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

from astrid.core.contracts.errors import AstridError
from astrid.packs.blender import deploy, render_core

PACK_DIR = Path(deploy.__file__).resolve().parent
SERVER_PATH = PACK_DIR / "server" / "blender_render_server.py"
HANG_CEILING_S = 30


def _load_server(monkeypatch: pytest.MonkeyPatch, **env: str | None) -> Any:
    """Import a fresh copy of the server module with the given environment."""
    monkeypatch.syspath_prepend(str(PACK_DIR))
    for key in ("BLENDER_RENDER_HOST", "BLENDER_RENDER_TOKEN"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        if value is not None:
            monkeypatch.setenv(key, value)
    spec = importlib.util.spec_from_file_location("blender_render_server_under_test", SERVER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _zip_bytes(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in members.items():
            zf.writestr(zipfile.ZipInfo(name), data)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Server: bind address and token
# ---------------------------------------------------------------------------


def test_server_binds_loopback_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    server = _load_server(monkeypatch)
    assert server.HOST == "127.0.0.1"
    assert server.AUTH_TOKEN == ""
    server.require_safe_bind(server.HOST, server.AUTH_TOKEN)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.20", "10.0.0.5", "render.example.com", ""])
def test_server_refuses_non_loopback_bind_without_token(monkeypatch: pytest.MonkeyPatch, host: str) -> None:
    server = _load_server(monkeypatch)
    with pytest.raises(SystemExit, match="BLENDER_RENDER_TOKEN"):
        server.require_safe_bind(host, "")


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "::1", "localhost"])
def test_server_allows_loopback_bind_without_token(monkeypatch: pytest.MonkeyPatch, host: str) -> None:
    server = _load_server(monkeypatch)
    server.require_safe_bind(host, "")


def test_server_allows_non_loopback_bind_with_token(monkeypatch: pytest.MonkeyPatch) -> None:
    server = _load_server(monkeypatch)
    server.require_safe_bind("0.0.0.0", "t" * 32)


def test_server_main_refuses_to_start_on_open_bind_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    server = _load_server(monkeypatch, BLENDER_RENDER_HOST="0.0.0.0")
    started: list[Any] = []
    monkeypatch.setattr(server, "ThreadingHTTPServer", lambda *a, **k: started.append(a))
    with pytest.raises(SystemExit, match="refusing to bind"):
        server.main()
    assert started == []


# ---------------------------------------------------------------------------
# Server: mesh_url scheme and zip member paths
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/mesh.glb",
        "file:///etc/passwd",
        "ftp://example.com/mesh.zip",
        "//example.com/mesh.glb",
        "mesh.glb",
        "https:///mesh.glb",
    ],
)
def test_server_refuses_non_https_mesh_url(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, url: str) -> None:
    server = _load_server(monkeypatch)
    downloads: list[str] = []
    monkeypatch.setattr(urllib.request.OpenerDirector, "open", lambda self, *a, **k: downloads.append(a[0]))
    with pytest.raises(server.RequestRefused, match="https"):
        server._resolve_mesh_in_workdir(url, str(tmp_path))
    assert downloads == []


def test_server_do_render_refuses_http_mesh_url_before_running_blender(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    server = _load_server(monkeypatch)
    ran: list[Any] = []
    monkeypatch.setattr(server, "_run_blender", lambda *a, **k: ran.append(a))
    payload = {"script": "print('x')", "mesh_url": "http://example.com/mesh.glb"}
    with pytest.raises(server.RequestRefused):
        server.do_render(payload, str(tmp_path))
    assert ran == []


@pytest.mark.parametrize("member", ["../escape.glb", "a/../../escape.glb", "/tmp/escape.glb"])
def test_server_refuses_zip_member_outside_workdir(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, member: str
) -> None:
    server = _load_server(monkeypatch)
    work = tmp_path / "work"
    work.mkdir()
    archive = _zip_bytes({"model.glb": b"ok", member: b"evil"})

    def fake_download(url: str, dest_path: str, timeout: int = 300) -> None:
        Path(dest_path).write_bytes(archive)

    monkeypatch.setattr(server, "_download", fake_download)
    with pytest.raises(server.RequestRefused, match="unsafe zip member"):
        server._resolve_mesh_in_workdir("https://example.com/mesh.zip", str(work))
    assert not (tmp_path / "escape.glb").exists()
    assert not Path("/tmp/escape.glb").exists()
    # Nothing at all is extracted when any member is unsafe.
    assert not (work / "model.glb").exists()


def test_server_extracts_a_clean_zip(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server = _load_server(monkeypatch)
    archive = _zip_bytes({"scene/model.glb": b"glb-bytes", "scene/tex/a.png": b"png"})
    monkeypatch.setattr(server, "_download", lambda url, dest, timeout=300: Path(dest).write_bytes(archive))
    model = server._resolve_mesh_in_workdir("https://example.com/mesh.zip", str(tmp_path))
    assert model == str(tmp_path / "scene" / "model.glb")
    assert Path(model).read_bytes() == b"glb-bytes"


def test_https_only_opener_refuses_https_to_http_redirect() -> None:
    redirect_handler = next(
        h for h in render_core.https_only_opener().handlers if hasattr(h, "redirect_request") and type(h).__name__ == "HttpsOnlyRedirects"
    )
    req = urllib.request.Request("https://example.com/mesh.glb")
    with pytest.raises(urllib.error.URLError, match="non-https redirect"):
        redirect_handler.redirect_request(req, io.BytesIO(), 302, "Found", {}, "http://internal.example/mesh.glb")
    with pytest.raises(urllib.error.URLError, match="non-https redirect"):
        redirect_handler.redirect_request(req, io.BytesIO(), 302, "Found", {}, "file:///etc/passwd")


def _capture_opener_handlers(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """Make any OpenerDirector.open fail after recording the handlers of the opener used."""
    seen: list[Any] = []

    def fake_open(self: urllib.request.OpenerDirector, *args: Any, **kwargs: Any) -> Any:
        seen.append(list(self.handlers))
        raise urllib.error.URLError("stop after recording the opener")

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", fake_open)
    return seen


def _has_https_only_redirects(handlers: list[Any]) -> bool:
    return any(type(h).__name__ == "HttpsOnlyRedirects" for h in handlers)


def test_server_download_uses_the_https_only_redirect_handler(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server = _load_server(monkeypatch)
    seen = _capture_opener_handlers(monkeypatch)
    with pytest.raises(urllib.error.URLError):
        server._download("https://example.com/mesh.glb", str(tmp_path / "m.glb"))
    assert len(seen) == 1 and _has_https_only_redirects(seen[0])


def test_local_executor_download_uses_the_https_only_redirect_handler(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    run = importlib.import_module("astrid.packs.blender.actions.render.run")
    seen = _capture_opener_handlers(monkeypatch)
    for url in ("https://example.com/mesh.glb", "https://example.com/mesh.zip", "https://example.com/mesh"):
        with pytest.raises(urllib.error.URLError):
            run._download_mesh_to_dir(url, tmp_path)
    assert len(seen) == 3 and all(_has_https_only_redirects(handlers) for handlers in seen)


def test_sketchfab_download_uses_the_https_only_redirect_handler(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from astrid.packs.blender import mesh_fetch

    monkeypatch.setattr(mesh_fetch, "resolve_sketchfab_mesh_url", lambda uid, token=None: "https://example.com/m.zip")
    seen = _capture_opener_handlers(monkeypatch)
    with pytest.raises(urllib.error.URLError):
        mesh_fetch.download_sketchfab("uid", str(tmp_path), token="t")
    assert len(seen) == 1 and _has_https_only_redirects(seen[0])


def test_sketchfab_download_refuses_http_url(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from astrid.packs.blender import mesh_fetch

    monkeypatch.setattr(mesh_fetch, "resolve_sketchfab_mesh_url", lambda uid, token=None: "http://example.com/m.zip")
    seen = _capture_opener_handlers(monkeypatch)
    with pytest.raises(ValueError, match="https"):
        mesh_fetch.download_sketchfab("uid", str(tmp_path), token="t")
    assert seen == []


# ---------------------------------------------------------------------------
# Server over real HTTP on loopback: token required, bad mesh_url is a 400
# ---------------------------------------------------------------------------


def _post(
    base: str,
    payload: dict[str, Any],
    token: str | None,
    extra_headers: dict[str, str] | None = None,
    content_type: str | None = "application/json",
) -> tuple[int, str]:
    headers: dict[str, str] = {}
    if content_type is not None:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.update(extra_headers or {})
    req = urllib.request.Request(base + "/render", data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=HANG_CEILING_S) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def test_server_http_requires_token_and_rejects_http_mesh_url(monkeypatch: pytest.MonkeyPatch) -> None:
    token = "x" * 32
    server = _load_server(monkeypatch, BLENDER_RENDER_TOKEN=token)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{httpd.server_address[1]}"
        bad_mesh = {"script": "print('x')", "mesh_url": "http://example.com/mesh.glb"}
        assert _post(base, bad_mesh, None)[0] == 401
        assert _post(base, bad_mesh, "y" * 32)[0] == 401
        status, body = _post(base, bad_mesh, token)
        assert status == 400
        assert "https" in body
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=HANG_CEILING_S)


def _serve(server: Any) -> tuple[ThreadingHTTPServer, threading.Thread, str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, thread, f"http://127.0.0.1:{httpd.server_address[1]}"


def test_server_http_refuses_requests_carrying_an_origin_header(monkeypatch: pytest.MonkeyPatch) -> None:
    """A web page cannot drive the loopback render API: browsers add Origin to cross-site POSTs."""
    server = _load_server(monkeypatch)
    ran: list[Any] = []
    monkeypatch.setattr(server, "do_render", lambda *a, **k: ran.append(a))
    httpd, thread, base = _serve(server)
    try:
        payload = {"script": "print('x')"}
        for origin in ("https://evil.example", "null", "http://127.0.0.1:1"):
            status, _body = _post(base, payload, None, extra_headers={"Origin": origin})
            assert status == 403
        assert ran == []
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=HANG_CEILING_S)


@pytest.mark.parametrize("content_type", ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", None])
def test_server_http_requires_json_content_type(monkeypatch: pytest.MonkeyPatch, content_type: str | None) -> None:
    server = _load_server(monkeypatch)
    ran: list[Any] = []
    monkeypatch.setattr(server, "do_render", lambda *a, **k: ran.append(a))
    httpd, thread, base = _serve(server)
    try:
        status, body = _post(base, {"script": "print('x')"}, None, content_type=content_type)
        assert status == 415
        assert "application/json" in body
        assert ran == []
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=HANG_CEILING_S)


def test_server_http_accepts_json_content_type_with_charset(monkeypatch: pytest.MonkeyPatch) -> None:
    server = _load_server(monkeypatch)
    httpd, thread, base = _serve(server)
    try:
        status, body = _post(
            base,
            {"script": "print('x')", "mesh_url": "http://example.com/mesh.glb"},
            None,
            content_type="application/json; charset=utf-8",
        )
        assert status == 400 and "https" in body
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=HANG_CEILING_S)


# ---------------------------------------------------------------------------
# render_core helpers shared with the local executor
# ---------------------------------------------------------------------------


def test_render_core_safe_extract_zip_refuses_traversal(tmp_path: Path) -> None:
    dest = tmp_path / "dest"
    dest.mkdir()
    with zipfile.ZipFile(io.BytesIO(_zip_bytes({"ok.glb": b"1", "../x.glb": b"2"}))) as zf:
        with pytest.raises(ValueError, match="unsafe zip member"):
            render_core.safe_extract_zip(zf, str(dest))
    assert list(dest.iterdir()) == []
    assert not (tmp_path / "x.glb").exists()


@pytest.mark.parametrize("url", ["http://a.example/m.glb", "file:///x.glb", "", None, 3])
def test_render_core_require_https_mesh_url_refuses(url: Any) -> None:
    with pytest.raises(ValueError):
        render_core.require_https_mesh_url(url)


def test_local_executor_refuses_http_mesh_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    run = importlib.import_module("astrid.packs.blender.actions.render.run")
    args = run.build_parser().parse_args(
        ["--out", "out", "--execution", "local", "--mesh-url", "http://example.com/m.glb"]
    )
    with pytest.raises(AstridError, match="https"):
        run._resolve_mesh_url(args)


# ---------------------------------------------------------------------------
# Deploy: token, bind host, no default host or user
# ---------------------------------------------------------------------------


class FakeHost(deploy.RemoteHost):
    """Records commands and written files; every command succeeds and reports healthy."""

    def __init__(self, *, systemd: bool = True) -> None:
        self.host = "render.example.test"
        self.systemd = systemd
        self.commands: list[str] = []
        self.files: dict[str, str] = {}

    def run(self, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
        self.commands.append(cmd)
        if not self.systemd and cmd.startswith("systemctl"):
            return 1, "", "no systemd"
        return 0, '{"status": "ok"}', ""

    def put_text(self, remote_path: str, content: str) -> None:
        self.files[remote_path] = content


UNIT_PATH = f"/etc/systemd/system/{deploy.SERVICE_FILE}"


def test_deploy_generates_token_and_writes_it_and_bind_host_into_unit() -> None:
    host = FakeHost()
    result = deploy.deploy_to_host(host, port=8999)
    assert result.token_generated is True
    assert len(result.token) >= 32
    unit = host.files[UNIT_PATH]
    assert f"Environment=BLENDER_RENDER_TOKEN={result.token}\n" in unit
    assert "Environment=BLENDER_RENDER_HOST=0.0.0.0\n" in unit
    assert "Environment=BLENDER_RENDER_PORT=8999\n" in unit
    assert "# Environment=BLENDER_RENDER_TOKEN" not in unit
    assert f"chmod 600 {UNIT_PATH}" in host.commands
    assert result.url == "http://render.example.test:8999"


class _RecordingRunHost(deploy.RemoteHost):
    """Uses the real ``RemoteHost.put_text``; records the shell command it sends."""

    def __init__(self, rc: int = 0) -> None:
        self.rc = rc
        self.commands: list[str] = []

    def run(self, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
        self.commands.append(cmd)
        return self.rc, "", "disk full" if self.rc else ""


def test_put_text_writes_under_a_private_umask() -> None:
    host = _RecordingRunHost()
    host.put_text("/etc/systemd/system/x.service", "secret")
    (cmd,) = host.commands
    assert cmd.startswith("umask 077; ")
    assert "umask 022" not in cmd


def test_put_text_failure_is_an_error() -> None:
    with pytest.raises(RuntimeError, match="failed to write"):
        _RecordingRunHost(rc=1).put_text("/x", "secret")


class _ChmodFailingHost(FakeHost):
    def run(self, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
        if cmd.startswith("chmod"):
            self.commands.append(cmd)
            return 1, "", "operation not permitted"
        return super().run(cmd, timeout)


def test_deploy_aborts_when_chmod_of_the_token_unit_fails() -> None:
    host = _ChmodFailingHost()
    with pytest.raises(RuntimeError, match="chmod 600"):
        deploy.deploy_to_host(host, port=8999)
    assert not any(c.startswith("systemctl") for c in host.commands)


def test_deploy_aborts_when_chmod_of_the_start_script_fails() -> None:
    host = _ChmodFailingHost(systemd=False)
    host.run = lambda cmd, timeout=600, _orig=host.run: (  # type: ignore[method-assign]
        (0, "", "") if cmd.startswith("chmod 600") else _orig(cmd, timeout)
    )
    with pytest.raises(RuntimeError, match="chmod 700"):
        deploy.deploy_to_host(host, port=8999)
    assert not any(c.startswith("bash ") for c in host.commands)


def test_deploy_generates_a_different_token_each_time() -> None:
    first = deploy.deploy_to_host(FakeHost(), port=8999)
    second = deploy.deploy_to_host(FakeHost(), port=8999)
    assert first.token != second.token


def test_deploy_uses_supplied_token() -> None:
    host = FakeHost()
    supplied = "operator-chosen-token-123"
    result = deploy.deploy_to_host(host, port=8999, token=supplied)
    assert result.token == supplied
    assert result.token_generated is False
    assert f"Environment=BLENDER_RENDER_TOKEN={supplied}\n" in host.files[UNIT_PATH]


@pytest.mark.parametrize("token", ["short", "has space in it 123456", "newline-injection-12345\nExecStart=/bin/sh", "quote'quote'quote'quote"])
def test_deploy_refuses_unsafe_or_short_token_before_touching_the_host(token: str) -> None:
    host = FakeHost()
    with pytest.raises(SystemExit, match="render token"):
        deploy.deploy_to_host(host, port=8999, token=token)
    assert host.commands == []
    assert host.files == {}


def test_deploy_fallback_start_script_sets_bind_host_and_token() -> None:
    host = FakeHost(systemd=False)
    result = deploy.deploy_to_host(host, port=8999)
    script = host.files[f"{deploy.REMOTE_DIR}/start.sh"]
    assert "export BLENDER_RENDER_HOST=0.0.0.0\n" in script
    assert f"export BLENDER_RENDER_TOKEN={result.token}\n" in script
    assert f"chmod 700 {deploy.REMOTE_DIR}/start.sh" in host.commands


def test_deploy_health_wait_sends_the_token() -> None:
    host = FakeHost()
    result = deploy.deploy_to_host(host, port=8999)
    curls = [c for c in host.commands if c.startswith("curl")]
    assert curls and all(f"Authorization: Bearer {result.token}" in c for c in curls)


def test_deploy_ssh_requires_host_and_user() -> None:
    parser = deploy.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["ssh", "--user", "deploy"])
    with pytest.raises(SystemExit):
        parser.parse_args(["ssh", "--host", "render.example.test"])
    args = parser.parse_args(["ssh", "--host", "render.example.test", "--user", "deploy"])
    assert (args.host, args.user) == ("render.example.test", "deploy")


def test_deploy_has_no_hetzner_subcommand_and_no_default_host() -> None:
    parser = deploy.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["hetzner"])
    with pytest.raises(SystemExit):
        parser.parse_args(["hetzner", "--host", "render.example.test"])
    assert not hasattr(deploy, "DEFAULT_HETZNER_HOST")
    assert not hasattr(deploy, "DEFAULT_HETZNER_USER")


def test_ssh_host_has_no_default_user() -> None:
    with pytest.raises(TypeError):
        deploy.SshHost("render.example.test")  # type: ignore[call-arg]


def test_generated_token_is_saved_private_and_not_printed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    deployed = deploy.DeployResult("http://render.example.test:8778", "g" * 43, True)
    deploy._report_token("render.example.test", deployed)
    saved = tmp_path / ".astrid" / "blender-render-token-render.example.test"
    assert saved.read_text(encoding="utf-8").strip() == "g" * 43
    assert (saved.stat().st_mode & 0o777) == 0o600
    out = capsys.readouterr().out
    assert "g" * 43 not in out
    assert str(saved) in out


def test_supplied_token_is_not_saved(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    deploy._report_token("render.example.test", deploy.DeployResult("http://h:1", "s" * 20, False))
    assert not (tmp_path / ".astrid").exists()


def test_service_template_defaults_to_loopback() -> None:
    unit = (PACK_DIR / "server" / deploy.SERVICE_FILE).read_text(encoding="utf-8")
    assert "Environment=BLENDER_RENDER_HOST=127.0.0.1\n" in unit
    assert "0.0.0.0" not in unit
