# Logo Ideas

`video_editing.logo_ideas` expands a required idea prompt with the configured Fireworks model and renders a contact sheet or candidate images through Fal. The default render provider is `gpt-image`; `z-image` is the other supported provider. The default concept model is `accounts/fireworks/models/kimi-k2p5`. The result receipt marks a concrete grid as primary and retains the plan and per-candidate manifest as auxiliary outputs.

Optional typed inputs are candidate count, provider, model, image size, output format, Runtime-managed `env_file`, and `dry_run`. Provider-backed runs need `FIREWORKS_API_KEY` and `FAL_KEY`; the declared network policy limits access to the Fireworks and Fal endpoints.
