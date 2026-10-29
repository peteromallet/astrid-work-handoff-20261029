"""Overlapping lines keep the deeper speech requirement for its full lifetime."""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
import pytest

from astrid.packs.music.actions.duck._audio import load_audio
from astrid.packs.music.actions.duck.core import Placement, duck_audio

pytestmark = pytest.mark.integration  # real ffmpeg decoding and loudness measurement


def test_short_louder_overlap_preserves_the_long_quiet_line(tmp_path: Path) -> None:
    rate = 48000
    t = np.arange(20 * rate) / rate
    samples = np.rint(.1 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    source = tmp_path / "steady.wav"
    with wave.open(str(source), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(samples.tobytes())

    music = Placement(source, start=0, duration=20, id="music")
    quiet = Placement(source, start=2, duration=12, id="long-quiet")
    loud = Placement(source, start=6, duration=2, volume=2., id="short-loud")
    output = tmp_path / "overlap.wav"
    result = duck_audio(music, [quiet, loud], output)

    # The identical voice and bed require -8 dB throughout the long line,
    # including the overlap and the six seconds after the shorter line ends.
    active = (result.times >= 2.02) & (result.times < 13.98)
    np.testing.assert_allclose(result.target_db[active], -8, atol=.05)

    original = load_audio(source).samples[:, 0]
    emitted = load_audio(output).samples[:, 0]
    for center in (3., 6.5, 9., 13.):
        lo, hi = round((center - .2) * rate), round((center + .2) * rate)
        attenuation = 10 * np.log10(np.mean(original[lo:hi] ** 2) / np.mean(emitted[lo:hi] ** 2))
        assert attenuation == pytest.approx(8, abs=.05)
