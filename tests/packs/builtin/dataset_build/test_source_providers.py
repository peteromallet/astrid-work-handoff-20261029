from __future__ import annotations

import copy
import hashlib
import json
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from astrid.packs.training.actions.dataset_build.source_providers import get_source_provider, iter_source_candidates
from astrid.packs.training.actions.dataset_build.source_providers.local_folder import LocalFolderSourceProvider
from astrid.packs.training.actions.dataset_build.source_providers.youtube import YouTubeSourceProvider, youtube_source_key
from tests.fixtures.dataset_build_child_invoker import install_child_invoker, make_child_meter


def _probe(path: Path) -> dict[str, Any]:
    return {
        "duration_s": 4.0,
        "resolution": {"width": 128, "height": 128},
        "fps": 24.0,
        "codec": "h264",
        "file_size_bytes": path.stat().st_size if path.exists() else 0,
    }


def test_local_folder_provider_creates_hashed_probed_candidates_without_network(tmp_path: Path) -> None:
    first = tmp_path / "first.mp4"
    second = tmp_path / "second.mov"
    ignored = tmp_path / "ignored.txt"
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    ignored.write_text("nope", encoding="utf-8")

    provider = LocalFolderSourceProvider(prober=_probe)
    candidates = list(provider.acquire({"path": str(tmp_path), "recursive": False, "rights": {"rights_status": "verified"}}))

    assert [item["media_path"] for item in candidates] == [str(first.resolve()), str(second.resolve())]
    assert all(item["source_type"] == "local_folder" for item in candidates)
    assert all(item["content_hash"] for item in candidates)
    assert all(item["source_metadata"]["resolution"] == {"width": 128, "height": 128} for item in candidates)
    assert all(item["rights"]["rights_status"] == "verified" for item in candidates)


def test_local_folder_provider_honors_acquisition_request_exclusions_and_limit(tmp_path: Path) -> None:
    first = tmp_path / "first.mp4"
    second = tmp_path / "second.mp4"
    third = tmp_path / "third.mp4"
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    third.write_bytes(b"third")

    provider = LocalFolderSourceProvider(prober=_probe)
    candidates = list(
        provider.acquire(
            {
                "path": str(tmp_path),
                "source_id_template": "{stem}",
                "acquisition_request": {
                    "exclude_source_ids": ["first"],
                    "limit_hint": 1,
                },
            }
        )
    )

    assert [candidate["source_id"] for candidate in candidates] == ["second"]
    assert provider.last_acquisition_result["yielded"] == 1
    assert provider.last_acquisition_result["no_new_candidates"] is False


def test_local_folder_provider_reports_no_new_candidates_for_processed_sources(tmp_path: Path) -> None:
    first = tmp_path / "first.mp4"
    first.write_bytes(b"first")
    provider = LocalFolderSourceProvider(prober=_probe)
    config = {
        "path": str(tmp_path),
        "source_id_template": "{stem}",
        "acquisition_request": {"processed_source_ids": ["first"]},
    }

    candidates = list(provider.acquire(config))

    assert candidates == []
    assert config["acquisition_result"]["no_new_candidates"] is True
    assert config["acquisition_result"]["skipped_processed"] == 1
    assert provider.last_acquisition_result["reason"] == "no_new_candidates"


def test_source_provider_registry_dispatches_config_sources(tmp_path: Path) -> None:
    media = tmp_path / "clip.mp4"
    media.write_bytes(b"clip")
    config = {"sources": [{"provider": "local_folder", "config": {"path": str(tmp_path)}}]}

    assert isinstance(get_source_provider("local_folder", prober=_probe), LocalFolderSourceProvider)
    candidates = list(iter_source_candidates(config, prober=_probe))
    assert len(candidates) == 1
    assert candidates[0]["source_id"].startswith("local_")


@dataclass(frozen=True)
class _YouTubeOutput:
    output: dict[str, Any]
    filename: str

    def producer_file(self) -> dict[str, str]:
        return {
            "filename": self.filename,
            "media_type": str(self.output["media_type"]),
            "output_port": str(self.output["output_port"]),
        }


