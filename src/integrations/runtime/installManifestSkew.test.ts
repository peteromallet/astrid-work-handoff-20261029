import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNTIME_ACCEPTED_SCHEMA_DIGESTS } from './contract-metadata.ts';

const read = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'));

/**
 * astrid.haus (this App) must never move ahead of what the installer hands out: the Runtime that
 * `public/install-manifest.json` pins has to speak a schema this App accepts, or a clean install fails on first connect.
 */
describe('the installer-pinned Runtime and this App', () => {
  const { runtime } = read('public/install-manifest.json') as { runtime: { sha: string; schema_digest: string } };

  it('speaks a schema digest this App accepts', () => {
    expect(runtime.schema_digest, 'install-manifest.json runtime needs schema_digest').toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(RUNTIME_ACCEPTED_SCHEMA_DIGESTS as readonly string[]).toContain(runtime.schema_digest);
  });
});
