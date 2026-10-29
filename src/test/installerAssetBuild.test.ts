// @vitest-environment node
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createInstallerAssetsPlugin, INSTALLER_ASSETS } from '../../config/vite/installerAssets.ts';

const installerNames = Object.values(INSTALLER_ASSETS).map(({ file }) => file);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('installer asset build output', () => {
  it('copies each actual public asset unchanged into a real Vite build', async () => {
    const sourcePublicDir = path.resolve(__dirname, '../../public');
    const fixtureRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'astrid-installer-build-')));
    temporaryDirectories.push(fixtureRoot);
    const fixturePublicDir = path.join(fixtureRoot, 'public');
    await mkdir(fixturePublicDir);
    await writeFile(path.join(fixtureRoot, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
    for (const file of installerNames) await cp(path.join(sourcePublicDir, file), path.join(fixturePublicDir, file));

    await viteBuild({
      configFile: false,
      root: fixtureRoot,
      publicDir: fixturePublicDir,
      plugins: [createInstallerAssetsPlugin()],
      logLevel: 'silent',
      build: { outDir: path.join(fixtureRoot, 'dist'), emptyOutDir: true },
    });

    for (const file of installerNames) {
      const source = await readFile(path.join(sourcePublicDir, file));
      const built = await readFile(path.join(fixtureRoot, 'dist', file));
      expect(built).toEqual(source);
    }
  });
});
