---
name: vibecomfy
description: >-
  Escape hatch. For standard image generation use the generate-image skill and
  the SDK (astrid.sdk.invoke("generation.generate_image", ...)). Reach for
      kind="executor", project="demo",
  vibecomfy directly when you need LoRAs, IP-adapter, controlnet, custom
  samplers, graph composition, or any path the registry does not cover.
---

# VibeComfy — the escape hatch

For standard image generation use the `generate-image` skill and the SDK
(`astrid.sdk.invoke("generation.generate_image", ...)`).  Reach for this skill
    kind="executor", project="demo",
when you need
LoRAs, IP-adapter, controlnet, custom samplers, graph composition, or any
path the registry doesn't cover.

`vibecomfy.run` is the **escape hatch** for generation features that fall
outside the basic happy-path contracts of `generation.generate_image` and
`generation.generate_video` (and the planned audio executor).  Use it directly for:

- **LoRAs** — attach custom weights to any node in the ComfyUI graph.
- **IP-adapter** — image-prompt / style-reference conditioning.
- **ControlNet** — depth, canny, pose, scribble, and other structural conditioning.
- **Custom samplers** — DPM++ 3M, UniPC, LCM, etc.
- **Exotic conditioning** — regional prompting, attention injection, CFG
  scheduling, and any other node-graph surgery not covered by the opinionated
  `generation.generate_image` contract.

The builtin image executor supports six canonical modes (`t2i`, `i2i`, `edit`,
`inpaint`, `outpaint`, `upscale`) across a growing Tier-1 model list.  Everything
beyond those modes — LoRAs, IP-adapter, ControlNet, custom samplers — belongs here.

## How to use

- `vibecomfy.run` maps to `python -m vibecomfy.cli run {workflow}`
- `vibecomfy.validate` maps to `python -m vibecomfy.cli validate {workflow}`

Install the executor package through the explicit Astrid executor install flow before
running these actions. Both executors share the `vibecomfy` package environment via
the folder-level `PACKAGE_ID`.

## Idle release

After a settled `vibecomfy.run` task the pack host keeps the session warm for
the next one. After 600 s idle (`ASTRID_WARM_IDLE_SECONDS`, or the request's
`lifecycle.idle_timeout_seconds`) it releases the session: queued work is
cleared and ComfyUI is asked to unload models and free memory (`/api/free`).
The engine process is kept, because the Runtime selected it for this host and
the host cannot restart it. The host sees only ComfyUI's acknowledgement, so
whether GPU or unified memory actually came back is not measured. The next
task loads its models again. `astrid doctor` shows the hold under `warmHolds`
with `on_idle: "models unloaded; engine process kept; memory release not
measured"`.

## Cross-links

- `docs/generation/` — modality contracts, manifest schema, feature list
- `astrid/packs/generation/docs/SKILL.md` — the `generate-image` skill (primary entry point)
- `astrid/packs/generation/actions/generate_image/STAGE.md` — the basic image executor
- `astrid/packs/generation/actions/generate_video/STAGE.md` — the basic video executor (Sprint 04)
- `docs/generation/30-image-contract.md` — image modality contract (all six canonical modes)
- `docs/generation/31-video-contract.md` — video modality contract (implemented Sprint 04)
- `docs/generation/32-audio-contract.md` — audio modality contract (spec-only)
