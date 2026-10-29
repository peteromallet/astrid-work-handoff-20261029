#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(git rev-parse --show-toplevel)
PORT=${VERIFY_PORT:-2261}
KEEP=${KEEP:-0}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/verify-docker-local.XXXXXX")
BUILD="$WORK/build"
SOURCE="$WORK/source"
RUNTIME="$WORK/runtime"
mkdir -p "$BUILD" "$SOURCE" "$RUNTIME"
CURRENT_STEP=initialization
FAILURE_REPORTED=0

step() { CURRENT_STEP=$*; printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$CURRENT_STEP"; }
fail() {
  local status=$?
  FAILURE_REPORTED=1
  printf '\nFAILED: %s (exit %s)\n' "$CURRENT_STEP" "$status" >&2
  local log="$WORK/${LOG_NAME:-none}.log"
  if [[ -f "$log" ]]; then tail -n 30 "$log" >&2; fi
  exit "$status"
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$FAILURE_REPORTED" != 1 ]]; then
    printf '\nFAILED: %s (exit %s)\n' "$CURRENT_STEP" "$status" >&2
    local log="$WORK/${LOG_NAME:-none}.log"
    if [[ -f "$log" ]]; then tail -n 30 "$log" >&2; fi
  fi
  # Only stop a listener bound to this verifier's selected port.
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    [[ -z "$pids" ]] || kill $pids 2>/dev/null || true
  fi
  if [[ "$KEEP" == 1 ]]; then printf 'Kept verifier files at %s\n' "$WORK"; else rm -rf "$WORK"; fi
  exit "$status"
}
trap fail ERR
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

kill_port_listener() {
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    [[ -z "$pids" ]] || kill $pids 2>/dev/null || true
  fi
}

CURRENT_STEP='validate VERIFY_PORT'; [[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'VERIFY_PORT must be numeric' >&2; exit 2; }
CURRENT_STEP='locate Node'; command -v node >/dev/null || { echo 'node from PATH is required' >&2; exit 2; }
CURRENT_STEP='locate npm'; command -v npm >/dev/null || { echo 'npm from PATH is required' >&2; exit 2; }
CURRENT_STEP='locate curl'; command -v curl >/dev/null || { echo 'curl is required' >&2; exit 2; }
kill_port_listener

step 'archive HEAD into a clean source tree'
git -C "$ROOT" archive HEAD | tar -x -C "$SOURCE"

step 'read npm version from Dockerfile'
NPM_VERSION=$(sed -nE 's/.*npm install -g npm@([^[:space:]]+).*/\1/p' "$SOURCE/Dockerfile" | head -n 1)
[[ -n "$NPM_VERSION" ]] || { echo 'Dockerfile has no npm install -g npm@X line' >&2; exit 2; }
printf 'Dockerfile npm pin: %s\n' "$NPM_VERSION"

step 'stage pre-install Docker COPY instructions'
awk '/^RUN .*npm ci/{exit} /^COPY /{print}' "$SOURCE/Dockerfile" > "$WORK/pre-ci-copies.txt"
while IFS= read -r line; do
  read -r -a fields <<< "$line"
  sources=()
  for ((i=1; i<${#fields[@]}; i++)); do sources+=("${fields[i]}"); done
  ((${#sources[@]} >= 2)) || continue
  dst_index=$((${#sources[@]} - 1)); dst=${sources[$dst_index]}; unset 'sources[dst_index]'
  if [[ "${sources[*]}" == 'package.json package-lock.json' && "$dst" == ./ ]]; then
    cp "$SOURCE/package.json" "$SOURCE/package-lock.json" "$BUILD/"
  else
    for src in "${sources[@]}"; do
      mkdir -p "$BUILD/$(dirname "$dst")"
      cp -R "$SOURCE/$src" "$BUILD/$dst"
    done
  fi
done < "$WORK/pre-ci-copies.txt"

# This machine's ~/.npmrc sets offline; an empty user config prevents it from
# silently forcing npm ci offline. Use a disposable cache so local npm state is untouched.
step "npm ci with Dockerfile npm $NPM_VERSION and lifecycle scripts enabled"
LOG_NAME=ci
(cd "$BUILD" && npm_config_userconfig=/dev/null npm_config_cache="$WORK/npm-cache" npx --userconfig=/dev/null --cache="$WORK/npm-cache" --yes "npm@$NPM_VERSION" ci --userconfig=/dev/null --cache="$WORK/npm-cache" --no-audit --no-fund) > "$WORK/ci.log" 2>&1

step 'copy Docker build context into the build stage'
(cd "$SOURCE" && tar --exclude=./node_modules --exclude=./dist --exclude=./.git -cf - .) | tar -xf - -C "$BUILD"

step 'verify Astrid vendor sources'
LOG_NAME=verify
(cd "$BUILD" && node scripts/build/verify-astrid-vendor-sources.mjs) > "$WORK/verify.log" 2>&1

step 'build production bundle'
LOG_NAME=build
(cd "$BUILD" && NODE_OPTIONS=--max-old-space-size=4096 npm run build) > "$WORK/build.log" 2>&1

step 'stage runtime Docker COPY instructions'
awk '/^FROM .* AS runtime/{runtime=1; next} runtime && /^COPY /{print}' "$SOURCE/Dockerfile" > "$WORK/runtime-copies.txt"
while IFS= read -r line; do
  read -r -a fields <<< "$line"
  ((${#fields[@]} >= 3)) || continue
  from="$SOURCE"; i=1
  while [[ "${fields[i]}" == --* ]]; do
    [[ "${fields[i]}" == --from=build ]] && from="$BUILD"
    ((i+=1))
  done
  sources=("${fields[@]:i}")
  ((${#sources[@]} >= 2)) || continue
  dst_index=$((${#sources[@]} - 1)); dst=${sources[$dst_index]}; unset 'sources[dst_index]'
  if [[ "${sources[*]}" == 'package.json package-lock.json' && "$dst" == ./ ]]; then
    cp "$from/package.json" "$from/package-lock.json" "$RUNTIME/"
    continue
  fi
  for src in "${sources[@]}"; do
    [[ "$from" != "$BUILD" ]] || src=${src#/app/}
    if [[ "$dst" == ./ ]]; then cp -R "$from/$src" "$RUNTIME/"; else mkdir -p "$RUNTIME/$(dirname "$dst")"; cp -R "$from/$src" "$RUNTIME/$dst"; fi
  done
done < "$WORK/runtime-copies.txt"

step 'start preview server'
LOG_NAME=serve
(cd "$RUNTIME" && PORT="$PORT" NODE_ENV=production npm run serve >> "$WORK/serve.log" 2>&1) &
SERVER_PID=$!

step 'wait for served page health check'
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/" -o /dev/null 2>/dev/null; then healthy=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo 'served page health check did not pass' >&2; false; }
curl -fsS --max-time 5 "http://127.0.0.1:$PORT/" -o /dev/null
printf 'Health checks passed on port %s\n' "$PORT"
