from __future__ import annotations

import inspect
import json
import os
import socket
from pathlib import Path

import pytest
import yaml

os.environ.setdefault("ASTRID_INTERNAL_INVOCATION", "1")

from astrid.core.contracts.errors import AstridError
from astrid.packs.capture.actions.web_page import run as capture_run


PACK_ROOT = Path(__file__).resolve().parents[3] / "astrid" / "packs" / "capture"


REMOTION = Path(__file__).resolve().parents[3] / "remotion"


def _admit_origin(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, origin: str) -> None:
    """Provide the exact host-issued broker contract for one HTTPS origin."""
    monkeypatch.setenv("ASTRID_BROKER_PROXY", "http://127.0.0.1:43123")
    monkeypatch.setenv(
        "ASTRID_NETWORK_POLICY",
        json.dumps(
            {
                "allowed_protocols": ["dns", "tcp"],
                "dynamic_url_inputs": ["url"],
                "allow_redirects": False,
                "broker": {"kind": "broker", "host_managed": True, "enforced": True, "observable": True},
            }
        ),
    )
    monkeypatch.setenv("ASTRID_NETWORK_ADMISSION", json.dumps({"allowed_routes": [origin]}))
    monkeypatch.setenv("ASTRID_NETWORK_BROKER_EVIDENCE", str((tmp_path / "broker-evidence.json").resolve()))


def test_https_validation_rejects_credentials_and_non_https() -> None:
    assert capture_run.validate_url("https://example.test/path") == "https://example.test/path"
    for value in ("http://example.test", "ftp://example.test", "file:///tmp/page", "https://user:pass@example.test", "https:///missing-host"):
        with pytest.raises(AstridError):
            capture_run.validate_url(value)


def test_input_parsers() -> None:
    assert capture_run.parse_viewport("1280x720") == (1280, 720)
    assert capture_run.parse_clip('{"x": 2, "y": 3, "w": 40, "h": 50}') == {
        "x": 2, "y": 3, "w": 40, "h": 50
    }
    with pytest.raises(AstridError):
        capture_run.parse_viewport("8x8")
    with pytest.raises(AstridError):
        capture_run.parse_clip('{"x": 0, "y": 0, "w": 0, "h": 10}')


def test_v3_manifest_declares_action_resources_and_broker_policy() -> None:
    manifest = yaml.safe_load((PACK_ROOT / "pack.yaml").read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 3
    action = manifest["actions"]["web_page"]
    paths = {item["path"] for item in action["resources"]}
    assert {
        "actions/web_page/__init__.py",
        "actions/web_page/run.py",
        "actions/web_page/STAGE.md",
    } <= paths
    policy = action["metadata"]["network_policy"]
    assert policy["dynamic_url_inputs"] == ["url"]
    assert policy["allow_redirects"] is False
    assert policy["broker"]["host_managed"] is True
    assert policy["broker"]["enforced"] is True
    assert policy["broker"]["observable"] is True
    assert manifest["documentation"]["path"] == "docs/SKILL.md"


def test_browser_resolution_uses_explicit_remotion_project_or_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    project = tmp_path / "remotion"
    browser = project / "node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    browser.parent.mkdir(parents=True)
    browser.write_bytes(b"fixture executable")
    browser.chmod(0o755)
    monkeypatch.setenv("ASTRID_REMOTION_PROJECT_DIR", str(project))
    monkeypatch.delenv("ASTRID_CAPTURE_CHROME", raising=False)
    monkeypatch.setattr(capture_run, "resolve_remotion_project_dir", lambda: project)
    assert capture_run.find_chrome() == str(browser.resolve())

    explicit = tmp_path / "explicit-chrome"
    explicit.write_bytes(b"fixture executable")
    explicit.chmod(0o755)
    monkeypatch.setenv("ASTRID_CAPTURE_CHROME", str(explicit))
    assert capture_run.find_chrome() == str(explicit.resolve())


def test_host_admission_is_required_and_route_bound(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for name in (
        "ASTRID_BROKER_PROXY",
        "ASTRID_NETWORK_POLICY",
        "ASTRID_NETWORK_ADMISSION",
        "ASTRID_NETWORK_BROKER_EVIDENCE",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(AstridError):
        capture_run._require_host_admission("https://example.test/page")

    monkeypatch.setenv("ASTRID_BROKER_PROXY", "http://127.0.0.1:43123")
    monkeypatch.setenv(
        "ASTRID_NETWORK_POLICY",
        json.dumps(
            {
                "allowed_protocols": ["dns", "tcp"],
                "dynamic_url_inputs": ["url"],
                "allow_redirects": False,
                "broker": {"kind": "broker", "host_managed": True, "enforced": True, "observable": True},
            }
        ),
    )
    monkeypatch.setenv(
        "ASTRID_NETWORK_ADMISSION",
        json.dumps({"allowed_routes": ["https://example.test:443"]}),
    )
    monkeypatch.setenv("ASTRID_NETWORK_BROKER_EVIDENCE", str((tmp_path / "broker-evidence.json").resolve()))
    admission = capture_run._require_host_admission("https://example.test/page")
    assert capture_run._network_receipt("https://example.test/page", admission)["allow_redirects"] is False


def test_browser_launch_and_teardown_use_admitted_custody_primitives() -> None:
    source = inspect.getsource(capture_run)
    assert "popen_owned_group" in source
    assert "terminate_group" in source
    assert "verify_tree_absent" in source
    assert "subprocess.Popen(" not in source
    assert ".kill(" not in source
    assert "REPO_ROOT" not in inspect.getsource(capture_run.find_chrome)


def test_chrome_args_route_through_admitted_broker_proxy(tmp_path: Path) -> None:
    with_proxy = capture_run._chrome_args("/bin/chrome", tmp_path, "http://127.0.0.1:9999")
    assert "--remote-debugging-pipe" in with_proxy
    assert "--proxy-server=http://127.0.0.1:9999" in with_proxy


def test_cli_refuses_plain_http_before_launching_a_browser(tmp_path: Path) -> None:
    code = capture_run.main(["--url", "http://example.org/", "--out", str(tmp_path / "out")])
    assert code != 0
    assert not (tmp_path / "out" / "screenshot.png").exists()


@pytest.mark.chrome
def test_refused_connection_fails_with_browser_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ASTRID_REMOTION_PROJECT_DIR", str(REMOTION))
    monkeypatch.delenv("ASTRID_CAPTURE_CHROME", raising=False)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        closed_port = sock.getsockname()[1]
    origin = f"https://127.0.0.1:{closed_port}"
    _admit_origin(monkeypatch, tmp_path, origin)
    with pytest.raises(AstridError, match="navigation to"):
        capture_run.capture(url=f"{origin}/", out_dir=tmp_path / "dead", wait_ms=0)
