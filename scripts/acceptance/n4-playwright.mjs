#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, realpathSync, symlinkSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const xferRoot = path.dirname(repoRoot);
const sharedModulesInput = process.env.N4_SHARED_NODE_MODULES?.trim();
const node20Input = process.env.N4_NODE?.trim();
if (!sharedModulesInput || !node20Input || !process.env.N4_IMPORT_RESULT) {
  throw new Error('Set N4_SHARED_NODE_MODULES, N4_NODE, and N4_IMPORT_RESULT to the isolated provisioned browser dependencies and passed sandbox result.');
}
const sharedModules = path.resolve(sharedModulesInput);
const node20 = path.resolve(node20Input);
const overlay = path.join(repoRoot, 'node_modules');
const cli = path.join(overlay, '@playwright', 'test', 'cli.js');

function underX(candidate) { return candidate === xferRoot || candidate.startsWith(`${xferRoot}${path.sep}`); }
if (!underX(path.resolve(process.env.N4_IMPORT_RESULT))) throw new Error('N4 import result must be under X.');
if (!existsSync(sharedModules) || !lstatSync(sharedModules).isDirectory()) throw new Error(`N4 shared dependency tree is missing: ${sharedModules}`);
const expectedModules = '/Users/hannahomalley/Developer/astrid-video/astrid-local/labs/app-door/node_modules';
if (realpathSync(sharedModules) !== realpathSync(expectedModules)) throw new Error(`N4 dependencies must be the provisioned read-only tree at ${expectedModules}.`);
if (!existsSync(node20)) throw new Error(`N4 provisioned Node binary is missing: ${node20}`);
if (existsSync(overlay)) {
  if (lstatSync(overlay).isSymbolicLink() || !lstatSync(overlay).isDirectory()) throw new Error(`Refusing to use a non-local worktree node_modules: ${overlay}`);
  for (const name of readdirSync(overlay)) {
    if (name === '.vite' || name === '.vite-temp') continue;
    const entry = path.join(overlay, name);
    // The creation pass below skips shared entries whose target is gone; accept those overlay links too.
    try { realpathSync(path.join(sharedModules, name)); } catch { if (lstatSync(entry).isSymbolicLink()) continue; }
    if (!lstatSync(entry).isSymbolicLink() || realpathSync(entry) !== realpathSync(path.join(sharedModules, name))) {
      throw new Error(`The worktree dependency overlay contains an unexpected entry: ${entry}`);
    }
  }
} else {
  mkdirSync(overlay, { mode: 0o755 });
  for (const name of readdirSync(sharedModules)) {
    if (name === '.vite' || name === '.vite-temp') continue;
    const target = path.join(sharedModules, name);
    try { realpathSync(target); } catch { continue; }
    symlinkSync(target, path.join(overlay, name), 'dir');
  }
}
for (const name of ['.vite', '.vite-temp']) {
  const localCache = path.join(overlay, name);
  try {
    const stat = lstatSync(localCache);
    if (stat.isSymbolicLink()) {
      if (name !== '.vite' || realpathSync(localCache) !== realpathSync(path.join(sharedModules, name))) {
        throw new Error(`Refusing to use a shared or unexpected Vite cache link: ${localCache}`);
      }
      unlinkSync(localCache);
    } else if (!stat.isDirectory()) {
      throw new Error(`Vite cache path must be a local directory: ${localCache}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  mkdirSync(localCache, { recursive: true, mode: 0o755 });
}
const version = spawnSync(node20, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !/^v20\./.test(version.stdout.trim())) throw new Error(`N4 browser must use the provisioned Node 20 binary; got ${version.stdout.trim()}`);

if (!existsSync(cli)) throw new Error(`Playwright CLI is missing in the provisioned dependency tree: ${cli}`);

const args = process.argv.slice(2);
if (!args.length) args.push('test', '--config', 'playwright.n4-direct.config.ts');
const result = spawnSync(node20, [cli, ...args], { cwd: repoRoot, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
