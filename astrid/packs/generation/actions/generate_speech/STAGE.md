# Generate speech

Invoke `generation.generate_speech` through the SDK with a connected Runtime
client, project, exact `text`, and configurable Edge TTS `provider`, `voice`,
`rate`, `volume`, and `pitch`. Defaults are `edge-tts`,
`en-US-ChristopherNeural`, `+0%`, `+0%`, and `+0Hz`. The `edge-tts` Python
package plus local `ffmpeg` and `ffprobe` are required. Edge TTS streams audio
and `WordBoundary` events through the host's declared WebSocket broker route
(`api.msedgeservices.com:443` first, falling back to the legacy
`speech.platform.bing.com:443`);
the timing is not inferred from the rendered WAV.

The managed result ports are `speech` (PCM WAV), `speech_manifest`
(`speech-provenance.json` containing exact words, voice settings, text/audio
hashes and measured duration), and `speech_words` (`speech-words.json` with
`WordBoundary` word spans in seconds from the start of the WAV). `manifest.json`
is the universal result harvest manifest; it is not a self-hashed managed
output. Synthesis, timing, and decoding errors remove staged audio and return
failure. This executor does not edit timelines or establish voiceover
authority; callers retain the verified authored voiceover and occurrence
inputs when placing the result.
