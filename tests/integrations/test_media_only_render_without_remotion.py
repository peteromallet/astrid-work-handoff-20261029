"""A media-only render on a host without Remotion, against a real Runtime (journey F2, steps 3 and 4).

The renderer stays an explicit choice: ``rendering.render`` is advertised ready without Remotion, a task that
omits its selector is rendered by ``rendering.ffmpeg`` when this host cannot run Remotion, and a task that names
``rendering.remotion`` fails at its lease with the Remotion fault. Nothing is mocked below the host: a real
daemon at the vendored Runtime commit, a real ``GenericPackHost`` on the rendering pack, real ffmpeg.
"""
from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import urllib.error
import urllib.request
import uuid
import zlib
from pathlib import Path
from typing import Any

import pytest

from astrid.core.execution.generic_host import GenericPackHost, HostError, RuntimeProtocolClient
from tests.helpers.runtime import vendored_runtime_commit

pytestmark = pytest.mark.integration  # needs the Runtime from a second checkout and ffmpeg

PACK = Path(__file__).resolve().parents[2] / "astrid" / "packs" / "rendering"
R_COLOUR, R1_COLOUR = "e8452c", "2c84e8"  # the marker clip of R, and of the revision published after the render was admitted
SCOPES = ["projects:read", "projects:write", "objects:read", "objects:write", "tasks:read", "tasks:write"]


@pytest.fixture(autouse=True)
def no_remotion(monkeypatch):
    for name in ("ASTRID_REMOTION_PROJECT_DIR", "ASTRID_NODE_EXECUTABLE", "ASTRID_TIMELINE_SCHEMA_PYTHONPATH"):
        monkeypatch.delenv(name, raising=False)
    assert shutil.which("ffmpeg") and shutil.which("ffprobe"), "this test renders with real ffmpeg"


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def _png(colour: str, width: int = 64, height: int = 48) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    row = b"\x00" + bytes.fromhex(colour) * width
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b""))


