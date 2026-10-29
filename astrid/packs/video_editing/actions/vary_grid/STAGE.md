# Vary Grid

`video_editing.vary_grid` selects cells from a required Runtime-managed source grid, prepares reference crops and prompt concepts, then calls Fal GPT Image edit to produce a variation grid. It can optionally produce a favicon preview. A universal result receipt marks a concrete grid as primary and keeps the plan, crops, concepts, prompts, and variation manifest as auxiliary files.

Required inputs are `from_path`, `cells`, and `ideas`. Typed options control count, source rows/columns, output size/quality/format, Fireworks model, `no_kimi`, provider environment file, dry-run behavior, and favicon size/zoom. Provider-backed runs may need `FIREWORKS_API_KEY` and `FAL_KEY`; access is limited to the declared Fireworks/Fal endpoints.
