# Examples

The `examples/` directory contains committed schema fixtures, small sample
briefs, teaching packs, and the **Agentic UX** example application.
Generated media does not belong here.

## Agentic UX Example

A complete external-application walkthrough of the public Astrid SDK's
no-side-effect preview surface: **discover → inspect → dry-run invoke**.

- **Source**: [`agentic_ux/agentic_ux.py`](agentic_ux/agentic_ux.py)
- **Tutorial**: [`docs/guides/build-your-first-agentic-ux.md`](../docs/guides/build-your-first-agentic-ux.md)

```bash
python examples/agentic_ux/agentic_ux.py \
    --capability-id editorial.arrange
```

## Briefs

`examples/briefs/` contains human-readable pure-generative briefs that are safe
to commit and useful for manual smoke runs:

Use the owning video-editing orchestrator through the SDK when you want to run
one of these briefs:

```python
from astrid import sdk

for name in ("cinematic", "surreal"):
    result = sdk.invoke(
        "video_editing.hype",
        inputs={
            "brief": f"examples/briefs/{name}.txt",
            "target_duration": 15,
        },
        out=f"runs/{name}",
    )
```

## Media Fixtures

Generate local sample media on demand with:

```bash
ffmpeg -f lavfi -i testsrc=duration=42:size=1920x1080:rate=30 -c:v libx264 examples/main.mp4
ffmpeg -f lavfi -i testsrc=duration=18:size=1280x720:rate=24 -c:v libx264 examples/broll.mp4
```

Notes:

- `main.mp4`, `broll.mp4`, and other generated media are not committed.
  Generate them locally when you need a real fixture render.
- `hype.timeline.json` is the small design fixture. It intentionally uses
  separate visual tracks for branding, captions, b-roll, and source footage;
  visual tracks listed earlier render above tracks listed later.
- `hype.timeline.full.json` and `hype.assets.full.json` are schema-only fixtures consumed by the smoke test and `tools/tests/test_schema_contract.py`.
- The full fixture `file` paths point at the on-demand media names, but those files do not need to exist for bundle-only smoke checks.

## Example Packs (`examples/packs/`)

`examples/packs/` contains teaching packs that demonstrate pack authoring
patterns. These packs are **not** runtime-discovered — you will not see them in
`packs list` or `packs status` output. They are validated with `packs validate`:

The directories below are source-admitted teaching fixtures. They are not
runtime-discovered by default, but each pack is validated from its own manifest
when its source root is supplied explicitly. The `media` fixture demonstrates
declared V3 actions and pack-owned rendering resources; the other fixtures
retain the contract each manifest declares.

```bash
python3 -m astrid.core.pack.cli validate examples/packs/minimal
python3 -m astrid.core.pack.cli validate examples/packs/file_summarizer
python3 -m astrid.core.pack.cli validate examples/packs/text_digest
python3 -m astrid.core.pack.cli validate examples/packs/text_review
python3 -m astrid.core.pack.cli validate examples/packs/media
```

| Pack | Purpose |
|---|---|
| `minimal` | Canonical external-pack contract: one executor (`ingest_assets`) + one orchestrator (`make_trailer`). |
| `media` | Pack with elements (project-title-card effect), schemas, and executor/orchestrator demonstrating the full component surface. |
| `file_summarizer` | Multi-step text pipeline: read files, produce attested JSON summaries with counts, emit a verdict. |
| `text_digest` | Agent-in-the-loop text pipelines: multiple orchestrators for reading, summarizing, and delivering verdicts on text files. |
| `text_review` | Machine summary (auto-generated line/word/char counts) followed by an agent-attested human-readable verdict. |

### What these packs are NOT

- **Not runtime-discovered.** They live in `examples/packs/`, not
  `astrid/packs/`. The runtime only discovers packs under `astrid/packs/`.
- **Not canonical product packs.** Product capabilities remain under
  `astrid/packs/`; example capabilities are admitted only from their explicit
  `examples/packs/<name>` source context.
- **Not default runtime packs.** Their location under `examples/packs/` keeps
  them out of default discovery; use the declared extra pack root when invoking
  an example action.