@dataclass(frozen=True)
class _YouTubeChild:
    ok: bool
    raw_result: dict[str, Any]
    kernel_task_id: str
    kernel_attempt_id: str
    kernel_run_id: str
    outputs: dict[str, Any]
    error: Any
    _local: dict[str, _YouTubeOutput]

    def materialize_output(self, association_id: str) -> _YouTubeOutput:
        return self._local[association_id]


class _YouTubeChildHost:
    """Host bridge for the YouTube provider's delegated download and scene children.

    ``youtube.youtube_audio`` completes with a binary ``media`` output and
    ``editorial.scenes`` with a JSON ``scenes`` output. Each output is written under
    ``root`` with the size, digest and identities the provider verifies on
    materialization, so the product's own checks run against real bytes.
    """

    def __init__(self, root: Path, *, scenes: list[dict[str, float]]) -> None:
        self._root = root.resolve()
        self._scenes = scenes
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self,
        capability: str,
        *,
        kind: str,
        inputs: Mapping[str, Any],
        child_key: str,
        wait: bool,
        timeout_seconds: float,
        poll_seconds: float,
    ) -> _YouTubeChild:
        assert kind == "action"
        assert wait is True
        index = len(self.calls)
        self.calls.append(
            {"capability": capability, "inputs": copy.deepcopy(dict(inputs)), "child_key": child_key}
        )
        if capability == "youtube.youtube_audio":
            port, media_type, body = "media", "video/mp4", b"video"
        elif capability == "editorial.scenes":
            port, media_type = "scenes", "application/json"
            body = json.dumps(self._scenes).encode("utf-8")
        else:
            raise AssertionError(f"unexpected delegated capability: {capability}")
        filename = f"children/{index}/{port}"
        (self._root / filename).parent.mkdir(parents=True, exist_ok=True)
        (self._root / filename).write_bytes(body)
        digest = "sha256:" + hashlib.sha256(body).hexdigest()
        row = {
            "output_port": port,
            "task_id": f"task-{index}",
            "attempt_id": f"attempt-{index}",
            "run_id": f"run-{index}",
            "size": len(body),
            "digest": digest,
            "object_id": digest,
            "association_id": f"assoc-{index}",
            "media_type": media_type,
        }
        return _YouTubeChild(
            ok=True,
            raw_result={"state": "completed"},
            kernel_task_id=row["task_id"],
            kernel_attempt_id=row["attempt_id"],
            kernel_run_id=row["run_id"],
            outputs={"managed_outputs": [row]},
            error=None,
            _local={row["association_id"]: _YouTubeOutput(output=row, filename=filename)},
        )


def _install_youtube_host(
    monkeypatch: pytest.MonkeyPatch, root: Path, *, scenes: list[dict[str, float]]
) -> _YouTubeChildHost:
    host = _YouTubeChildHost(root, scenes=scenes)
    install_child_invoker(monkeypatch, host)
    return host


def _youtube_provider(runner: Any, root: Path) -> YouTubeSourceProvider:
    return YouTubeSourceProvider(
        runner=runner,
        prober=_probe,
        child_work_meter=make_child_meter(),
        materialization_root=root,
    )


