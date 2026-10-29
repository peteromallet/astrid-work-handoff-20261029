# music.level

- ffmpeg's `ebur128` filter measures integrated EBU R128 loudness with its standard absolute and relative gates.
- `from_s` and `to_s` are source seconds; decode only `[from_s, to_s]`. No gain is applied.
- Report target minus measured LUFS, or fail for silence/insufficient signal. Output `level.json` and `manifest.json`.
