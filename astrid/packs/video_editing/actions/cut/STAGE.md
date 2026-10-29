# Cut

`video_editing.cut` compiles an arrangement, merged pool, and required brief into the attempt-local Remotion timeline, asset registry, EDL, and metadata files. Optional scene, source-media, transcript, shot, theme, and asset inputs are read only from Runtime-materialized files. The action does not resolve URLs, workspace paths, or theme slugs.

The public V3 call uses `kind="action"`; its required input is `brief`. `pool` and `arrangement` are optional at the schema boundary because resume mode accepts `timeline` and `assets`, but a fresh compile needs `pool`, `arrangement`, and `brief` together. The result receipt marks `timeline` as primary and identifies the other files as auxiliary.

