# chiptune.compose - stage notes

- Entrypoint: `astrid.packs.chiptune.actions.compose.run` (`main`), argv built from the V3 action declaration.
- Synthesis: `actions/_synth.py` (`compose_music`). Pure numpy; no network; no subprocess.
- Outputs: `music.wav` (primary, artifact_type audio) and `beats.json`. Both are listed in `manifest.json`,
  which is the exclusive receipt.
- Structured inputs (`sections`, `hits`, `duck`, `vo_mask`, and `mutes`) are JSON-typed
  at the V3 SDK boundary and arrive at the process as JSON text. Direct CLI callers
  may pass the same values as JSON text.
- Determinism: all randomness comes from `seed` through one generator, in a fixed order.
