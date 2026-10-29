# Thumbnail Maker

`video_editing.thumbnail_maker` emits a plan and prepares source evidence and reference-pack metadata for an optional Runtime-materialized video and query. Its `generate-thumbnails` subcommand remains a stub that raises `NotImplementedError`; this action does not currently produce generated thumbnail images. `dry_run` emits the plan without running local evidence steps.

The V3 SDK API uses `kind="action"`. Optional typed inputs configure query, canvas size, count, model, quality, output format, visual/reference modes, evidence limits, previous manifest, feedback, provider environment file, project, Python executable, verbosity, and dry run. The declared output is the workflow plan JSON.
