# Render storage

Admission plans expected usage and leaves a 1 GiB volume reserve by default.
Runtime and the host share `runtime_protocol.storage.free_disk_floor_bytes`,
including the existing `ASTRID_RUNTIME_FREE_DISK_FLOOR_BYTES` override.
Refusals report the requested bytes, reserve and actual free bytes in decimal
GB. Freeing disk space is the remedy; idempotency compaction is not suggested.

For `rendering.render`, scratch and output estimates are planning inputs, not
execution or settlement ceilings. The host samples actual volume space while
the child runs (every 0.5 seconds) and checks it before publication. It stops
below the reserve, including when another task consumes the disk. Existing
concurrency limits remain; this is not a reservation of space per worker.

Opaque JPEG95 frames are planned at 0.25 bytes per pixel, with a 10% overall
margin and a 128 MiB renderer workspace. Nine sparse frames from a completed
5879-frame, 1920x1080/30 film, decoded and re-encoded in memory with Pillow at
quality 95, used 0.040–0.162 bytes/pixel (mean 0.089). These are content-specific
compression samples, not a bound on Chromium's JPEG encoder. Two successful
attempts settled at 2.15–2.31 GB versus 13.57–13.97 GB admitted; settlement
measurements do not establish frame-storage peaks.

Remotion pipes frames to ffmpeg when its admitted memory allocation permits
parallel encoding; otherwise it writes a full JPEG sequence. The estimate
uses the expected path. The sequence and parallel encoder working file are
alternatives. The support probe's temporary asset copy is removed before the
render, which reuses its verified materialized input files. The separate export
adapter's two copies are not charged to this path. Asset copies request normal
data copies, not APFS clones; no clone savings are assumed.

For that film, recomputing the canonical inputs changes Runtime's estimate from
13.97 to 6.33 GB and Astrid's detailed estimate from 30.50 to 6.83 GB, before
the reserve. Estimates vary with media inputs, audio topology and render size.

Render media and private workspaces use the volume guard. Diagnostic evidence
retains its per-attempt and shared retained-root caps. Non-render packs retain
their explicit hard storage envelopes and bounded input contracts. Output
containment, CAS/object limits, leases and settlement fences remain enforced.
