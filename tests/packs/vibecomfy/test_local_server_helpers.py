from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.execution import generic_host
from astrid.core.generation.backends.vibecomfy_local_server import (
    cleanup_prompts,
    upload_image,
    validate_comfy_url,
    validate_identity,
    validate_output_directory,
)


class _ComfyFixture:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        self.running_prompt = "ours"
        self.upload_result: dict[str, object] = {
            "name": "portrait.png",
            "subfolder": "astrid/task-1",
            "type": "input",
        }

        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args) -> None:
                pass

            def _json(self, value: object) -> None:
                raw = json.dumps(value).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self) -> None:
                fixture.calls.append((self.path, None))
                if self.path == "/queue":
                    queue = [] if fixture.running_prompt is None else [[0, fixture.running_prompt]]
                    self._json({"queue_running": queue, "queue_pending": []})
                else:
                    self._json({})

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                if self.path == "/upload/image":
                    fixture.calls.append((self.path, (self.headers.get("Content-Type", ""), body)))
                    self._json(fixture.upload_result)
                    return
                payload = json.loads(body) if body else None
                fixture.calls.append((self.path, payload))
                self._json({})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


@pytest.fixture
def comfy() -> _ComfyFixture:
    fixture = _ComfyFixture()
    try:
        yield fixture
    finally:
        fixture.close()


def test_comfy_url_is_canonicalized() -> None:
    assert validate_comfy_url("http://localhost:8188") == "http://127.0.0.1:8188"
    assert validate_comfy_url("http://127.0.0.1:42001/") == "http://127.0.0.1:42001"


@pytest.mark.parametrize(
    "value",
    [
        "http://192.168.1.20:8188",
        "http://example.com:8188",
        "http://user:secret@127.0.0.1:8188",
        "http://127.0.0.1:8188/path",
        "http://127.0.0.1:8188/?q=x",
        "https://127.0.0.1:8188",
        "http://127.0.0.1:0",
        "http://127.0.0.1:65536",
        "http://127.0.0.1:not-a-port",
    ],
)
def test_comfy_url_rejects_noncanonical_or_unsafe_values(value: str) -> None:
    with pytest.raises(ValueError):
        validate_comfy_url(value)


def test_output_directory_requires_absolute_existing_directory_outside_attempt(tmp_path: Path) -> None:
    output = tmp_path / "comfy-output"
    output.mkdir()
    attempt_root = tmp_path / "attempt"
    attempt_root.mkdir()

    assert validate_output_directory(str(output), attempt_root) == str(output)
    assert validate_output_directory("", attempt_root) == ""
    with pytest.raises(ValueError):
        validate_output_directory("relative/output", attempt_root)
    with pytest.raises(ValueError):
        validate_output_directory(str(tmp_path / "missing"), attempt_root)
    inside_attempt = attempt_root / "output"
    inside_attempt.mkdir()
    with pytest.raises(ValueError, match="outside the attempt root"):
        validate_output_directory(str(inside_attempt), attempt_root)


def test_output_directory_rejects_symlinks_in_path_and_ancestors(tmp_path: Path) -> None:
    target = tmp_path / "target"
    target.mkdir()
    (target / "child").mkdir()
    linked_dir = tmp_path / "linked-dir"
    linked_dir.symlink_to(target, target_is_directory=True)
    direct_link = tmp_path / "direct-link"
    direct_link.symlink_to(target, target_is_directory=True)

    with pytest.raises(ValueError):
        validate_output_directory(str(direct_link), tmp_path / "attempt")
    with pytest.raises(ValueError):
        validate_output_directory(str(linked_dir / "child"), tmp_path / "attempt")


@pytest.mark.parametrize("value", ["../task", "task/child", "task name", "-task", "task-", ".", "..", ""])
def test_identity_rejects_values_that_normalization_could_change(value: str) -> None:
    with pytest.raises(ValueError):
        validate_identity(value)


def test_identity_preserves_safe_host_identity() -> None:
    assert validate_identity("task_1.2:attempt") == "task_1.2:attempt"


def test_upload_sends_namespaced_multipart_and_returns_comfy_reference(
    comfy: _ComfyFixture, tmp_path: Path
) -> None:
    source = tmp_path / "portrait.png"
    source.write_bytes(b"png bytes")

    assert upload_image(comfy.url, source, task_id="task-1") == "astrid/task-1/portrait.png"

    content_type, body = next(value for path, value in comfy.calls if path == "/upload/image")
    assert content_type.startswith("multipart/form-data; boundary=")
    assert b'name="subfolder"' in body and b"astrid/task-1" in body
    assert b'name="type"' in body and b"input" in body
    assert b'name="image"; filename="portrait.png"' in body
    assert b"Content-Type: image/png" in body
    assert b"png bytes" in body


@pytest.mark.parametrize(
    "result",
    [
        {"name": "../portrait.png", "subfolder": "astrid/task-1", "type": "input"},
        {"name": "dir/portrait.png", "subfolder": "astrid/task-1", "type": "input"},
        {"name": "..\\portrait.png", "subfolder": "astrid/task-1", "type": "input"},
        {"name": "portrait.png", "subfolder": "astrid/other", "type": "input"},
        {"name": "portrait.png", "subfolder": "astrid/task-1", "type": "output"},
    ],
)
def test_upload_rejects_unsafe_returned_references(
    comfy: _ComfyFixture, tmp_path: Path, result: dict[str, object]
) -> None:
    source = tmp_path / "portrait.png"
    source.write_bytes(b"png bytes")
    comfy.upload_result = result

    with pytest.raises(ValueError, match="unsafe uploaded image reference"):
        upload_image(comfy.url, source, task_id="task-1")


