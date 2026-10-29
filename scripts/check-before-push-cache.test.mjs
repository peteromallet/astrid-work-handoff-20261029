import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helper = fileURLToPath(new URL('./check-before-push-cache.mjs', import.meta.url));
const gitVars = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n');

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'astrid-prepush-cache-'));
  const env = {
    ...process.env,
    ASTRID_PREPUSH_NODE_VERSION: process.version.slice(1),
    ASTRID_PREPUSH_NPM_VERSION: 'test-npm-1',
    ASTRID_PREPUSH_NPM_BIN: process.execPath,
  };
  for (const name of gitVars) delete env[name];
  execFileSync('git', ['init', '-q', root], { env });
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Pre-push Test'], { env });
  execFileSync('git', ['-C', root, 'config', 'user.email', 'pre-push@example.invalid'], { env });
  writeFileSync(path.join(root, '.nvmrc'), `${process.version.slice(1)}\n`);
  writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.env*\n');
  writeFileSync(path.join(root, '.env'), 'DUMMY_LOCAL_SECRET=fixture-only\n');
  writeFileSync(path.join(root, 'tracked.txt'), 'clean\n');
  mkdirSync(path.join(root, 'node_modules'));
  writeFileSync(path.join(root, 'node_modules/.package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
  execFileSync('git', ['-C', root, 'add', '.'], { env });
  execFileSync('git', ['-C', root, 'commit', '-qm', 'fixture'], { env });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, env };
}

function runPhase(root, env, phase, command, args, extraEnv = {}) {
  return spawnSync(process.execPath, [helper, '--phase', phase, '--', command, ...args], {
    cwd: root,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
  });
}

function makeCounterCommand(t) {
  const supportDir = mkdtempSync(path.join(os.tmpdir(), 'astrid-prepush-counter-'));
  t.after(() => rmSync(supportDir, { recursive: true, force: true }));
  const counter = path.join(supportDir, 'runs.txt');
  const command = path.join(supportDir, 'counter.mjs');
  writeFileSync(command, `import { appendFileSync } from 'node:fs';\nif (process.env.ASTRID_TEST_FORCE_FAIL === '1' && process.env.ASTRID_PREPUSH_FORCE === '1') process.exit(7);\nappendFileSync(${JSON.stringify(counter)}, 'run\\n');\n`);
  return {
    counter,
    command: process.execPath,
    args: [command],
    count() {
      try { return readFileSync(counter, 'utf8').trim().split('\n').length; } catch { return 0; }
    },
  };
}

test('caches only passing checks for an exact clean commit, toolchain, and environment', (t) => {
  const { root, env } = fixture(t);
  const counter = makeCounterCommand(t);
  const envTarget = path.join(os.tmpdir(), `astrid-prepush-env-target-${process.pid}`);
  t.after(() => rmSync(envTarget, { force: true }));
  writeFileSync(envTarget, 'DUMMY_SYMLINK_ENV=first\n');
  symlinkSync(envTarget, path.join(root, '.env.local'));
  const first = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(counter.count(), 1);
  const repeat = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 1);
  const receiptDirectory = path.join(root, '.git', 'codex-prepush-cache-v1');
  for (const filename of readdirSync(receiptDirectory).filter((name) => name.endsWith('.json'))) {
    assert.doesNotMatch(readFileSync(path.join(receiptDirectory, filename), 'utf8'), /DUMMY_LOCAL_SECRET|fixture-only/);
  }
  const receiptName = readdirSync(receiptDirectory).find((name) => name.endsWith('.app-tests.json'));
  writeFileSync(path.join(receiptDirectory, receiptName), '{corrupt');
  const corruptReceipt = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(corruptReceipt.status, 0, corruptReceipt.stderr);
  assert.doesNotMatch(corruptReceipt.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 2);

  const alternateArgv = runPhase(root, env, 'app-tests', counter.command, [...counter.args, 'different-argv']);
  assert.equal(alternateArgv.status, 0, alternateArgv.stderr);
  assert.equal(counter.count(), 3);

  writeFileSync(path.join(root, '.env'), 'DUMMY_LOCAL_SECRET=changed-fixture-only\n');
  const envFileChange = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(envFileChange.status, 0, envFileChange.stderr);
  assert.equal(counter.count(), 4);

  writeFileSync(envTarget, 'DUMMY_SYMLINK_ENV=second\n');
  const symlinkTargetChange = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(symlinkTargetChange.status, 0, symlinkTargetChange.stderr);
  assert.doesNotMatch(symlinkTargetChange.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 5);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], { env, encoding: 'utf8' }).trim(), '');

  writeFileSync(path.join(root, 'node_modules/.package-lock.json'), '{"lockfileVersion":3,"packages":{"dep":{"version":"2"}}}\n');
  const dependencyChange = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(dependencyChange.status, 0, dependencyChange.stderr);
  assert.equal(counter.count(), 6);

  const otherPhase = runPhase(root, env, 'build-context', counter.command, counter.args);
  assert.equal(otherPhase.status, 0, otherPhase.stderr);
  assert.equal(counter.count(), 7);
  const otherEnvironment = runPhase(root, env, 'app-tests', counter.command, counter.args, { ASTRID_CACHE_ENV_TEST: 'different' });
  assert.equal(otherEnvironment.status, 0, otherEnvironment.stderr);
  assert.equal(counter.count(), 8);
  const otherNpm = runPhase(root, env, 'app-tests', counter.command, counter.args, { ASTRID_PREPUSH_NPM_VERSION: 'test-npm-2' });
  assert.equal(otherNpm.status, 0, otherNpm.stderr);
  assert.equal(counter.count(), 9);

  writeFileSync(path.join(root, 'tracked.txt'), 'new commit input\n');
  execFileSync('git', ['-C', root, 'add', 'tracked.txt'], { env });
  execFileSync('git', ['-C', root, 'commit', '-qm', 'new source commit'], { env });
  const newCommit = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(newCommit.status, 0, newCommit.stderr);
  assert.equal(counter.count(), 10);

  rmSync(envTarget, { force: true });
  const brokenSymlink = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(brokenSymlink.status, 0, brokenSymlink.stderr);
  assert.match(brokenSymlink.stderr, /Pre-push cache unavailable; running checks fresh/);
  assert.equal(counter.count(), 11);
});

