"""Exercise callers through Runtime's Windows replacement and directory policy."""
from __future__ import annotations

import errno
import hashlib
import io
import json
import os
import stat
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from runtime_protocol import platform

from astrid.core.foundation.atomic_io import (
    AtomicWriteError,
    write_bytes_atomic,
    write_json_atomic,
    write_text_atomic,
)
from astrid.core.model_setup.acquire import acquire_artifact
from astrid.core.model_setup.manifest import make_manifest
from astrid.packs.rendering.actions.timeline_visualize.filmstrip_execution import _write_zip_atomic
from astrid.packs.runpod.worker_preparation import write_target_record
from astrid.packs.runpod.worker_staging import _atomic_private_write
from astrid.sdk.client import AstridClient
from astrid.sdk.project_render import _materialize
from astrid.sdk.remote import RemoteAstridClient
from tests.test_preferences_documents import Runtime


@pytest.fixture
def windows_filesystem(monkeypatch):
    """Keep real file I/O; model CRT directory rejection and the Win32 move seam."""
    original_open, original_fsync, original_replace = os.open, os.fsync, os.replace
    calls, flushes, directories = [], [], []
    pending = [32]

    def open_file(path, flags, *args, **kwargs):
        if not isinstance(path, int) and Path(path).is_dir():
            directories.append(path)
            raise PermissionError(errno.EACCES, "Windows CRT cannot open directories", str(path))
        return original_open(path, flags, *args, **kwargs)

    def fsync_file(fd):
        assert not stat.S_ISDIR(os.fstat(fd).st_mode), "Windows cannot fsync a directory"
        flushes.append(fd)
        return original_fsync(fd)

    def move(source, destination):
        calls.append((Path(source), Path(destination)))
        if pending:
            error = PermissionError(errno.EACCES, "transient sharing violation")
            error.winerror = pending.pop()
            raise error
        return original_replace(source, destination)

    # Only Runtime's platform selector changes; pathlib/pytest keep the host OS.
    monkeypatch.setattr(platform, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(platform, "_move_file_write_through", move)
    monkeypatch.setattr(platform.time, "sleep", lambda _delay: None)
    monkeypatch.setattr(os, "open", open_file)
    monkeypatch.setattr(os, "fsync", fsync_file)
    return SimpleNamespace(calls=calls, flushes=flushes, directories=directories)


@pytest.mark.parametrize("writer,content", [
    (write_text_atomic, "updated text"),
    (write_bytes_atomic, b"updated bytes"),
    (write_json_atomic, {"updated": True}),
])
def test_atomic_writers_use_windows_durable_publication(tmp_path, windows_filesystem, writer, content):
    target = tmp_path / "publication" / "published"
    target.parent.mkdir()
    target.write_text("previous")
    writer(target, content)
    actual = json.loads(target.read_text()) if isinstance(content, dict) else (
        target.read_bytes() if isinstance(content, bytes) else target.read_text()
    )
    assert actual == content
    assert len(windows_filesystem.calls) == 2  # transient sharing failure, then publication
    assert windows_filesystem.flushes and not windows_filesystem.directories
    assert list(target.parent.iterdir()) == [target]


@pytest.mark.parametrize("writer,content", [
    (write_text_atomic, "updated text"),
    (write_bytes_atomic, b"updated bytes"),
    (write_json_atomic, {"updated": True}),
])
def test_atomic_writers_preserve_target_after_windows_move_failure(
    tmp_path, windows_filesystem, monkeypatch, writer, content
):
    target = tmp_path / "publication" / "published"
    target.parent.mkdir()
    target.write_text("previous")
    attempts = []

    def fail(source, destination):
        attempts.append((source, destination))
        raise PermissionError(errno.EACCES, "permanent move failure")

    monkeypatch.setattr(platform, "_move_file_write_through", fail)
    with pytest.raises(AtomicWriteError, match="permanent move failure"):
        writer(target, content)
    assert len(attempts) == 1
    assert target.read_text() == "previous"
    assert list(target.parent.iterdir()) == [target]


@pytest.mark.parametrize("scope", ["document", "user", "project"])
def test_changed_working_copy_checks_in_with_windows_metadata_publication(
    tmp_path, windows_filesystem, scope
):
    runtime = Runtime()
    client = AstridClient(remote=RemoteAstridClient(runtime))
    target = tmp_path / "working.md"
    if scope == "document":
        document = client.documents.create(kind="pack.brief", content="previous").data
        family = client.documents
        checkout = family.checkout(document["document_id"], file=target)
    else:
        family = client.preferences
        checkout = family.checkout(scope=scope, file=target)
    assert checkout.ok
    target.write_text("updated content")
    result = family.checkin(target)
    assert result.ok and result.data["changed"]
    metadata = json.loads(target.with_name(target.name + ".astrid.json").read_text())
    assert metadata["retry"] is None and metadata["base_version"] == result.data["version"]
    assert runtime.writes[-1][1] == "updated content"
    assert len(windows_filesystem.calls) == 3  # retry journal retries, receipt replaces once
    assert windows_filesystem.flushes and not windows_filesystem.directories
    assert not list(tmp_path.glob(".astrid-document-*"))


@pytest.mark.parametrize("writer", [write_target_record, _atomic_private_write])
def test_runpod_local_records_use_windows_durable_publication(
    tmp_path, windows_filesystem, monkeypatch, writer
):
    if os.name != "nt":
        from runtime_protocol import windows_security
        # The ACL boundary is independent of the Windows directory/move policy.
        monkeypatch.setattr(windows_security, "restrict", lambda fd: os.fchmod(fd, 0o600))
    target = tmp_path / "publication" / "record.json"
    writer(target, {"operation_id": "owned-operation"})
    assert json.loads(target.read_text()) == {"operation_id": "owned-operation"}
    if writer is _atomic_private_write:
        if os.name == "nt":
            assert platform.is_owner_only(target)
        else:
            assert stat.S_IMODE(target.stat().st_mode) == 0o600
    assert len(windows_filesystem.calls) == 2
    assert windows_filesystem.flushes and not windows_filesystem.directories
    assert list(target.parent.iterdir()) == [target]


def test_render_cache_uses_windows_durable_publication(tmp_path, windows_filesystem):
    data = b"verified render"
    digest = hashlib.sha256(data).hexdigest()
    target = _materialize(data, digest=digest, size=len(data), filename="render.mp4", cache_root=tmp_path)
    assert target.read_bytes() == data
    assert len(windows_filesystem.calls) == 2
    assert windows_filesystem.flushes and not windows_filesystem.directories
    assert not list(target.parent.glob(".astrid-render-*"))


def test_filmstrip_bundle_uses_windows_durable_publication(tmp_path, windows_filesystem):
    source = tmp_path / "bundle"
    source.mkdir()
    (source / "manifest.json").write_text('{"complete":true}')
    target = tmp_path / "filmstrip.zip"
    target.write_bytes(b"previous complete archive")
    _write_zip_atomic(target, source)
    with zipfile.ZipFile(target) as archive:
        assert json.loads(archive.read("manifest.json")) == {"complete": True}
    assert len(windows_filesystem.calls) == 2
    assert windows_filesystem.flushes and not windows_filesystem.directories
    assert not list(tmp_path.glob(".filmstrip.zip.*.tmp"))


def test_acquired_model_uses_windows_durable_publication(tmp_path, windows_filesystem):
    data = b"verified model"
    manifest = make_manifest("model.bin", version="1", content=data,
                             license_identity="test", license_text=b"test license")
    result = acquire_artifact(manifest, tmp_path / "executor", "https://example.invalid/model.bin",
                              urlopen=lambda _request: io.BytesIO(data))
    assert result.path.read_bytes() == data
    assert result.sha256 == hashlib.sha256(data).hexdigest()
    assert len(windows_filesystem.calls) == 3  # staging retry, final artifact publication
    assert not windows_filesystem.directories
    assert list((tmp_path / "executor" / "tmp").iterdir()) == []
