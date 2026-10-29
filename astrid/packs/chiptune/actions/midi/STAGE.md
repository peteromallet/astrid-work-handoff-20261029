# chiptune.midi - stage notes

- Entrypoint: `astrid.packs.chiptune.actions.midi.run` (`main`), argv built from the action declaration in pack.yaml.
- Parsing, voices and rendering: `actions/_midi.py`; the oscillators, limiter and WAV helpers are `_synth.py`'s.
- Voices: the highest note sounding (from G3 up) is pulse 1; the lowest under middle C is the triangle; the rest are
  arpeggiated on pulse 2 on a global 20 Hz clock (so a chord change never restarts the arp).
- Times are the MIDI's own (tempo map applied). A transcription lines up with its recording; nothing is quantized.
- Outputs: `music.wav` (primary, audio) and `voices.json`, both listed in `manifest.json`.
- Deterministic: no randomness.
