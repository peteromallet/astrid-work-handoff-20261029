// Where the world's build and harness get three, esbuild and Playwright.
//   LANTERN_VALLEY_DEPS=/path/to/node_modules   an explicit node_modules folder (wins)
//   otherwise the repo's remotion/node_modules, which pins three 0.185.1, when it exists
//   otherwise this folder's own node_modules (npm install here)
// PLAYWRIGHT_DIR may name a playwright package folder for the stills and profile scripts.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(ROOT, '../../../../..');

function pickDeps() {
  if (process.env.LANTERN_VALLEY_DEPS) return resolve(process.env.LANTERN_VALLEY_DEPS);
  const remotion = join(REPO, 'remotion/node_modules');
  if (existsSync(join(remotion, 'three/package.json'))) return remotion;
  return join(ROOT, 'node_modules');
}

export const DEPS = pickDeps();
if (!existsSync(join(DEPS, 'three/package.json')) || !existsSync(join(DEPS, 'esbuild/package.json'))) {
  throw new Error(`three and esbuild not found in ${DEPS}; set LANTERN_VALLEY_DEPS or run npm install in ${ROOT}`);
}

export const requireDeps = createRequire(join(DEPS, 'package.json'));
export const { build } = requireDeps('esbuild');
export const THREE_VERSION = JSON.parse(readFileSync(join(DEPS, 'three/package.json'), 'utf8')).version;
// Lets esbuild resolve `three` from the sources, which live outside the deps folder.
export const NODE_PATHS = [DEPS];

export function loadPlaywright() {
  const dir = process.env.PLAYWRIGHT_DIR ?? DEPS;
  return createRequire(join(dir, 'package.json'))('playwright');
}
