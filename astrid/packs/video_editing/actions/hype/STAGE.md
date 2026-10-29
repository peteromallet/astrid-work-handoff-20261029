# Hype

`video_editing.hype` runs the attempt-local editorial pipeline from required Runtime-materialized `video` and `brief` files through analysis, pool construction, arrangement, cut, and optional render/review/validation. Rendering is requested with `render=true`; its child call resolves the public `rendering.render` action ID. The action writes a universal attempt receipt and includes all concrete result/evidence files under its assigned output directory.

The V3 SDK API uses `kind="action"`. Optional inputs include `audio`, `theme`, target duration, repeatable asset and skip values, `from_step`, `render`, editor-pass limit, config, Python executable, environment file, audit and generative-effects controls, and `dry_run`. File inputs are Runtime-managed; the action never resolves URLs or project-root defaults.
