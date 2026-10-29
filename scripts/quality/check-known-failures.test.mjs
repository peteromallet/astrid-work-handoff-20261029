#!/usr/bin/env node

import { after, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkKnownFailures, MAX_SRC_ENTRIES } from './check-known-failures.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, '..', '..');
const gateScript = resolve(moduleDir, 'check-known-failures.mjs');
const tempRoots = [];
after(() => { for (const root of tempRoots) rmSync(root, { recursive: true, force: true }); });

function makeRepo(files) {
  const root = mkdtempSync(join(os.tmpdir(), 'known-failures-'));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return root;
}

describe('expected-failure marker ban', () => {
  it('sets the source allowance to zero', () => assert.equal(MAX_SRC_ENTRIES, 0));

  it('rejects an inverse marker in a source unit test', () => {
    const marker = ['it', '.fails'].join('');
    const result = checkKnownFailures({ repoRoot: makeRepo({ 'src/a.test.ts': `${marker}('case', () => {});` }) });
    assert.equal(result.srcCount, 1);
    assert.match(result.problems.join('\n'), /expected-failure markers are forbidden/);
  });

  it('rejects an expected-failure marker in a journey spec', () => {
    const marker = ['test', '.fail'].join('');
    const result = checkKnownFailures({ repoRoot: makeRepo({ 'tests/e2e/a.spec.ts': `${marker}('case', () => {});` }) });
    assert.match(result.problems.join('\n'), /expected-failure markers are forbidden/);
  });

  it('allows trees with no expected-failure markers', () => {
    const result = checkKnownFailures({ repoRoot: makeRepo({ 'tests/e2e/a.spec.ts': "test('case', () => {});" }) });
    assert.deepEqual(result.problems, []);
  });

  it('passes for this repository and exits 0 from its CLI entry point', () => {
    const result = checkKnownFailures({ repoRoot });
    assert.deepEqual(result.problems, []);
    const proc = spawnSync(process.execPath, [gateScript], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
  });
});
