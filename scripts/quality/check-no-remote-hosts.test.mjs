import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

import { REMOTE_HOSTS, findRemoteHostReferences } from './check-no-remote-hosts.mjs';

const script = resolve(import.meta.dirname, 'check-no-remote-hosts.mjs');
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'check-no-remote-hosts-'));
after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

let fixtureCount = 0;
function fixture(files) {
  const root = join(temporaryDirectory, `fixture-${fixtureCount += 1}`);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe('check-no-remote-hosts', () => {
  it('covers the four hosts that must not appear in a build', () => {
    assert.deepEqual([...REMOTE_HOSTS].sort(), [
      'cdn.jsdelivr.net',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'unpkg.com',
    ]);
  });

  it('reports each remote host named in an html, css or js file, including nested ones', () => {
    const root = fixture({
      'index.html': '<link href="https://fonts.googleapis.com/css2?family=Inter">',
      'assets/app.css': '@font-face { src: url(https://fonts.gstatic.com/s/inter/v20/a.woff2) }',
      'assets/chunk.js': 'import("https://unpkg.com/three@0.160.0/build/three.module.js")',
      'assets/vendor.js': 'const cdn = "https://cdn.jsdelivr.net/npm/x";',
    });

    const hits = findRemoteHostReferences(root).map(({ file, host }) => `${file} ${host}`).sort();

    assert.deepEqual(hits, [
      'assets/app.css fonts.gstatic.com',
      'assets/chunk.js unpkg.com',
      'assets/vendor.js cdn.jsdelivr.net',
      'index.html fonts.googleapis.com',
    ]);
  });

  it('accepts a build that only names local font files', () => {
    const root = fixture({
      'index.html': '<link rel="preload" href="/fonts/inter/inter-latin-500-normal.woff2" as="font">',
      'assets/app.css': "@font-face { src: url('/assets/Inter-Regular-abc123.woff2') format('woff2') }",
    });

    assert.deepEqual(findRemoteHostReferences(root), []);
  });

  it('exits 1 and names the file when a remote host is present', () => {
    const root = fixture({ 'index.html': '<script src="https://unpkg.com/x"></script>' });

    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /index\.html: unpkg\.com/);
  });

  it('exits 0 for a clean build directory', () => {
    const root = fixture({ 'index.html': '<link rel="icon" href="/favicon.svg">' });

    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });

    assert.equal(result.status, 0);
  });

  it('exits 2 when the directory does not exist, rather than passing', () => {
    const result = spawnSync(process.execPath, [script, join(temporaryDirectory, 'missing')], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /is not a directory/);
  });
});
