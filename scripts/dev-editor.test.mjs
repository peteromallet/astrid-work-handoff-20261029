import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { packageManagerInvocation } from './node-package-manager.mjs';
import { terminateProcessTree } from './terminate-process-tree.mjs';
import { listenOnTestPort } from './test-port.mjs';

async function waitUntil(predicate, description) {
  const end = Date.now() + 15_000;
  while (!predicate()) {
    assert(Date.now() < end, `timed out waiting for ${description}`);
    await delay(25);
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

test('Runtime exit internally shuts down the editor npm shell and descendant server', { timeout: 25_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'astrid-dev-editor-tree-'));
  const pids = join(root, 'pids.jsonl');
  const ready = join(root, 'ready');
  const stopRuntime = join(root, 'stop-runtime');
  const reservation = createServer();
  const port = await listenOnTestPort(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'tests/e2e/fake-runtime'), { recursive: true });
  for (const script of ['dev-editor.mjs', 'node-package-manager.mjs', 'terminate-process-tree.mjs']) {
    copyFileSync(new URL(script, import.meta.url), join(root, 'scripts', script));
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { dev: 'node middle.mjs' } }));
  writeFileSync(join(root, 'tests/e2e/fake-runtime/launch.mjs'), `
import { appendFileSync, existsSync, watch } from 'node:fs';
export const fakeRuntimeEnv = () => ({});
if (process.argv.includes('--serve')) {
  appendFileSync(process.env.TREE_PIDS, JSON.stringify({ kind: 'runtime', pid: process.pid }) + '\\n');
  const watcher = watch(process.cwd(), () => { if (existsSync(process.env.STOP_RUNTIME)) process.exit(7); });
}
`);
  writeFileSync(join(root, 'middle.mjs'), `
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.TREE_PIDS, JSON.stringify({ kind: 'middle', pid: process.pid }) + '\\n');
spawn(process.execPath, ['server.mjs'], { stdio: 'inherit' });
setInterval(() => {}, 1000);
`);
  writeFileSync(join(root, 'server.mjs'), `
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
appendFileSync(process.env.TREE_PIDS, JSON.stringify({ kind: 'server', pid: process.pid }) + '\\n');
createServer((_request, response) => response.end('editor')).listen(Number(process.env.PORT), '127.0.0.1', () => writeFileSync(process.env.TREE_READY, 'ready'));
`);
  const npm = packageManagerInvocation('npm', []);
  const child = spawn(process.execPath, ['scripts/dev-editor.mjs'], {
    cwd: root, detached: process.platform !== 'win32',
    env: { ...process.env, npm_execpath: npm.args[0], PORT: String(port), VITE_ASTRID_BRIDGE_PORT: String(port), TREE_PIDS: pids, TREE_READY: ready, STOP_RUNTIME: stopRuntime },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let closed = false;
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.once('close', () => { closed = true; });
  const records = () => existsSync(pids) ? readFileSync(pids, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  try {
    await waitUntil(() => existsSync(ready) || closed, 'descendant server readiness');
    assert(existsSync(ready), output);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'editor');
    assert.deepEqual(records().map(({ kind }) => kind).sort(), ['middle', 'runtime', 'server']);
    writeFileSync(stopRuntime, 'exit the Runtime without a console signal');
    await waitUntil(() => closed, `launcher closure: ${output}`);
    assert.equal(child.exitCode, 7, output);
    await assert.rejects(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }));
    await waitUntil(() => records().every(({ pid }) => !alive(pid)), 'descendant process termination');
  } finally {
    if (!closed) await terminateProcessTree(child);
    for (const { pid } of records()) {
      if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