def _journal(destination: Path, name: str, acceptance: dict[str, object]) -> None:
    path = destination / ".vibecomfy-runtime" / "out" / "runs" / name / "attempt.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"queue_acceptance": acceptance}), encoding="utf-8")


def test_cleanup_deletes_only_journaled_prompt_and_interrupts_only_if_it_is_running(
    comfy: _ComfyFixture, tmp_path: Path
) -> None:
    _journal(tmp_path, "ours", {"status": "accepted", "prompt_id": "ours"})
    _journal(tmp_path, "not-accepted", {"status": "pending", "prompt_id": "foreign"})
    _journal(tmp_path, "no-id", {"status": "accepted"})
    comfy.running_prompt = "ours"

    cleanup_prompts(comfy.url, tmp_path)

    assert ("/queue", {"delete": ["ours"]}) in comfy.calls
    assert ("/interrupt", {"prompt_id": "ours"}) in comfy.calls
    assert all(path not in {"/api/free", "/queue/clear"} for path, _ in comfy.calls)
    assert all(payload != {"delete": ["foreign"]} for _, payload in comfy.calls)
    assert all(payload != {"prompt_id": "foreign"} for _, payload in comfy.calls)


def test_cleanup_does_not_interrupt_when_our_prompt_is_not_running(
    comfy: _ComfyFixture, tmp_path: Path
) -> None:
    _journal(tmp_path, "ours", {"status": "accepted", "prompt_id": "ours"})
    comfy.running_prompt = "foreign"

    cleanup_prompts(comfy.url, tmp_path)

    assert ("/queue", {"delete": ["ours"]}) in comfy.calls
    assert not any(path == "/interrupt" for path, _ in comfy.calls)
    assert not any(path == "/api/free" for path, _ in comfy.calls)


def test_managed_adapter_release_cleans_up_after_crash(comfy: _ComfyFixture, tmp_path: Path) -> None:
    from astrid.core.execution.generic_host import _ManagedLocalServerTaskAdapter

    _journal(tmp_path, "crashed", {"status": "accepted", "prompt_id": "ours"})
    comfy.running_prompt = "ours"
    signal = threading.Event()
    adapter = _ManagedLocalServerTaskAdapter(signal, url=comfy.url, destination=tmp_path)

    released = adapter.release(reason="task process crashed")

    assert released["released"] is True
    assert ("/queue", {"delete": ["ours"]}) in comfy.calls
    assert ("/interrupt", {"prompt_id": "ours"}) in comfy.calls
    assert not any(path == "/api/free" for path, _ in comfy.calls)


def test_network_policy_uses_validated_custom_port_and_preserves_other_capabilities() -> None:
    static = {
        "allowed_protocols": ["tcp"],
        "allowed_destinations": ["127.0.0.1:8188"],
        "allow_redirects": False,
    }
    record = SimpleNamespace(
        id="vibecomfy.run",
        definition=SimpleNamespace(metadata={"network_policy": static}),
        matrix={},
    )

    assert generic_host._network_policy(record) == static
    policy = generic_host._network_policy(record, {"comfy_url": "http://localhost:43127/"})
    assert policy == {
        "allowed_protocols": ["dns", "tcp"],
        "allowed_destinations": ["127.0.0.1:43127"],
        "allow_redirects": False,
    }
    assert "127.0.0.1:8188" not in policy["allowed_destinations"]
    assert "127.0.0.1:43128" not in policy["allowed_destinations"]
    with pytest.raises(ValueError):
        generic_host._network_policy(record, {"comfy_url": "http://192.168.1.8:43127"})

    other_record = SimpleNamespace(
        id="other.capability",
        definition=SimpleNamespace(metadata={"network_policy": static}),
        matrix={},
    )
    assert generic_host._network_policy(
        other_record, {"comfy_url": "http://localhost:43127"}
    ) == static


def test_network_hook_allows_selected_port_and_denies_another(comfy, tmp_path):
    record = SimpleNamespace(id="vibecomfy.run", matrix={}, definition=SimpleNamespace(metadata={
        "network_policy": {"allowed_destinations": ["127.0.0.1:8188"]},
    }))
    policy = generic_host._network_policy(record, {"comfy_url": comfy.url})
    script = """
import json, socket, sys, urllib.request
from astrid.core.execution.network_policy import install, NetworkPolicyError
install(json.loads(sys.argv[1]), sys.argv[2])
with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(sys.argv[3] + '/queue') as response:
    assert response.status == 200
try:
    socket.create_connection(('127.0.0.1', int(sys.argv[4])), timeout=1)
except NetworkPolicyError:
    pass
else:
    raise AssertionError('foreign port was allowed')
"""
    denied_port = 8188 if comfy.server.server_port != 8188 else 8189
    result = subprocess.run(
        [sys.executable, "-c", script, json.dumps(policy), str(tmp_path / "network.json"), comfy.url, str(denied_port)],
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[3])},
        capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stderr
