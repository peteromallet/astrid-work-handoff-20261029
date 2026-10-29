# music.beats

- ffmpeg decodes mono audio; numpy extracts a spectral-flux onset envelope.
- Tempo comes from autocorrelation over 60–180 BPM. Dynamic programming follows accents while allowing tempo drift; every fourth beat with the strongest average accent becomes the downbeat phase.
- This assumes 4/4 and may choose half/double tempo or the wrong phase in syncopated arrangements. Inspect before attaching to a timeline.
- `beats.json` uses `chiptune.compose`'s timing keys and source-second coordinates. `bars` are four-bar phrase starts.