test('dirty and untracked worktrees always run fresh and never save receipts', (t) => {
  const { root, env } = fixture(t);
  const counter = makeCounterCommand(t);
  assert.equal(runPhase(root, env, 'app-tests', counter.command, counter.args).status, 0);

  writeFileSync(path.join(root, 'tracked.txt'), 'dirty\n');
  const dirty = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(dirty.status, 0, dirty.stderr);
  assert.match(dirty.stdout, /cache disabled.*modified or untracked worktree/);
  assert.equal(counter.count(), 2);

  execFileSync('git', ['-C', root, 'checkout', '--', 'tracked.txt'], { env });
  writeFileSync(path.join(root, 'untracked.txt'), 'untracked\n');
  const untracked = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(untracked.status, 0, untracked.stderr);
  assert.match(untracked.stdout, /cache disabled.*modified or untracked worktree/);
  assert.equal(counter.count(), 3);
});

test('failed and forced checks are never reused', (t) => {
  const { root, env: fixtureEnv } = fixture(t);
  const env = { ...fixtureEnv, ASTRID_TEST_FORCE_FAIL: '1' };
  const counter = makeCounterCommand(t);
  const failed = runPhase(root, env, 'app-tests', process.execPath, ['-e', "process.exit(7)"]);
  assert.equal(failed.status, 7);

  const pass = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(counter.count(), 1);
  const forced = runPhase(root, env, 'app-tests', counter.command, counter.args, { ASTRID_PREPUSH_FORCE: '1' });
  assert.equal(forced.status, 7);
  assert.match(forced.stdout, /forced fresh run/);
  const retry = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(retry.status, 0, retry.stderr);
  assert.doesNotMatch(retry.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 2);
  const repeat = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 2);
});

test('a passed app-test phase survives a later Node-test failure', (t) => {
  const { root, env } = fixture(t);
  const counter = makeCounterCommand(t);
  const appTests = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(appTests.status, 0, appTests.stderr);
  assert.equal(counter.count(), 1);

  const nodeTests = runPhase(root, env, 'node-tests', process.execPath, ['-e', 'process.exit(9)']);
  assert.equal(nodeTests.status, 9);

  const retryAppTests = runPhase(root, env, 'app-tests', counter.command, counter.args);
  assert.equal(retryAppTests.status, 0, retryAppTests.stderr);
  assert.match(retryAppTests.stdout, /reusing a passing receipt/);
  assert.equal(counter.count(), 1);
});

test('concurrent clean invocations serialize and share the passing receipt', async (t) => {
  const { root, env } = fixture(t);
  const supportDir = mkdtempSync(path.join(os.tmpdir(), 'astrid-prepush-concurrent-'));
  t.after(() => rmSync(supportDir, { recursive: true, force: true }));
  const counter = path.join(supportDir, 'concurrent-runs.txt');
  const command = path.join(supportDir, 'slow-counter.mjs');
  writeFileSync(command, `import { appendFileSync } from 'node:fs';\nawait new Promise((resolve) => setTimeout(resolve, 350));\nappendFileSync(${JSON.stringify(counter)}, 'run\\n');\n`);

  const launch = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helper, '--phase', 'app-tests', '--', process.execPath, command], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
  const results = await Promise.all([launch(), launch()]);
  assert.deepEqual(results.map((result) => result.status), [0, 0], results.map((result) => result.stderr).join('\n'));
  assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 1);
  assert.equal(results.filter((result) => /reusing a passing receipt/.test(result.stdout)).length, 1);
});
