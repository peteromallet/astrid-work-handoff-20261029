import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import './check-before-push-cache.test.mjs';

const source = readFileSync(fileURLToPath(new URL('./check-before-push', import.meta.url)), 'utf8');

test('npm test preserves the app-checks then Node-tests sequence', () => {
  const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.equal(packageJson.scripts.test, 'npm run test:app && npm run test:node');
  assert.match(packageJson.scripts['test:app'], /check:no-smoke-tests.*check:known-failures.*check:no-raw-skips.*check:skip-registry.*vitest run/s);
  assert.match(packageJson.scripts['test:node'], /node --import tsx --test/);
});

test('pre-push keeps fixture Git commands out of the parent repository', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'astrid-pre-push-env-'));
  const parent = path.join(base, 'parent');
  const fixture = path.join(base, 'fixture.git');
  const nvmDir = path.join(base, 'nvm');
  const nodeBin = path.join(nvmDir, 'versions', 'node', `v${process.version.slice(1)}`, 'bin');
  const tmpReal = path.join(base, 'canonical-tmp');
  const tmpAlias = path.join(base, 'tmp-alias');
  const tmpObserved = path.join(base, 'observed-tmpdir.txt');
  const npmCalls = path.join(base, 'npm-calls.txt');
  const env = { ...process.env };
  // The regression itself must also be safe when launched from a Git hook.
  for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n')) delete env[name];
  const git = (...args) => execFileSync('git', args, { cwd: parent, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    mkdirSync(path.join(parent, 'scripts'), { recursive: true });
    mkdirSync(path.join(parent, 'scripts', 'quality'), { recursive: true });
    mkdirSync(nodeBin, { recursive: true });
    mkdirSync(tmpReal);
    symlinkSync(tmpReal, tmpAlias, 'dir');
    symlinkSync(process.execPath, path.join(nodeBin, 'node'));
    git('init', '-q');
    git('config', 'user.name', 'Parent Owner');
    git('config', 'user.email', 'parent@example.invalid');
    writeFileSync(path.join(parent, 'scripts/check-before-push'), source, { mode: 0o755 });
    writeFileSync(path.join(parent, 'scripts/check-before-push-cache.mjs'), readFileSync(new URL('./check-before-push-cache.mjs', import.meta.url)));
    writeFileSync(path.join(parent, 'scripts/quality/check-build-context.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.TMP_OBSERVED, process.env.TMPDIR);\n");
    writeFileSync(path.join(parent, '.nvmrc'), `${process.version.slice(1)}\n`);
    writeFileSync(path.join(parent, 'package-lock.json'), '{"lockfileVersion":3}\n');
    git('add', '.');
    git('commit', '-qm', 'parent');
    const before = { head: git('rev-parse', 'HEAD'), config: readFileSync(path.join(parent, '.git/config'), 'utf8') };
    // Run the real hook driver with a Node shim at the pinned location and a
    // cheap npm stub. The build guard records TMPDIR after canonicalization.
    writeFileSync(path.join(nodeBin, 'npm'), '#!/bin/sh\nset -eu\nif [ "${1:-}" = "--version" ]; then echo 10.8.2; exit 0; fi\nprintf "%s\\n" "$*" >> "$NPM_CALLS"\ngit init --bare -q "$FIXTURE_REPO"\ngit --git-dir="$FIXTURE_REPO" config user.name "Fixture Owner"\n', { mode: 0o755 });
    execFileSync('bash', [path.join(parent, 'scripts/check-before-push')], {
      cwd: parent,
      env: { ...env, NVM_DIR: nvmDir, TMPDIR: tmpAlias, TMP_OBSERVED: tmpObserved, NPM_CALLS: npmCalls, FIXTURE_REPO: fixture, GIT_DIR: path.join(parent, '.git'), GIT_WORK_TREE: parent, GIT_INDEX_FILE: path.join(parent, '.git/index') },
      stdio: 'pipe',
    });
    assert.equal(git('rev-parse', 'HEAD'), before.head);
    assert.equal(readFileSync(path.join(parent, '.git/config'), 'utf8'), before.config);
    assert.equal(git('config', 'core.bare'), 'false');
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(readFileSync(tmpObserved, 'utf8'), realpathSync(tmpAlias));
    assert.equal(readFileSync(npmCalls, 'utf8'), 'run test:app\nrun test:node\n');
    assert.equal(execFileSync('git', ['--git-dir', fixture, 'config', 'user.name'], { env, encoding: 'utf8' }).trim(), 'Fixture Owner');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
