from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.packs.editorial.actions.transcribe import run as transcribe


def test_transcribe_route_writes_asset_associated_app_import_document(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A producer response flows through chunk normalization into the app handoff."""
    audio_path = tmp_path / "source.wav"
    audio_path.write_bytes(b"source fixture")
    chunk_path = tmp_path / "chunk.wav"
    chunk_path.write_bytes(b"chunk fixture")
    metadata_path = tmp_path / "chunks.json"
    metadata_path.write_text("{}", encoding="utf-8")
    chunk = {
        "path": str(chunk_path),
        "offset_sec": 12.0,
        "start_sec": 12.0,
        "end_sec": 20.0,
        "duration_sec": 8.0,
    }

    # Whisper's usual response contains segment timestamps and text. Extra
    # fields exercise preservation for sources that provide richer data.
    response = {
        "segments": [
            {
                "id": "segment-from-source",
                "start": 1.25,
                "end": 2.5,
                "text": " Hello world ",
                "speaker": "Speaker A",
                "words": [
                    {"id": "word-1", "start": 1.3, "end": 1.7, "text": "Hello"},
                    {"id": "word-2", "start": 1.8, "end": 2.2, "word": "world"},
                ],
            }
        ]
    }

    class FakeTranscriptions:
        def create(self, **_kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(model_dump=lambda: response)

    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=FakeTranscriptions()))
    monkeypatch.setattr(
        transcribe,
        "prepare_chunks",
        lambda *_args: ([chunk], [], metadata_path),
    )
    monkeypatch.setattr(transcribe, "diarize_audio", lambda *_args: None)
    monkeypatch.setattr(transcribe, "require_runtime_materialized_file", lambda path, **_kwargs: Path(path))
    monkeypatch.setattr(transcribe, "load_api_key", lambda _env_file: "test-key")
    monkeypatch.setattr(transcribe.AuditContext, "from_env", classmethod(lambda _cls: None))
    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=lambda **_kwargs: client))

    out_dir = tmp_path / "out"
    assert transcribe.main(
        ["--audio", str(audio_path), "--out", str(out_dir), "--asset-id", "app-media-42"]
    ) == 0
    transcript_path = out_dir / "transcript.json"
    document = json.loads(transcript_path.read_text(encoding="utf-8"))
    assert transcript_path.is_file()
    assert document["assetId"] == "app-media-42"
    assert "sourceId" not in document
    assert document["segments"] == [
        {
            "id": "segment-from-source",
            "start": 13.25,
            "end": 14.5,
            "text": "Hello world",
            "speaker": "Speaker A",
            "words": [
                {"id": "word-1", "start": 13.3, "end": 13.7, "text": "Hello"},
                {"id": "word-2", "start": 13.8, "end": 14.2, "word": "world"},
            ],
        }
    ]

    # The same CLI route without an app association keeps its legacy output.
    legacy_out = tmp_path / "legacy-out"
    assert transcribe.main(["--audio", str(audio_path), "--out", str(legacy_out)]) == 0
    legacy_document = json.loads((legacy_out / "transcript.json").read_text(encoding="utf-8"))
    assert legacy_document == {"segments": document["segments"]}


def test_transcribe_output_without_asset_id_keeps_legacy_shape(tmp_path: Path) -> None:
    paths = transcribe.write_transcripts(tmp_path, [{"start": 0, "end": 1, "text": "hello"}])
    assert json.loads(paths["json"].read_text(encoding="utf-8")) == {
        "segments": [{"start": 0, "end": 1, "text": "hello"}]
    }


def test_transcribe_rejects_blank_asset_id(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="non-empty app media asset ID"):
        transcribe.write_transcripts(
            tmp_path,
            [{"start": 0, "end": 1, "text": "hello"}],
            asset_id="  ",
        )


def test_transcribe_cli_rejects_blank_asset_id_before_running(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        transcribe.build_parser().parse_args(
            ["--audio", str(tmp_path / "source.wav"), "--asset-id", "   "]
        )


def test_transcribe_cli_accepts_and_trims_app_asset_id(tmp_path: Path) -> None:
    args = transcribe.build_parser().parse_args(
        ["--audio", str(tmp_path / "source.wav"), "--asset-id", " app-media-42 "]
    )
    assert args.asset_id == "app-media-42"


def test_whisper_shared_document_uses_source_seconds_and_stable_ids(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from astrid.sdk import AstridClient
    from astrid.sdk import media_transcript

    audio = tmp_path / "source.wav"
    audio.write_bytes(b"source fixture")
    output = tmp_path / "transcript.json"
    output.write_text(json.dumps({"segments": [{"start": 13.25, "end": 14.5, "text": "Hello world",
                                               "words": [{"start": 13.3, "end": 13.7, "text": "Hello"}]}]}))
    captured = []

    class Context:
        def __enter__(self):
            return object()

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(AstridClient, "open_from_launcher", classmethod(lambda cls, **_kwargs: Context()))
    monkeypatch.setattr(media_transcript, "write_transcript", lambda client, project, media, source, content: (
        captured.append((project, media, source, content)) or "created"))
    transcribe._register_runtime_transcript(audio, output, "demo")
    project, media, source, content = captured[0]
    assert project == "demo" and source == "whisper" and media.startswith("sha256:")
    assert content["segments"] == [{"id": "whisper:s00000", "start": 13.25, "end": 14.5,
                                    "text": "Hello world", "words": [{"id": "whisper:s00000:w00000",
                                                                    "start": 13.3, "end": 13.7, "text": "Hello"}]}]
