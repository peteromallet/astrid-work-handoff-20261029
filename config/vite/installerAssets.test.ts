import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSTALLER_ASSETS } from './installerAssets.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installScript = path.join(repositoryRoot, 'public/install.sh');

describe('public installer assets', () => {
  it('serves install.sh as plain text and keeps it valid POSIX shell', () => {
    expect(INSTALLER_ASSETS['/install.sh']).toEqual({
      file: 'install.sh',
      contentType: 'text/plain; charset=utf-8',
    });
    expect(readFileSync(installScript, 'utf8')).toBe(
      '#!/bin/sh\n# Astrid\'s Mac and Linux installer lives at /install; this name is kept for people who guess it.\ncurl -fsSL https://astrid.haus/install | sh -s -- "$@"\n',
    );
    execFileSync('sh', ['-n', installScript]);
  });
});
