# music.align

- Decode target and audio reference with ffmpeg to 11,025 Hz mono; extract batched spectral flux and normalized chroma with numpy.
- MIDI notes use the existing `chiptune.actions._midi.parse_midi` tempo-map parser. Onsets are correlated with target spectral flux. MIDI ratio is fixed at 1 because the transcription shares the recording clock.
- Audio matching scores a window at `ref_s` across the target and ratios 0.94–1.06. Offset maps reference seconds to target seconds: `target_s = ratio * reference_s + offset_s`.
- Confidence is score minus a deterministic shuffled-feature baseline. Review the resulting location by ear; repeated motifs can be ambiguous.
- Output is `alignment.json` and `manifest.json`.