class Film:
    """One project with a media-only timeline published as revision R, driven over the Runtime's HTTP API."""

    def __init__(self, daemon: Any, work: Path) -> None:
        self.daemon, self.work = daemon, work
        self.timeline = str(uuid.uuid4())
        self.request("POST", "/v1/handshake", {"client_name": "media-only-render", "client_version": "0", "requested_scopes": SCOPES})
        self.project = self.data(self.request("POST", "/v1/projects", {"name": "media only"}, headers={"Idempotency-Key": "project"}))["project_id"]
        _ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x180:rate=15:duration=4", "-c:v", "libvpx", "-b:v", "600k", str(work / "clip.webm"))
        _ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "libopus", str(work / "tone.webm"))
        self.assets = {
            "marker": self.ingest(self.solid(R_COLOUR, "marker.webm"), "video/webm", "marker.webm", duration=2),
            "video": self.ingest((work / "clip.webm").read_bytes(), "video/webm", "clip.webm", duration=4),
            "tone": self.ingest((work / "tone.webm").read_bytes(), "audio/webm", "tone.webm", duration=4),
        }
        self.config = {"output": {"resolution": "320x180", "fps": 30, "file": "out.mp4"}, "clips": [], "tracks": [
            {"id": "V1", "kind": "visual", "label": "V1"}, {"id": "A1", "kind": "audio", "label": "A1"}]}
        self.head: str | None = None

    # -- HTTP -----------------------------------------------------------------------------------
    def request(self, method: str, path: str, body: Any = None, *, headers: dict[str, str] | None = None,
                raw: bytes | None = None, token: str | None = None) -> tuple[int, Any]:
        sent = {"Authorization": f"Bearer {token or self.daemon.token}", **(headers or {})}
        if method == "POST":
            sent.setdefault("Idempotency-Key", str(uuid.uuid4()))
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        if body is not None:
            sent.setdefault("Content-Type", "application/json")
        call = urllib.request.Request(self.daemon.endpoint + path, data=data, headers=sent, method=method)
        try:
            with urllib.request.urlopen(call, timeout=60) as answer:
                payload = answer.read()
                return answer.status, (json.loads(payload) if payload and answer.headers.get_content_type() == "application/json" else payload)
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode(errors="replace")

    @staticmethod
    def data(answer: tuple[int, Any]) -> Any:
        status, body = answer
        assert status in (200, 201), (status, body)
        return body.get("data", body)

    # -- the film -------------------------------------------------------------------------------
    def solid(self, colour: str, name: str) -> bytes:
        _ffmpeg("-f", "lavfi", "-i", f"color=c=0x{colour}:s=320x180:r=15:d=2", "-c:v", "libvpx", "-b:v", "200k", str(self.work / name))
        return (self.work / name).read_bytes()

    def ingest(self, data: bytes, media_type: str, name: str, **extra: Any) -> dict[str, Any]:
        stored = self.data(self.request("POST", f"/v1/projects/{self.project}/objects", raw=data, headers={
            "Content-Type": media_type, "Idempotency-Key": str(uuid.uuid4()), "X-Original-Name": name}))
        # As the App publishes it: identity, and the object's own route as its `file` (the only locator the Runtime accepts when it
        # freezes a render; it refuses an absolute URL as unmanaged). The route freeze is in the Runtime from 32b3a24, which the
        # vendored commit (runtime.lock.json) includes.
        return {"type": media_type, "media_id": stored["object_id"], "content_sha256": stored["digest"].removeprefix("sha256:"),
                "file": f"/v1/objects/{stored['object_id']}", **extra}

    def publish(self, clips: list[dict[str, Any]], assets: dict[str, Any], **timeline_fields: Any) -> str:
        parent = str(uuid.uuid4())
        config = {**self.config, **timeline_fields, "clips": clips}
        body = {"project_id": self.project, "timeline_id": self.timeline, "expected_head": self.head, "parent_revision_id": parent,
                "parent_composition": {"slug": "main", "name": "Main", "config": config, "registry": {"assets": assets},
                                       "clips": clips, "occurrences": []},
                "shot_revisions": [], "internal_timeline_revisions": []}
        self.head = self.data(self.request("POST", f"/v1/projects/{self.project}/timelines/{self.timeline}/composition-revisions", body))["new_head"]
        return self.head

    def media_clips(self, marker: str = "marker", **tweaks: Any) -> list[dict[str, Any]]:
        return [
            {"id": "m", "at": 0, "track": "V1", "clipType": "media", "asset": marker, "from": 0, "to": 2, "speed": 1, **tweaks},
            {"id": "v", "at": 2, "track": "V1", "clipType": "media", "asset": "video", "from": 0, "to": 2, "speed": 1},
            {"id": "a", "at": 0, "track": "A1", "clipType": "media", "asset": "tone", "from": 0, "to": 4, "speed": 1, "volume": 1},
        ]

    # -- the App's render request ---------------------------------------------------------------
    def catalog_row(self) -> dict[str, Any]:
        status, body = self.request("GET", "/v1/capabilities?limit=200")
        assert status == 200, body
        return next(row for row in body["items"] if row["capability_id"] == "rendering.render")

    def admit(self, selector: str | None = None) -> str:
        row = self.catalog_row()
        params = {"timeline_ref": self.timeline, "output_name": "f2.mp4", **({} if selector is None else {"selector": selector})}
        body = {"project": self.project, "capability_id": "rendering.render", "capability_digest": row["definition_digest"],
                "schema_version": "1", "input_object_ids": [],
                "spec": {"family": "rendering.render", "params": params,
                         "output_policy": {"format": "mp4", "destination": "download", "filename": "f2.mp4"}},
                "storage_estimate": {"scratch_bytes": row["estimated_scratch_bytes"], "output_bytes": row["estimated_output_bytes"]},
                "settlement_effect": {}}
        status, admitted = self.request("POST", "/v1/tasks", body, headers={"Idempotency-Key": str(uuid.uuid4())})
        assert status in (200, 201, 202), (status, admitted)
        return (admitted.get("data", admitted)).get("task_id") or admitted["data"]["task"]["id"]

    def task(self, task_id: str) -> dict[str, Any]:
        status, body = self.request("GET", f"/v1/tasks/{task_id}")
        assert status == 200, body
        return body.get("data", body)


@pytest.fixture
def world(tmp_path, real_runtime):
    daemon = real_runtime(support_root=tmp_path / "support", commit=vendored_runtime_commit())
    film = Film(daemon, tmp_path)
    host = GenericPackHost(pack_roots=[PACK], client=RuntimeProtocolClient(daemon.endpoint, daemon.worker_token),
                           executor_id="astrid-pack-host", attempt_root=tmp_path / "attempts")
    host.discover()
    host.register(deliberate=True)
    try:
        yield film, host
    finally:
        host.shutdown()


def _frame(video: Path, at: str) -> tuple[int, int, int]:
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", at, "-i", str(video), "-frames:v", "1", "-vf", "scale=1:1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return raw[0], raw[1], raw[2]


def _distance(left: tuple[int, int, int], colour: str) -> int:
    return sum(abs(a - b) for a, b in zip(left, bytes.fromhex(colour)))


def _streams(video: Path) -> set[tuple[str, str]]:
    shown = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", str(video)],
                           capture_output=True, check=True, text=True).stdout
    return {(item["codec_type"], item["codec_name"]) for item in json.loads(shown)["streams"]}


def _colour(video: Path) -> dict[str, str]:
    shown = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=color_space,color_primaries,color_transfer,color_range", "-of", "json", str(video)],
                           capture_output=True, check=True, text=True).stdout
    return json.loads(shown)["streams"][0]


