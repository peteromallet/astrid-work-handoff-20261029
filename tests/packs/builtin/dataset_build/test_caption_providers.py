from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from astrid.packs.training.actions.dataset_build.caption_providers import (
    BudgetTracker,
    VideoUnderstandCaptionProvider,
    VisualUnderstandCaptionProvider,
    caption_candidate,
    caption_sidecar_path,
    get_caption_provider,
)
from tests.fixtures.dataset_build_child_invoker import (
    FakeChildInvoker,
    install_child_invoker,
    make_child_meter,
)


def _candidate(tmp_path: Path) -> dict[str, Any]:
    media = tmp_path / "clip.mp4"
    media.write_bytes(b"video")
    return {
        "source_type": "local_folder",
        "source_id": "clip-001",
        "source_url": media.as_uri(),
        "content_hash": "hash",
        "acquired_at": "2026-05-21T00:00:00Z",
        "media_type": "video",
        "media_path": str(media),
        "duration_s": 6.0,
        "clip_start_s": 1.0,
        "clip_end_s": 7.0,
        "scene_index": 0,
        "bucket": "bucket-a",
    }


def test_caption_provider_registry_exposes_understanding_wrappers() -> None:
    assert isinstance(get_caption_provider("visual_understand"), VisualUnderstandCaptionProvider)
    assert isinstance(get_caption_provider("video_understand"), VideoUnderstandCaptionProvider)
    with pytest.raises(ValueError, match="unknown caption provider"):
        get_caption_provider("bucket_judge")


def test_fixture_mode_uses_prebaked_sidecar_without_runner_or_budget(tmp_path: Path) -> None:
    item = _candidate(tmp_path)
    fixture_dir = tmp_path / "fixtures"
    fixture_dir.mkdir()
    (fixture_dir / "clip-001.caption.json").write_text(
        json.dumps(
            {
                "text": "Prebaked fixture caption.",
                "schema_version": 1,
                "confidence": 0.98,
                "model": "fixture",
            }
        ),
        encoding="utf-8",
    )
    tracker = BudgetTracker(max_api_calls=0)

    def runner(*_: Any, **__: Any) -> subprocess.CompletedProcess[str]:
        raise AssertionError("fixture captioning must not call model runners")

    provider = VisualUnderstandCaptionProvider(runner=runner)
    result = provider.caption(
        item,
        {
            "fixture_mode": True,
            "fixture_caption_dir": str(fixture_dir),
            "out_dir": str(tmp_path / "captions"),
            "budget_tracker": tracker,
        },
    )

    sidecar = tmp_path / "captions" / "clip-001.caption.json"
    assert result.text == "Prebaked fixture caption."
    assert result.confidence == 0.98
    assert tracker.total_api_calls == 0
    assert json.loads(sidecar.read_text(encoding="utf-8"))["text"] == "Prebaked fixture caption."


def test_fixture_mode_falls_back_to_deterministic_caption_sidecar(tmp_path: Path) -> None:
    item = _candidate(tmp_path)
    result, sidecar = caption_candidate(
        item,
        {"provider": "visual_understand", "fixture_mode": True, "out_dir": str(tmp_path / "captions")},
    )

    assert result.text == "Fixture caption for clip-001."
    assert json.loads(sidecar.read_text(encoding="utf-8")) == {
        "confidence": 1.0,
        "model": "fixture",
        "raw_response": {"fixture": True},
        "schema_version": 1,
        "text": "Fixture caption for clip-001.",
    }


def _delegated(config: dict[str, Any], tmp_path: Path) -> dict[str, Any]:
    """Understanding captions run as delegated children under a run-scoped meter."""
    return {**config, "child_work_meter": make_child_meter(), "attempt_output_root": str(tmp_path)}


def test_visual_understand_wrapper_writes_sidecar_and_tracks_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = _candidate(tmp_path)
    schema_path = tmp_path / "caption.schema.json"
    schema_path.write_text("{}", encoding="utf-8")
    invoker = FakeChildInvoker(
        lambda capability, inputs: {
            "results": [{"model": "gpt-test", "status": "ok", "answer": "A concise visual caption."}]
        },
        attempt_root=tmp_path,
    )
    install_child_invoker(monkeypatch, invoker)
    tracker = BudgetTracker(max_api_calls=2, provider_limits={"caption.visual_understand": 1})

    result = VisualUnderstandCaptionProvider().caption(
        item,
        _delegated(
            {
                "prompt_template": "Describe {clip_id} from {bucket}.",
                "schema_path": str(schema_path),
                "out_dir": str(tmp_path / "captions"),
                "budget_tracker": tracker,
            },
            tmp_path,
        ),
    )

    sidecar = tmp_path / "captions" / "clip-001.caption.json"
    assert result.text == "A concise visual caption."
    assert tracker.as_dict()["provider_calls"] == {"caption.visual_understand": 1}
    assert json.loads(sidecar.read_text(encoding="utf-8"))["model"] == "gpt-test"
    assert len(invoker.calls) == 1
    call = invoker.calls[0]
    assert call["capability"] == "understanding.visual_understand"
    assert call["inputs"]["query"] == "Describe clip-001 from bucket-a."
    assert call["inputs"]["at"] == "3.000"
    assert call["inputs"]["video"]["media_type"] == "video/mp4"
    assert call["inputs"]["response_schema"]["media_type"] == "application/json"
    staged_schema = tmp_path / call["inputs"]["response_schema"]["filename"]
    assert staged_schema.read_text(encoding="utf-8") == "{}"
    sidecar_payload = json.loads(sidecar.read_text(encoding="utf-8"))
    assert sidecar_payload["hashes"]["prompt_hash"]
    assert sidecar_payload["hashes"]["media_hash"] == item["content_hash"]


