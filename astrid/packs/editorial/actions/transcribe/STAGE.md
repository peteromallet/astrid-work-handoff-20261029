# Transcribe

**Action**: `editorial.transcribe`  
**Status**: implemented  
**Pipeline step**: 0 (entry point)

Transcribes source audio into a structured `transcript.json` file using
OpenAI's Whisper model. The action handles audio extraction from video
sources, silence-aware chunking, and optional speaker diarization via
pyannote.audio. Whisper is requested at segment timestamp granularity, so
the stock output does not include word-level timestamps. If the transcription
source supplies segment IDs or word data, the action preserves those fields
and offsets word times into source-media seconds.

Requires an OpenAI API key (resolved via the candidate-env-file walk in
`astrid/core/util/secrets.py`). Whisper is called through the OpenAI API;
no local model installation is required.

## SDK quick-start

```python
import astrid.sdk as sdk
result = sdk.invoke(
    "editorial.transcribe",
    kind="action",
    project="demo",
    inputs={"audio": "./source.mp3"},
)
```

With an explicit env file for API credentials:

```python
import astrid.sdk as sdk
result = sdk.invoke(
    "editorial.transcribe",
    kind="action",
    project="demo",
    inputs={"audio": "./source.mp3", "env_file": ".env.local"},
)
```

## Inputs

| Name     | Type | Required | Description                              |
|----------|------|----------|------------------------------------------|
| audio    | file | yes      | Audio or video-derived audio to transcribe |
| env_file | file | no       | Optional environment file for API credentials |
| asset_id | string | no | App media asset ID to include as `assetId` in the transcript handoff |

## Outputs

| Name       | Type | Path                      | Description              |
|------------|------|---------------------------|--------------------------|
| transcript | file | `{out}/transcript.json`   | Structured transcript JSON; with `asset_id`, also an app-importable `assetId` association |
| subtitle   | file | `{out}/transcript.srt`    | Timestamped SRT subtitles |
| transcript_text | file | `{out}/transcript.txt` | Plain-text transcript |
| chunk_plan | file | `{out}/cache/chunks.json` | Silence-aware chunk metadata |
| manifest   | file | `{out}/manifest.json`     | Universal result manifest |

## Pipeline position

Step 0 of the editorial pipeline. No upstream dependencies — transcribe is the
entry point. It provides `transcript` to all downstream stages.

## App transcript handoff

When the app already has a media asset ID, pass that exact ID as `asset_id`
to `editorial.transcribe` (or `--asset-id` on the action CLI). The normal
`transcript.json` output then has this form and can be selected by the app
transcript importer:

```json
{"assetId":"app-media-id","segments":[...]}
```

Without this input, the transcript keeps its existing `{ "segments": [...] }`
shape. The handoff retains segment timestamps in source-media seconds and does
not invent segment IDs or word timing; app-side normalization supplies missing
logical IDs.

## Depends on

None (entry-point action).