def _mean_volume(video: Path) -> float:
    report = subprocess.run(["ffmpeg", "-i", str(video), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(next(line for line in report.splitlines() if "mean_volume" in line).rsplit(":", 1)[1].split()[0])


def test_a_media_only_render_without_remotion_pins_revision_r_and_is_rendered_by_ffmpeg(world, tmp_path):
    film, host = world
    # Remotion is unavailable here, and rendering.render is still advertised ready.
    record = host.capabilities["rendering.render"]
    assert record.ready and record.preflight["remotion"]["ok"] is False
    assert "ASTRID_REMOTION_PROJECT_DIR" in record.preflight["remotion"]["reason"]
    row = film.catalog_row()
    assert (row["status"], row["unavailable_reason"]) == ("ready", None)

    revision_r = film.publish(film.media_clips(), film.assets)
    task_id = film.admit()  # the App's request: no selector
    # R+1 is published before the host runs: only the pinned R may be rendered.
    marker_after = film.ingest(film.solid(R1_COLOUR, "marker-after.webm"), "video/webm", "marker-after.webm", duration=2)
    revision_after = film.publish(film.media_clips(marker="marker_after"), {**film.assets, "marker_after": marker_after})
    assert revision_after != revision_r

    settled = host.run(once=True)

    assert len(settled) == 1
    task = film.task(task_id)
    assert task["state"] in ("completed", "succeeded"), task
    authority = task["spec"]["spec"]["inputs"]["timeline_authority"]
    assert authority["parent_revision_id"] == revision_r
    selection = task["result"]["renderer_selection"]
    assert selection["selector"] == "rendering.ffmpeg" and selection["chosen_by"] == "host"
    assert selection["remotion_ok"] is False and "ASTRID_REMOTION_PROJECT_DIR" in selection["remotion_reason"]
    videos = [item for item in task["result"]["outputs"] if str(item.get("media_type", "")).startswith("video")]
    status, content = film.request("GET", f"/v1/objects/{videos[0]['digest']}")
    assert status == 200 and isinstance(content, bytes)
    video = tmp_path / "render.mp4"
    video.write_bytes(content)
    assert _streams(video) == {("video", "h264"), ("audio", "aac")}
    # The film carries a complete colour description. With only the matrix tagged, Chrome decodes an HD film as BT.709 and
    # every saturated colour of a BT.601 source shifts (green 255 -> 217): the preview and the film then disagree.
    assert _colour(video) == {"color_space": "bt709", "color_primaries": "bt709", "color_transfer": "bt709", "color_range": "tv"}
    assert _mean_volume(video) > -60  # the tone is audible, not silence
    for at in ("0.5", "1.5"):
        frame = _frame(video, at)
        assert _distance(frame, R_COLOUR) < _distance(frame, R1_COLOUR), (at, frame)


def test_a_task_selecting_remotion_is_admitted_and_then_fails_with_the_remotion_reason(world):
    film, host = world
    film.publish(film.media_clips(), film.assets)
    task_id = film.admit("rendering.remotion")  # admitted: the capability is ready

    with pytest.raises(HostError, match="rendering.remotion, which this host cannot run"):
        host.run(once=True)

    task = film.task(task_id)
    assert task["state"] == "failed"
    error = json.dumps(task.get("error") or task)
    assert "rendering.remotion" in error and "ASTRID_REMOTION_PROJECT_DIR" in error
    assert not (task.get("result") or {}).get("outputs")


def test_a_timeline_ffmpeg_refuses_fails_with_ffmpegs_reasons_and_the_remotion_fault(world):
    film, host = world
    # A timeline outside ffmpeg's envelope (a crossfade between the two pictures) still needs Remotion.
    crossfade = {"kind": "cross-fade", "right_clip_id": "v", "duration_seconds": 0.5}
    film.publish(film.media_clips(transition=crossfade), film.assets)
    task_id = film.admit()

    with pytest.raises(HostError):
        host.run(once=True)

    task = film.task(task_id)
    assert task["state"] == "failed"
    error = json.dumps(task.get("error") or task)
    assert "rendering.ffmpeg does not support this render request" in error
    assert "uses an unsupported transition" in error
    assert "rendering.remotion is unavailable on this host" in error and "ASTRID_REMOTION_PROJECT_DIR" in error
    assert not (task.get("result") or {}).get("outputs")


def test_a_timeline_with_a_render_tail_fails_with_ffmpegs_reason_and_the_remotion_fault(world):
    film, host = world
    # Remotion renders past the authored end into the declared tail. ffmpeg would end at the authored 4 s and give a
    # shorter film, so it refuses, and a host that cannot run Remotion has nobody to render it.
    tail = {"authored_duration_frames": 120, "render_duration_frames": 150,
            "tail": {"policy": "unmapped_excess_rendered_region", "source_asset": "video", "start_frame": 120,
                     "end_frame": 150, "source_start_frame": 120, "source_end_frame": 150}}
    film.publish(film.media_clips(), film.assets, app={"astrid_render_clock": tail})
    task_id = film.admit()

    with pytest.raises(HostError):
        host.run(once=True)

    task = film.task(task_id)
    assert task["state"] == "failed"
    error = json.dumps(task.get("error") or task)
    assert "rendering.ffmpeg does not support this render request" in error
    assert "app.astrid_render_clock" in error
    assert "rendering.remotion is unavailable on this host" in error and "ASTRID_REMOTION_PROJECT_DIR" in error
    assert not (task.get("result") or {}).get("outputs")