def test_visual_understand_wrapper_reuses_only_matching_hashed_sidecar(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = _candidate(tmp_path)
    invoker = FakeChildInvoker(
        lambda capability, inputs: {"text": "Fresh caption.", "model": "gpt-test"},
        attempt_root=tmp_path,
    )
    install_child_invoker(monkeypatch, invoker)
    provider = VisualUnderstandCaptionProvider()
    config = _delegated(
        {
            "provider": "visual_understand",
            "prompt_template": "Describe {clip_id}.",
            "out_dir": str(tmp_path / "captions"),
            "budget_tracker": BudgetTracker(max_api_calls=2),
        },
        tmp_path,
    )

    first = provider.caption(item, config)
    second = provider.caption(item, config)
    changed = provider.caption(item, {**config, "prompt_template": "Changed {clip_id}."})

    assert first.text == "Fresh caption."
    assert second.text == "Fresh caption."
    assert changed.text == "Fresh caption."
    assert len(invoker.calls) == 2


def test_visual_understand_wrapper_rejects_unhashed_production_sidecar(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = _candidate(tmp_path)
    sidecar = tmp_path / "captions" / "clip-001.caption.json"
    sidecar.parent.mkdir()
    sidecar.write_text(json.dumps({"text": "Stale raw caption.", "model": "fixture"}), encoding="utf-8")
    invoker = FakeChildInvoker(
        lambda capability, inputs: {"text": "Fresh production caption.", "model": "gpt-test"},
        attempt_root=tmp_path,
    )
    install_child_invoker(monkeypatch, invoker)

    result = VisualUnderstandCaptionProvider().caption(
        item,
        _delegated({"prompt_template": "Describe {clip_id}.", "out_dir": str(tmp_path / "captions")}, tmp_path),
    )

    payload = json.loads(sidecar.read_text(encoding="utf-8"))
    assert result.text == "Fresh production caption."
    assert len(invoker.calls) == 1
    assert payload["text"] == "Fresh production caption."
    assert payload["hashes"]["prompt_hash"]


def test_video_understand_wrapper_uses_video_runner_and_stays_bucket_judge_independent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = _candidate(tmp_path)
    invoker = FakeChildInvoker(
        lambda capability, inputs: {
            "results": [
                {
                    "model": "gemini-test",
                    "status": "ok",
                    "answer": {"summary": "A synchronized audio-video caption.", "highlight_score": 7},
                }
            ]
        },
        attempt_root=tmp_path,
    )
    install_child_invoker(monkeypatch, invoker)
    tracker = BudgetTracker(max_api_calls=3)

    def runner(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise AssertionError("delegated video captioning must not spawn the model runner")

    result, sidecar = caption_candidate(
        item,
        _delegated(
            {
                "provider": "video_understand",
                "prompt_template": "Caption only.",
                "out_dir": str(tmp_path / "captions"),
                "budget_tracker": tracker,
                "extensions": {"bucket_judge": {"enabled": True, "provider": "visual_understand"}},
            },
            tmp_path,
        ),
        runner=runner,
    )

    call = invoker.calls[0]
    assert result.text == "A synchronized audio-video caption."
    assert call["capability"] == "understanding.video_understand"
    assert call["inputs"]["start"] == "1.000"
    assert call["inputs"]["end"] == "7.000"
    assert "bucket_judge" not in json.dumps(call["inputs"])
    assert tracker.provider_calls == {"caption.video_understand": 1}
    assert caption_sidecar_path(item, {"out_dir": str(tmp_path / "captions")}) == sidecar


def test_budget_tracker_rejects_caption_calls_over_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = _candidate(tmp_path)
    tracker = BudgetTracker(max_api_calls=0)

    def respond(capability: str, inputs: Any) -> Any:
        raise AssertionError("budget failure must happen before child invocation")

    invoker = FakeChildInvoker(respond, attempt_root=tmp_path)
    install_child_invoker(monkeypatch, invoker)

    provider = VideoUnderstandCaptionProvider()
    with pytest.raises(RuntimeError, match="API budget exceeded"):
        provider.caption(
            item,
            _delegated({"out_dir": str(tmp_path / "captions"), "budget_tracker": tracker}, tmp_path),
        )
    assert invoker.calls == []


def test_budget_tracker_reexport_tracks_provider_limits_and_observed_calls() -> None:
    tracker = BudgetTracker(max_api_calls=2, provider_limits={"caption.visual_understand": 1})

    tracker.increment("caption.visual_understand")

    assert tracker.as_dict()["observed_calls_by_provider"] == {"caption.visual_understand": 1}
    with pytest.raises(RuntimeError, match="caption.visual_understand"):
        tracker.increment("caption.visual_understand")



def test_budget_tracker_enforces_rate_limit_with_injected_clock_sleep() -> None:
    now = 100.0
    sleeps: list[float] = []

    def clock() -> float:
        return now

    def sleep(duration: float) -> None:
        nonlocal now
        sleeps.append(duration)
        now += duration

    tracker = BudgetTracker.from_config(
        {
            "budgets": {
                "max_api_calls": 2,
                "providers": {"caption.visual_understand": {"rate_limit_per_minute": 60}},
            }
        },
        clock=clock,
        sleep=sleep,
    )

    tracker.increment("caption.visual_understand")
    tracker.increment("caption.visual_understand")

    assert sleeps == [1.0]
    assert tracker.as_dict()["provider_rate_limits"] == {"caption.visual_understand": 60}

