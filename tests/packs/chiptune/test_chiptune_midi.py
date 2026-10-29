"""chiptune.midi: a Standard MIDI File played by the NES voices (pulse 1 melody, pulse 2 arpeggio, triangle bass)."""
from __future__ import annotations

import json
import os
import struct
import wave
from pathlib import Path

import numpy as np
import pytest

os.environ.setdefault("ASTRID_INTERNAL_INVOCATION", "1")

from astrid.core.contracts.errors import AstridError  # noqa: E402
from astrid.packs.chiptune.actions import _midi  # noqa: E402
from astrid.packs.chiptune.actions import _synth as syn  # noqa: E402
from astrid.packs.chiptune.actions.midi import run  # noqa: E402

DIV = 480


def _vlq(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append(0x80 | (value & 0x7F))
        value >>= 7
    return bytes(reversed(out))


def _track(events: list[tuple[int, bytes]]) -> bytes:
    body, last = b"", 0
    for tick, raw in sorted(events, key=lambda e: e[0]):
        body += _vlq(tick - last) + raw
        last = tick
    body += _vlq(0) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(body)) + body


def smf(note_tracks: list[list[tuple[int, int, int, int]]], tempos=((0, 500_000),), running_status=False) -> bytes:
    """Format 1: a tempo track, then one track per list of (on_tick, off_tick, pitch, velocity)."""
    tempo = _track([(t, b"\xff\x51\x03" + us.to_bytes(3, "big")) for t, us in tempos])
    tracks = [tempo]
    for notes in note_tracks:
        events = []
        for on, off, pitch, vel in notes:
            events.append((on, bytes([0x90, pitch, vel])))
            # note-off as note-on with velocity 0 (running status when asked)
            events.append((off, bytes([pitch, 0]) if running_status else bytes([0x90, pitch, 0])))
        tracks.append(_track(events))
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), DIV)
    return header + b"".join(tracks)


def test_the_tempo_map_and_running_status_give_note_times_in_seconds():
    # 120 bpm for one beat, then 60 bpm: a note at beat 2 starts at 0.5 + 1.0 s
    data = smf([[(0, DIV, 60, 100), (2 * DIV, 3 * DIV, 64, 80)]], tempos=((0, 500_000), (DIV, 1_000_000)),
               running_status=True)
    notes, summary = _midi.parse_midi(data)
    assert [(round(n.start_s, 6), round(n.end_s, 6), n.pitch) for n in notes] == [(0.0, 0.5, 60), (1.5, 2.5, 64)]
    assert summary["tempo_changes"] == 2 and summary["first_bpm"] == 120.0


def test_drums_are_skipped_and_non_midi_is_refused():
    data = smf([[(0, DIV, 60, 100)]])
    drum = bytearray(data)
    notes, _ = _midi.parse_midi(bytes(drum))
    assert len(notes) == 1
    with pytest.raises(AstridError, match="Standard MIDI File"):
        _midi.parse_midi(b"RIFF....")


def test_the_melody_is_the_highest_note_the_bass_the_lowest_and_the_rest_arpeggiate():
    # a C major chord with a bass C2 and a melody E5 over it
    notes = [_midi.Note(0.0, 1.0, p, 100) for p in (36, 60, 64, 67, 76)]
    voices = _midi.allocate(notes)
    assert [v[2][1] for v in voices["pulse1"]] == [76]
    assert [v[2][1] for v in voices["triangle"]] == [36]
    assert voices["pulse2"] == [(0.0, 1.0, (60, 64, 67))]


def test_a_low_note_alone_is_bass_not_melody():
    voices = _midi.allocate([_midi.Note(0.0, 1.0, 40, 90)])
    assert voices["pulse1"] == [] and [v[2][1] for v in voices["triangle"]] == [40]


def test_render_is_deterministic_within_the_peak_ceiling_and_starts_where_asked():
    notes = [_midi.Note(0.0, 0.8, 72, 110), _midi.Note(0.0, 2.0, 43, 90), _midi.Note(1.0, 2.0, 74, 60)]
    a, voices = _midi.render(notes, duration_s=2.5)
    b, _ = _midi.render(notes, duration_s=2.5)
    assert a.shape == (2, int(2.5 * syn.SAMPLE_RATE)) and np.array_equal(a, b)
    peak_db, _ = syn.measure_db(a)
    assert peak_db <= syn.PEAK_CEILING_DB + 1e-3
    late, _ = _midi.render(notes, duration_s=1.0, start_s=1.0)
    assert late.shape[1] == syn.SAMPLE_RATE and float(np.abs(late).max()) > 0
    assert voices["pulse1"]["spans"] == 2 and voices["triangle"]["spans"] == 1


def test_the_executor_writes_music_voices_and_its_manifest(tmp_path: Path):
    midi = tmp_path / "tune.mid"
    midi.write_bytes(smf([[(0, DIV, 67, 100), (DIV, 2 * DIV, 69, 100)], [(0, 2 * DIV, 43, 90)]]))
    out = tmp_path / "out"
    assert run.main(["--midi", str(midi), "--out", str(out)]) == 0
    with wave.open(str(out / "music.wav")) as handle:
        assert handle.getframerate() == syn.SAMPLE_RATE and handle.getnchannels() == 2
        assert handle.getnframes() == int(round(2.0 * syn.SAMPLE_RATE))  # 1 s of notes + 1 s tail
    voices = json.loads((out / "voices.json").read_text())
    assert voices["midi"]["notes"] == 3 and voices["voices"]["triangle"]["spans"] == 1
    manifest = json.loads((out / "manifest.json").read_text())
    assert [o["name"] for o in manifest["outputs"]] == ["music", "voices"]
