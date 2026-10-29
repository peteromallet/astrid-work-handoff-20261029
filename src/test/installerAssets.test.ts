// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstallerAssetsPlugin, INSTALLER_ASSETS } from '../../config/vite/installerAssets.ts';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

type TestResult = {
  nextCalled: boolean;
  statusCode: number;
  headers: Map<string, string>;
  body: Buffer;
};

async function callMiddleware(handler: Connect.NextHandleFunction, method: string, url: string): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const headers = new Map<string, string>();
    const chunks: Buffer[] = [];
    let statusCode = 200;
    let settled = false;
    const finish = (nextCalled: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ nextCalled, statusCode, headers, body: Buffer.concat(chunks) });
    };
    const response = {
      get statusCode() { return statusCode; },
      set statusCode(value: number) { statusCode = value; },
      setHeader: (name: string, value: string | number) => headers.set(name.toLowerCase(), String(value)),
      end: (chunk?: string | Buffer) => {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        finish(false);
      },
    } as unknown as ServerResponse;
    const request = { method, url } as IncomingMessage;
    try {
      handler(request, response, (error?: unknown) => {
        if (error) {
          settled = true;
          reject(error);
        } else finish(true);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function createMiddleware(
  publicDir: string,
  options: { preview?: boolean; root?: string; outDir?: string } = {},
): Promise<Connect.NextHandleFunction> {
  let handler: Connect.NextHandleFunction | undefined;
  const stack = {
    use: vi.fn((candidate: Connect.NextHandleFunction) => { handler = candidate; }),
  } as unknown as Connect.Server;
  const plugin = createInstallerAssetsPlugin() as Plugin & {
    configureServer: (server: { middlewares: Connect.Server; config: { publicDir: string | false } }) => void;
    configurePreviewServer: (server: { middlewares: Connect.Server; config: { root: string; build: { outDir: string } } }) => void;
  };
  if (options.preview) {
    plugin.configurePreviewServer({
      middlewares: stack,
      config: { root: options.root ?? path.dirname(publicDir), build: { outDir: options.outDir ?? 'dist' } },
    });
  } else {
    plugin.configureServer({ middlewares: stack, config: { publicDir } });
  }
  if (!handler) throw new Error('Installer middleware was not registered');
  return handler;
}

describe('installer asset serving', () => {
  it('serves installer scripts and manifest with explicit content types and short caching', async () => {
    const publicDir = await temporaryDirectory('astrid-installer-assets-');
    const expected = new Map<string, { contentType: string; bytes: Buffer }>();
    for (const [url, asset] of Object.entries(INSTALLER_ASSETS)) {
      const bytes = Buffer.from(`bytes for ${asset.file}\n`, 'utf8');
      await writeFile(path.join(publicDir, asset.file), bytes);
      expected.set(url, { contentType: asset.contentType, bytes });
    }
    const handler = await createMiddleware(publicDir);

    for (const [url, asset] of expected) {
      const response = await callMiddleware(handler, 'GET', `${url}?download=1`);
      expect(response.nextCalled).toBe(false);
      expect(response.statusCode).toBe(200);
      expect(response.headers.get('content-type')).toBe(asset.contentType);
      expect(response.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.body).toEqual(asset.bytes);
    }
  });

  it('returns 404 for a missing reserved installer path instead of reaching the SPA fallback', async () => {
    const publicDir = await temporaryDirectory('astrid-installer-missing-');
    const handler = await createMiddleware(publicDir);

    const response = await callMiddleware(handler, 'GET', '/install.ps1');

    expect(response.nextCalled).toBe(false);
    expect(response.statusCode).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.body.toString('utf8')).toBe('Not found');
  });

  it('serves built installer assets in preview when the public source directory is absent', async () => {
    const root = await temporaryDirectory('astrid-installer-preview-');
    const publicDir = path.join(root, 'public-source-absent');
    const outDir = path.join(root, 'dist');
    await mkdir(outDir);
    const manifest = Buffer.from('{"version":1}\n');
    await writeFile(path.join(outDir, 'install-manifest.json'), manifest);
    const handler = await createMiddleware(publicDir, { preview: true, root, outDir: 'dist' });

    const response = await callMiddleware(handler, 'GET', '/install-manifest.json');

    expect(response.nextCalled).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(response.body).toEqual(manifest);
  });

  it('preserves normal Vite fallback for paths outside the reserved installer routes', async () => {
    const publicDir = await temporaryDirectory('astrid-installer-fallback-');
    const handler = await createMiddleware(publicDir);

    const response = await callMiddleware(handler, 'GET', '/install-guide');

    expect(response.nextCalled).toBe(true);
  });

});
