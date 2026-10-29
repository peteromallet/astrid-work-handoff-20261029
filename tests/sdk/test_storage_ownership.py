from __future__ import annotations

import os
import time
from pathlib import Path

from astrid.sdk.media_views import clone_or_copy, verified_cas_path
from astrid.sdk.storage_ownership import reclaim, register_owned_root, registered_roots
from astrid.packs.rendering.actions.timeline_visualize.fast_lane import _prune_runs


def test_registry_describes_all_reported_persistent_roots(tmp_path: Path) -> None:
    policies = {row.name: row for row in registered_roots(tmp_path)}
    assert {"media-view", "astrid-open", "timeline-visualize", "fast-lane-objects", "fast-lane-capture", "fast-lane-verify", "attempt-roots", "host-log-archives", "replay-output", "replay-workdir", "legacy-cache"} <= policies.keys()
    assert all(row.purpose and row.reader and row.lifecycle for row in policies.values())


def test_package_persistent_writers_are_registered() -> None:
    package = Path(__file__).resolve().parents[2] / "astrid"
    roots = {policy.name for policy in registered_roots(Path("/tmp/astrid-conformance"), temporary_root=Path("/tmp"), cache_root=Path("/tmp"))}
    ownership = {
        "media-view": "media-view",
        "astrid-open": "astrid-open",
        "FAST_ROOT": "fast-lane-objects",
        "capture-": "fast-lane-capture",
        "verify-": "fast-lane-verify",
        "astrid-attempt-": "attempt-roots",
        "replay-output": "replay-output",
        "replay-workdir": "replay-workdir",
        "generic-host.log": "host-log-archives",
    }
    writer_ops = ("write_bytes", "copyfile", "copytree", "copy2", "mkdtemp", "mkdir", "open(")
    observed = set()
    for source in package.rglob("*.py"):
        text = source.read_text(encoding="utf-8")
        if any(op in text for op in writer_ops):
            observed.update(marker for marker in ownership if marker in text)
    assert observed == set(ownership)
    assert {ownership[marker] for marker in observed} <= roots


def test_fast_lane_prunes_capture_and_verify_runs(tmp_path: Path) -> None:
    for prefix in ("capture-", "verify-"):
        for index in range(8):
            (tmp_path / f"{prefix}{index}").mkdir()
            os.utime(tmp_path / f"{prefix}{index}", (index + 1, index + 1))
    _prune_runs(tmp_path, keep=3)
    assert len(list(tmp_path.glob("capture-*"))) == 3
    assert len(list(tmp_path.glob("verify-*"))) == 3


def test_renderer_replay_roots_are_registered_and_reclaimed_outside_production(tmp_path: Path) -> None:
    data = tmp_path / "data"
    output = tmp_path / "bundle.replay-output"
    workdir = tmp_path / "bundle.replay-workdir"
    output.mkdir()
    (output / "result.bin").write_bytes(b"result")
    workdir.mkdir()
    (workdir / "scratch.bin").write_bytes(b"scratch")
    register_owned_root(data, output, "replay-output")
    register_owned_root(data, workdir, "replay-workdir")
    production = tmp_path / "production" / "bundle.replay-output"
    production.mkdir(parents=True)
    register_owned_root(data, production, "replay-output")

    for path, age in ((output, 8 * 86400), (workdir, 3 * 86400)):
        old = time.time() - age
        os.utime(path, (old, old))
    rows = registered_roots(data, temporary_root=tmp_path / "tmp", cache_root=tmp_path / "cache")
    assert {row.name for row in rows} >= {"replay-output", "replay-workdir"}
    report = reclaim(data, temporary_root=tmp_path / "tmp", cache_root=tmp_path / "cache")
    assert not output.exists() and not workdir.exists()
    assert production.exists()
    assert report["reclaimed_bytes"] == len(b"result") + len(b"scratch")
    manifest = (data / "storage-owned-roots.json").read_text()
    assert "production" not in manifest and '"roots": []' in manifest


def test_reclaim_dry_run_reports_only_expired_owned_files(tmp_path: Path) -> None:
    view = tmp_path / "media-view" / "almost-ready" / "a.png"
    view.parent.mkdir(parents=True)
    view.write_bytes(b"media-view")
    old = time.time() - 31 * 86400
    os.utime(view, (old, old))
    ignored = tmp_path / "drafts" / "keep.json"
    ignored.parent.mkdir()
    ignored.write_bytes(b"draft")

    report = reclaim(tmp_path, dry_run=True, temporary_root=tmp_path / "tmp", cache_root=tmp_path / "cache")
    row = next(item for item in report["roots"] if item["name"] == "media-view")
    assert row["bytes"] == len(b"media-view")
    assert row["expired_count"] == 1
    assert report["reclaimable_bytes"] >= len(b"media-view")
    assert view.exists() and ignored.exists()


def test_reclaim_deletes_expired_files_and_keeps_fresh_files(tmp_path: Path) -> None:
    folder = tmp_path / "astrid-open"
    folder.mkdir()
    old = folder / "old.png"
    fresh = folder / "fresh.png"
    old.write_bytes(b"old")
    fresh.write_bytes(b"fresh")
    then = time.time() - 2 * 86400
    os.utime(old, (then, then))

    report = reclaim(tmp_path, temporary_root=tmp_path / "tmp", cache_root=tmp_path / "cache")
    assert not old.exists()
    assert fresh.exists()
    row = next(item for item in report["roots"] if item["name"] == "astrid-open")
    assert row["reclaimed_bytes"] == 3


def test_copy_on_write_view_is_digest_verified_and_independent(tmp_path: Path) -> None:
    source = tmp_path / "cas-object"
    view = tmp_path / "view.png"
    source.write_bytes(b"immutable source")
    assert clone_or_copy(source, view, digest="sha256:" + __import__("hashlib").sha256(source.read_bytes()).hexdigest()) in {"copy", "apfs-clone"}
    view.write_bytes(b"changed view")
    assert source.read_bytes() == b"immutable source"


def test_verified_cas_path_requires_runtime_attestation(tmp_path: Path) -> None:
    data = b"verified"
    digest = __import__("hashlib").sha256(data).hexdigest()
    source = tmp_path / "realm" / "cas" / "sha256" / digest[:2] / digest[2:]
    source.parent.mkdir(parents=True)
    source.write_bytes(data)

    class Runtime:
        def get_project_object_location(self, project, object_id):
            assert project == "almost-ready"
            assert object_id == "sha256:" + digest
            return {"storage": "runtime_cas", "verified": True, "digest": digest, "local_path": str(source)}

    assert verified_cas_path(Runtime(), "almost-ready", digest, size=len(data)) == source