def test_youtube_provider_delegates_download_scene_split_and_internal_clip_extract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "materialized"
    host = _install_youtube_host(
        monkeypatch,
        root,
        scenes=[{"start": 0.0, "end": 1.0}, {"start": 1.0, "end": 4.0}, {"start": 4.0, "end": 20.0}],
    )
    calls: list[list[str]] = []

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        if cmd and cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"clip")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    provider = _youtube_provider(runner, root)
    candidates = list(
        provider.acquire(
            {
                "out_dir": str(tmp_path / "yt"),
                "source_urls": ["https://youtube.example/watch?v=1"],
                "dataset_config": {"clip_config": {"min_duration_s": 2.0, "max_duration_s": 5.0}},
            }
        )
    )

    assert len(candidates) == 1
    assert candidates[0]["source_type"] == "youtube"
    assert candidates[0]["duration_s"] == 3.0
    assert candidates[0]["clip_start_s"] == 1.0
    assert candidates[0]["clip_end_s"] == 4.0
    assert [call["capability"] for call in host.calls] == ["youtube.youtube_audio", "editorial.scenes"]
    assert host.calls[0]["inputs"] == {"query": "https://youtube.example/watch?v=1", "mode": "video"}
    assert host.calls[1]["inputs"]["video"]["output_port"] == "media"
    assert not any("astrid.packs.youtube.executors.youtube_audio.run" in cmd for cmd in calls)
    assert not any("astrid.packs.editorial.actions.scenes.run" in cmd for cmd in calls)
    assert any(cmd and cmd[0] == "ffmpeg" for cmd in calls)
    assert not any(cmd and cmd[0] == "yt-dlp" for cmd in calls)


def test_youtube_provider_uses_bucket_search_queries_from_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "materialized"
    host = _install_youtube_host(monkeypatch, root, scenes=[{"start": 0.0, "end": 3.0}])
    calls: list[list[str]] = []

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        if cmd and cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"clip")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    provider = _youtube_provider(runner, root)
    candidates = list(
        provider.acquire(
            {
                "out_dir": str(tmp_path / "yt"),
                "dataset_config": {
                    "buckets": {
                        "a": {"target_count": 1, "search_queries": ["query from bucket"]},
                    },
                    "clip_config": {"min_duration_s": 1.0, "max_duration_s": 5.0},
                },
            }
        )
    )

    assert len(candidates) == 1
    assert host.calls[0]["capability"] == "youtube.youtube_audio"
    assert host.calls[0]["inputs"] == {"query": "query from bucket", "mode": "video"}


def test_youtube_provider_skips_processed_source_before_download(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "materialized"
    host = _install_youtube_host(monkeypatch, root, scenes=[])
    calls: list[list[str]] = []
    source = {"kind": "url", "value": "https://youtube.example/watch?v=already"}

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        raise AssertionError("processed YouTube source should skip before download")

    provider = _youtube_provider(runner, root)
    candidates = list(
        provider.acquire(
            {
                "out_dir": str(tmp_path / "yt"),
                "source_urls": [source["value"]],
                "processed_source_ids": [youtube_source_key(source)],
            }
        )
    )

    assert candidates == []
    assert calls == []
    assert host.calls == []


def test_youtube_provider_honors_acquisition_request_exclusions_before_download(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "materialized"
    host = _install_youtube_host(monkeypatch, root, scenes=[])
    calls: list[list[str]] = []
    source = {"kind": "url", "value": "https://youtube.example/watch?v=topup-skip"}

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        raise AssertionError("excluded YouTube source should skip before download")

    provider = _youtube_provider(runner, root)
    candidates = list(
        provider.acquire(
            {
                "out_dir": str(tmp_path / "yt"),
                "source_urls": [source["value"]],
                "acquisition_request": {"exclude_source_ids": [youtube_source_key(source)]},
            }
        )
    )

    assert candidates == []
    assert calls == []
    assert host.calls == []
    assert provider.last_acquisition_result["no_new_candidates"] is True
    assert provider.last_acquisition_result["skipped_excluded"] == 1


def test_youtube_provider_reports_no_new_candidates_for_processed_source_keys(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "materialized"
    host = _install_youtube_host(monkeypatch, root, scenes=[])
    calls: list[list[str]] = []
    source = {"kind": "query", "value": "already handled"}

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        raise AssertionError("processed source key should skip before download")

    provider = _youtube_provider(runner, root)
    config = {
        "out_dir": str(tmp_path / "yt"),
        "search_queries": [source["value"]],
        "acquisition_request": {"processed_source_ids": [youtube_source_key(source)]},
    }

    candidates = list(provider.acquire(config))

    assert candidates == []
    assert calls == []
    assert host.calls == []
    assert config["acquisition_result"]["no_new_candidates"] is True
    assert config["acquisition_result"]["skipped_processed"] == 1
