import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { packageManagerInvocation } from './node-package-manager.mjs';
import { resolveDeveloperCommand } from './portable-developer-command.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('npm and npx run through Node and preserve arguments, environment, and paths with spaces', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'astrid npm fixture '));
  temporaryDirectories.push(directory);
  const bin = join(directory, 'node modules', 'npm', 'bin');
  await mkdir(bin, { recursive: true });
  const received = join(directory, 'received.json');
  const fixture = `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.FIXTURE_RESULT, JSON.stringify({ args: process.argv.slice(2), marker: process.env.FIXTURE_MARKER }));\n`;
  await writeFile(join(bin, 'npm-cli.js'), fixture);
  await writeFile(join(bin, 'npx-cli.js'), fixture);
  const env = { ...process.env, npm_execpath: join(bin, 'npm-cli.js'), FIXTURE_RESULT: received, FIXTURE_MARKER: 'kept' };
  for (const tool of ['npm', 'npx']) {
    const args = ['a value', '--flag=two words', 'literal$()'];
    const invocation = packageManagerInvocation(tool, args, { env, execPath: process.execPath });
    assert.equal(invocation.command, process.execPath);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, { env, stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`fixture exited ${code}`)));
    });
    assert.equal(result, undefined);
    const payload = JSON.parse(await readFile(received, 'utf8'));
    assert.deepEqual(payload, { args, marker: 'kept' });
  }
});

test('documented developer launchers set portable environment values and pass caller arguments', () => {
  const env = { npm_execpath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', PLAYWRIGHT_PORT: '', FAKE_RUNTIME_PORT: '' };
  const checkout = resolveDeveloperCommand('checkout', ['--passWithNoTests'], env);
  assert.equal(checkout.env.VITEST_LANE, 'checkout');
  assert.deepEqual(checkout.invocation.args.slice(1), ['vitest', 'run', '--config', 'config/testing/vitest.config.ts', '--passWithNoTests']);
  const timeline = resolveDeveloperCommand('timeline', ['tests/e2e/timeline/', '--grep', 'touch'], env);
  assert.equal(timeline.env.PLAYWRIGHT_TIMELINE_DEVICES, '1');
  assert.equal(timeline.env.PLAYWRIGHT_PORT, '');
  assert.equal(timeline.env.FAKE_RUNTIME_PORT, '');
  assert.deepEqual(timeline.invocation.args.slice(1), [
    'playwright', 'test', '--config', 'playwright.config.ts', '--project=timeline-devices', '--workers=1', 'tests/e2e/timeline/', '--grep', 'touch',
  ]);
  const allTimelineSpecs = resolveDeveloperCommand('timeline', [], env);
  assert.deepEqual(allTimelineSpecs.invocation.args.slice(1), [
    'playwright', 'test', '--config', 'playwright.config.ts', '--project=timeline-devices', '--workers=1',
  ]);
  const chromeExport = resolveDeveloperCommand('timeline-chrome-export', [], env);
  assert.equal(chromeExport.env.PLAYWRIGHT_TIMELINE_DEVICES, '1');
  assert.equal(chromeExport.env.PLAYWRIGHT_PORT, '');
  assert.equal(chromeExport.env.FAKE_RUNTIME_PORT, '');
  assert.deepEqual(chromeExport.invocation.args.slice(1), [
    'playwright', 'test', '--config', 'playwright.config.ts', '--project=timeline-chrome-export', '--workers=1',
  ]);
  const matrix = resolveDeveloperCommand('acceptance-matrix', [], { ASTRID_APP_ACCEPTANCE_MATRIX: '0' });
  assert.equal(matrix.env.ASTRID_APP_ACCEPTANCE_MATRIX, '1');
});

test('Windows npm command resolution selects the adjacent JavaScript entrypoint', () => {
  const windowsNpm = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const invocation = packageManagerInvocation('npx', ['tsx', 'scripts/astrid-local-connector.ts'], {
    env: { npm_execpath: windowsNpm },
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    platform: 'win32',
    exists: (path) => path === windowsNpm.replace('npm-cli.js', 'npx-cli.js'),
  });
  assert.equal(invocation.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(invocation.args, [windowsNpm.replace('npm-cli.js', 'npx-cli.js'), 'tsx', 'scripts/astrid-local-connector.ts']);
});

test('Windows PATH shims and non-npm launchers are resolved to npm JavaScript files', () => {
  const shimNpx = 'C:\\Tools\\node_modules\\npm\\bin\\npx-cli.js';
  const invocation = packageManagerInvocation('npx', ['tsx'], {
    env: { npm_execpath: 'C:\\Program Files\\bun\\bun.exe', Path: 'C:\\Tools;C:\\Program Files\\nodejs' },
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    platform: 'win32',
    realpath: (path) => {
      if (path === 'C:\\Tools\\npx.cmd') return path;
      throw new Error('not a fixture shim');
    },
    exists: (path) => path === shimNpx,
  });
  assert.equal(invocation.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(invocation.args, [shimNpx, 'tsx']);
});

test('Node installation layout fallback finds npm and npx entrypoints beside node.exe', () => {
  const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const npxCli = npmCli.replace('npm-cli.js', 'npx-cli.js');
  const invocation = packageManagerInvocation('npx', ['playwright'], {
    env: { npm_execpath: 'C:\\Program Files\\bun\\bun.exe' },
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    platform: 'win32',
    exists: (path) => path === npxCli,
  });
  assert.deepEqual(invocation.args, [npxCli, 'playwright']);
});
