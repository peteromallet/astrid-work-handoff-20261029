# chiptune.sfx - stage notes

- Entrypoint: `astrid.packs.chiptune.actions.sfx.run` (`main`), argv built from the V3 action declaration.
- Synthesis: `actions/_synth.py` (`render_sfx`). Pure numpy; seeded from crc32(kind) and variant, so it is stable across processes.
- Single mode outputs `sfx.wav` (primary) and `sfx.json`. Batch mode (`kinds`) outputs `sfx-batch.zip` (primary) and `sfx-batch.json`.
- The zip uses fixed timestamps, so identical requests give identical archives.
