from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from astrid.core.foundation.atomic_io import write_json_atomic
from astrid.core.foundation.hash import sha256_file
from astrid.core.rendering import publication
from astrid.core.rendering.provenance import (
    validate_backend_fragments,
)
from astrid.core.rendering.publication import (
    is_render_result_committed,
    publish_render_result,
    read_committed_provenance,
)
from tests.core.rendering.test_service import (
    FakeTransport,
    _request,
    _service,
)


def _sidecar(output: Path) -> Path:
    return Path(f"{output}.provenance.json")


def _read_sidecar(output: Path) -> dict[str, Any]:
    return json.loads(_sidecar(output).read_text(encoding="utf-8"))


@pytest.mark.parametrize("core_key", ["routing", "resolved_policy", "engine"])
def test_backend_fragment_core_key_collision_is_rejected(core_key: str) -> None:
    with pytest.raises(ValueError, match="core-owned keys"):
        validate_backend_fragments(
            {"lineage.renderer": {core_key: "backend-owned-spoof"}}
        )


def test_one_sidecar_is_committed_per_success(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "one-sidecar.mp4"

    service.render_request(
        _request(tmp_path), selector="rendering.ffmpeg", out_path=output
    )

    sidecars = list(tmp_path.rglob("*.provenance.json"))
    assert sidecars == [_sidecar(output)]
    payload = read_committed_provenance(output, sidecar_path=sidecars[0])
    assert payload is not None
    assert payload["sha256"] == sha256_file(output)


def test_previous_output_cleanup_skips_a_live_locked_render(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    request = _request(tmp_path)
    previous = tmp_path / "previous" / "video.mp4"
    previous.parent.mkdir()
    previous.write_bytes(b"still-live")
    previous_sidecar = _sidecar(previous)
    write_json_atomic(
        previous_sidecar,
        {
            "output": str(previous.resolve()),
            "timeline": request.timeline_path,
            "sha256": sha256_file(previous),
        },
    )
    lock = publication._lock_for(previous)
    lock.acquire(timeout=0)
    output = tmp_path / "current" / "video.mp4"
    try:
        service.render_request(
            request,
            selector="rendering.ffmpeg",
            out_path=output,
            previous_outputs=[previous],
        )
    finally:
        lock.release()

    assert previous.read_bytes() == b"still-live"
    assert read_committed_provenance(
        previous, sidecar_path=previous_sidecar
    ) is not None
    assert read_committed_provenance(
        output, sidecar_path=_sidecar(output)
    ) is not None


# ---------------------------------------------------------------------------
# T4.5 — provenance / crash-recovery matrix
# ---------------------------------------------------------------------------


def test_attachments_are_recorded_in_committed_provenance(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    transport.render_attachments["rendering.ffmpeg"] = {
        "badge.png": b"badge-bytes"
    }
    service = _service(tmp_path, transport)
    output = tmp_path / "attachment-provenance.mp4"

    service.render_request(
        _request(tmp_path), selector="rendering.ffmpeg", out_path=output
    )

    payload = _read_sidecar(output)
    attachment = payload["attachments"]["badge.png"]
    assert attachment["sha256"] == hashlib.sha256(b"badge-bytes").hexdigest()
    assert attachment["kind"] == "fixture"
    committed = read_committed_provenance(output, sidecar_path=_sidecar(output))
    assert committed is not None
    assert committed["attachments"] == payload["attachments"]
    assert committed["artifact_profiles"] == payload["artifact_profiles"]


@pytest.mark.parametrize(
    "scenario",
    [
        "video-only",
        "sidecar-only",
        "hash-mismatch",
        "wrong-output",
        "empty-video",
        "malformed-sidecar",
    ],
)
def test_incomplete_pair_never_read_as_committed(
    tmp_path: Path, scenario: str
) -> None:
    video = tmp_path / "video.mp4"
    sidecar = _sidecar(video)
    valid_payload = {
        "output": str(video.resolve()),
        "timeline": str(tmp_path / "timeline.json"),
        "sha256": hashlib.sha256(b"media-bytes").hexdigest(),
        "engine": "ffmpeg",
    }

    if scenario == "video-only":
        video.write_bytes(b"media-bytes")
    elif scenario == "sidecar-only":
        write_json_atomic(sidecar, valid_payload)
    elif scenario == "hash-mismatch":
        video.write_bytes(b"media-bytes")
        write_json_atomic(sidecar, dict(valid_payload, sha256="0" * 64))
    elif scenario == "wrong-output":
        video.write_bytes(b"media-bytes")
        write_json_atomic(
            sidecar,
            dict(valid_payload, output=str((tmp_path / "elsewhere.mp4").resolve())),
        )
    elif scenario == "empty-video":
        video.write_bytes(b"")
        write_json_atomic(sidecar, valid_payload)
    elif scenario == "malformed-sidecar":
        video.write_bytes(b"media-bytes")
        sidecar.write_text("{not json", encoding="utf-8")

    assert read_committed_provenance(video, sidecar_path=sidecar) is None
    assert is_render_result_committed(video, sidecar_path=sidecar) is False


def test_valid_pair_is_read_as_committed(tmp_path: Path) -> None:
    video = tmp_path / "video.mp4"
    video.write_bytes(b"media-bytes")
    payload = {
        "output": str(video.resolve()),
        "timeline": str(tmp_path / "timeline.json"),
        "sha256": hashlib.sha256(b"media-bytes").hexdigest(),
        "engine": "ffmpeg",
    }
    write_json_atomic(_sidecar(video), payload)

    committed = read_committed_provenance(video, sidecar_path=_sidecar(video))
    assert committed is not None
    assert committed["sha256"] == payload["sha256"]
    assert is_render_result_committed(video, sidecar_path=_sidecar(video)) is True


def test_orphaned_video_after_publish_is_never_committed(tmp_path: Path) -> None:
    staged = tmp_path / "stage" / "video.mp4"
    staged.parent.mkdir(parents=True, exist_ok=True)
    staged.write_bytes(b"published-media")
    output = tmp_path / "out" / "video.mp4"
    provenance = {
        "timeline": str(tmp_path / "timeline.json"),
        "engine": "ffmpeg",
        "requested_policy": "ffmpeg",
    }

    published = publish_render_result(
        staged,
        provenance,
        out_path=output,
        sidecar_path=_sidecar(output),
    )
    assert published == output
    assert read_committed_provenance(output, sidecar_path=_sidecar(output)) is not None

    # A crash between the video move and the atomic sidecar write leaves an
    # orphan video: visible for recovery, never treated as committed.
    _sidecar(output).unlink()
    assert read_committed_provenance(output, sidecar_path=_sidecar(output)) is None
    assert is_render_result_committed(output, sidecar_path=_sidecar(output)) is False
    assert output.read_bytes() == b"published-media"
