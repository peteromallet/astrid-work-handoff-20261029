from __future__ import annotations

import pytest

from astrid.sdk import generation
from astrid.sdk.exceptions import CapabilityValidationError


def test_tts_inputs_map_prompt_alias_to_speech():
    assert generation._speech_inputs_from_audio_request({
        "prompt": "Exact words.",
        "voice": "en-GB-RyanNeural",
        "rate": "+5%",
        "provider": "edge-tts",
    }) == {
        "text": "Exact words.",
        "voice": "en-GB-RyanNeural",
        "rate": "+5%",
        "provider": "edge-tts",
    }


def test_tts_rejects_music_only_inputs():
    with pytest.raises(CapabilityValidationError, match="unsupported input"):
        generation._speech_inputs_from_audio_request({"text": "Hi.", "count": 2})


def test_tts_rejects_conflicting_text_and_prompt():
    with pytest.raises(CapabilityValidationError, match="conflicting"):
        generation._speech_inputs_from_audio_request({"text": "A.", "prompt": "B."})


def test_typed_audio_facade_routes_tts_without_music_registry(monkeypatch):
    calls: list[tuple[str, dict]] = []

    def fake_invoke(self, capability_id, **kwargs):
        calls.append((capability_id, kwargs))
        return {"ok": True}

    monkeypatch.setattr(generation.GenerationFacade, "_invoke", fake_invoke)
    monkeypatch.setattr(
        generation,
        "_resolve_invoke_destination",
        lambda **kwargs: (None, "demo"),
    )
    monkeypatch.setattr(generation, "_reconstruct_generation_result", lambda value: value)

    result = generation.GenerationFacade().audio(
        model="ignored-for-tts",
        mode="tts",
        prompt="The exact authored words.",
        project="demo",
    )

    assert result == {"ok": True}
    assert calls[0][0] == "generation.generate_speech"
    assert calls[0][1]["inputs"] == {"text": "The exact authored words."}
