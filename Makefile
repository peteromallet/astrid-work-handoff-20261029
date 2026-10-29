SHELL := /bin/sh

PUBLIC_VITE_ENV := \
	VITE_API_TARGET_URL=https://example.com

.PHONY: help install-hooks dockerfile-check build-context-check build docker-build deploy-check quality test extensions-check extensions-production-smoke release-check ci

help:
	@printf '%s\n' \
		'Targets:' \
		'  make dockerfile-check     Run Docker build checks, including ARG/ENV secret linting.' \
		'  make build-context-check  Verify package.json file: deps and config aliases stay inside the build context.' \
		'  make build                Run the production Vite build with dummy public client config.' \
		'  make docker-build         Run a Docker image build with dummy public client config.' \
		'  make deploy-check         Reproduce the Railway build end-to-end (catches the breakage that --check misses).' \
		'  make quality              Run architecture, lint, and strict type checks.' \
		'  make test                 Run the Vitest suite.' \
		'  make extensions-check     Run extension contract gates (schema validation, drift, export freeze, packagability, unit tests).  Local-only — no Docker required.' \
		'  make extensions-production-smoke  Run the production-bundled smoke extension tests (opt-in, statically bundled).  Local-only.' \
		'  make release-check        Run the full release gate before cutting a deployment.' \
		'  make install-hooks        Install repo-managed git hooks.' \
		'  make ci                   Alias for release-check.'

install-hooks:
	git config core.hooksPath scripts/git-hooks

dockerfile-check:
	@docker info >/dev/null 2>&1 || { \
		printf '%s\n' 'Docker is not running. Start Docker and rerun make dockerfile-check.' >&2; \
		exit 1; \
	}
	docker build --check .
	node scripts/quality/check-dockerfile-sensitive-env.mjs

# Static guard against the class of bug that took prod down on commit c99e760ec:
# the Railway build context is the repo root, so any file: dependency in
# package.json or any vite/vitest alias pointing outside the repo silently breaks
# `npm ci` and the bundler with misleading errors. Catches the issue in <1s,
# without spinning up Docker.
build-context-check:
	node scripts/quality/check-build-context.mjs

build:
	$(PUBLIC_VITE_ENV) npm run build

docker-build:
	docker build \
		--build-arg VITE_API_TARGET_URL=https://example.com \
		.

# Real Railway-equivalent build (Dockerfile + npm ci + vite build). Run before
# pushing changes that touch the Dockerfile, package.json deps, or vite config —
# this is the gate that would have caught the c99e760ec breakage.
deploy-check: build-context-check docker-build

quality:
	npm run quality:check

test:
	npm test

# ---------------------------------------------------------------------------
# Extension contract gates (local-only — no Docker required)
# ---------------------------------------------------------------------------
# Runs schema validation (Ajv), drift gate, public export freeze,
# packagability smoke, and focused extension unit tests.
extensions-check:
	npm run test:extensions

# Production-bundled smoke extension tests (opt-in, statically bundled).
# This verifies the ?extensionSmoke=1 trigger without a sandbox or loader.
extensions-production-smoke:
	npm run test:extensions:production-smoke

# ---------------------------------------------------------------------------
# Release gate
# ---------------------------------------------------------------------------
# Docker-required: dockerfile-check, docker-build
# Local-only:      build-context-check, build, quality, test, extensions-check
release-check: dockerfile-check build-context-check docker-build build quality test extensions-check

ci: release-check
