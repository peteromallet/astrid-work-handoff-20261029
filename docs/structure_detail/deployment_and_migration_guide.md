# Deployment

**Purpose**: how the App ships. **Source of Truth**: `Dockerfile`, `Makefile`, `railway.toml`, `package.json` (`build:hosted`). **Key Invariants**: the hosted bundle makes no external host requests and contains no backend configuration.

> The Supabase database, migrations and Edge Functions were removed 2026-10-18 (tag `pre-cloud-removal`). There is nothing to migrate or deploy besides the web bundle. The future online backend is designed in `docs/design/cloud-mode-*`.

## What ships

| Step | Command | Notes |
|------|---------|-------|
| Hosted bundle | `npm run build:hosted` | Editor-only build (`VITE_ASTRID_EDITOR_ONLY=1`), then `scripts/quality/check-no-remote-hosts.mjs dist`, which fails if `dist` names Google Fonts, `unpkg.com` or `cdn.jsdelivr.net` |
| Image | `Dockerfile` | Builds with `build:hosted`, serves `dist` with `vite preview` on Railway (`railway.toml`) |
| Release gate | `make release-check` | Dockerfile check, build-context check, image build, build, `quality:check`, tests, extension gates |

Fonts are self-hosted (`public/fonts/` and the vendored Inter files); the build check is what keeps a remote font or script from coming back.

## Rules

- Do not change the Dockerfile, `Makefile` docker targets or `railway.toml` without running `make deploy-check` (it reproduces the Railway build; plain `npm run build` misses image-only breakage).
- `package.json` `file:` dependencies and Vite aliases must stay inside the build context (`make build-context-check`).
- Rollout controls for extensions are written at container start from non-`VITE_` variables (`scripts/runtime/write-extension-release-config.mjs`), never baked into the bundle.
