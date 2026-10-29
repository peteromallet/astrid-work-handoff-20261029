import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { win32 } from 'node:path';
import { test } from 'node:test';
import { terminateProcessTree } from './terminate-process-tree.mjs';

const liveChild = () => ({ pid: 12345, exitCode: null, signalCode: null, kill() { assert.fail('must not kill the root first'); } });

test('Windows taskkill includes the live root and its descendants before shutdown completes', async () => {
  const killer = new EventEmitter();
  let completed = false;
  const stopping = terminateProcessTree(liveChild(), 'SIGINT', {
    platform: 'win32',
    spawnProcess(command, args, options) {
      assert.equal(command, win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'));
      assert.deepEqual(args, ['/PID', '12345', '/T', '/F']);
      assert.deepEqual(options, { stdio: 'ignore', windowsHide: true });
      return killer;
    },
  }).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false, 'must wait for taskkill before waiting for service close');
  killer.emit('close', 0);
  await stopping;
  assert.equal(completed, true);
});

test('Windows taskkill failures for a live root are reported', async () => {
  const killer = new EventEmitter();
  const stopping = terminateProcessTree(liveChild(), 'SIGTERM', { platform: 'win32', spawnProcess: () => killer });
  killer.emit('close', 1);
  await assert.rejects(stopping, /taskkill failed for process 12345/);
});

test('Windows tolerates a root exiting while taskkill runs', async () => {
  const child = liveChild();
  const killer = new EventEmitter();
  const stopping = terminateProcessTree(child, 'SIGTERM', { platform: 'win32', spawnProcess: () => killer });
  child.exitCode = 0;
  killer.emit('close', 128);
  await stopping;
});

test('Windows taskkill spawn errors are reported', async () => {
  const killer = new EventEmitter();
  const stopping = terminateProcessTree(liveChild(), 'SIGTERM', { platform: 'win32', spawnProcess: () => killer });
  killer.emit('error', new Error('cannot launch taskkill'));
  await assert.rejects(stopping, /cannot launch taskkill/);
});

test('unstarted children and exited Windows roots do not launch taskkill', async () => {
  const options = { platform: 'win32', spawnProcess() { assert.fail('no live root'); } };
  await terminateProcessTree({ pid: undefined }, 'SIGTERM', options);
  await terminateProcessTree({ ...liveChild(), exitCode: 0 }, 'SIGTERM', options);
  await terminateProcessTree({ ...liveChild(), signalCode: 'SIGTERM' }, 'SIGTERM', options);
});

test('POSIX shutdown signals the owned process group even after its leader exits', async () => {
  const calls = [];
  await terminateProcessTree({ ...liveChild(), exitCode: 0 }, 'SIGINT', {
    platform: 'linux', killProcess: (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [[-12345, 'SIGINT']]);
});

test('POSIX shutdown tolerates a departed group and reports other failures', async () => {
  await terminateProcessTree(liveChild(), 'SIGTERM', {
    platform: 'linux', killProcess() { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); },
  });
  await assert.rejects(terminateProcessTree(liveChild(), 'SIGTERM', {
    platform: 'linux', killProcess() { throw Object.assign(new Error('denied'), { code: 'EPERM' }); },
  }), /denied/);
});
