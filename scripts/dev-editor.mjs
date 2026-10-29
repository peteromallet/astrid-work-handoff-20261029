#!/usr/bin/env node
/**
 * `npm run dev:editor` — the timeline in a browser, with no cloud backend and no install beyond `npm ci`.
 *
 * Spawns the fake Runtime (`tests/e2e/fake-runtime/launch.mjs --serve`: the demo project and timeline seeded
 * from the same fixtures the e2e suite uses, saves held in memory) plus the Vite dev server, and prints the
 * Runtime-mode editor URL that the e2e specs use. `localTest=1` suppresses unrelated authenticated-service
 * queries.
 */
import { spawn } from 'node:child_process';
import { packageManagerInvocation } from './node-package-manager.mjs';
import { terminateProcessTree } from './terminate-process-tree.mjs';

import { fakeRuntimeEnv } from '../tests/e2e/fake-runtime/launch.mjs';

const PORT = process.env.PORT ?? '2222';
const RUNTIME_PORT = Number(process.env.VITE_ASTRID_BRIDGE_PORT ?? '17334');
const EDITOR_QUERY = new URLSearchParams({
  project: 'demo-project-id',
  timeline: 'demo-timeline',
  localTest: '1',
});
const EDITOR_URL = `http://127.0.0.1:${PORT}/tools/video-editor?${EDITOR_QUERY}`;

const env = {
  ...process.env,
  PORT,
  // The fake Runtime's port, token file and identity; the Vite proxies read the same values, so the browser
  // never sees the bearer token.
  ...fakeRuntimeEnv({ port: RUNTIME_PORT }),
};

const children = [
  spawn(process.execPath, ['tests/e2e/fake-runtime/launch.mjs', '--serve'], { stdio: 'inherit', env, detached: process.platform !== 'win32' }),
  (() => {
    const invocation = packageManagerInvocation('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', PORT], { env });
    return spawn(invocation.command, invocation.args, { stdio: 'inherit', env, detached: process.platform !== 'win32' });
  })(),
];

console.log([
  '',
  'Timeline dev environment',
  `  editor : ${EDITOR_URL}`,
  `  runtime: http://127.0.0.1:${RUNTIME_PORT} (fake Runtime, demo project, in-memory saves)`,
  '',
].join('\n'));

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  void Promise.all(children.map((child) => terminateProcessTree(child, signal))).catch((error) => {
    console.error(`Could not stop the dev environment: ${error.message}`);
    process.exitCode = 1;
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// If either process dies the other is useless — take the whole thing down.
for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown) process.exitCode = code ?? 0;
    shutdown('SIGTERM');
  });
}
