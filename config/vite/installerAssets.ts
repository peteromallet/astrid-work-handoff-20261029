import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

const CACHE_CONTROL = 'public, max-age=60, must-revalidate';
const NOT_FOUND_BODY = 'Not found';

export const INSTALLER_ASSETS = {
  '/install': { file: 'install', contentType: 'text/plain; charset=utf-8' },
  '/install.sh': { file: 'install.sh', contentType: 'text/plain; charset=utf-8' },
  '/install.ps1': { file: 'install.ps1', contentType: 'text/plain; charset=utf-8' },
  '/install-manifest.json': { file: 'install-manifest.json', contentType: 'application/json; charset=utf-8' },
} as const;

type DevMiddlewareServer = { middlewares: Connect.Server; config: { publicDir: string | false } };
type PreviewMiddlewareServer = { middlewares: Connect.Server; config: { root: string; build: { outDir: string } } };

function registerInstallerAssetMiddleware(server: { middlewares: Connect.Server }, assetDirectory: string | false): void {
  server.middlewares.use((request, response, next) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://vite.local').pathname;
    } catch {
      return next();
    }
    const asset = INSTALLER_ASSETS[pathname as keyof typeof INSTALLER_ASSETS];
    if (!asset) return next();

    response.setHeader('Cache-Control', CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Allow', 'GET, HEAD');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Method not allowed');
      return;
    }
    if (!assetDirectory) {
      response.statusCode = 404;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(NOT_FOUND_BODY);
      return;
    }

    void readFile(path.join(assetDirectory, asset.file)).then((body) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', asset.contentType);
      response.setHeader('Content-Length', String(body.byteLength));
      response.end(request.method === 'HEAD' ? undefined : body);
    }).catch((error: unknown) => {
      response.statusCode = (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 404 : 500;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(response.statusCode === 404 ? NOT_FOUND_BODY : 'Unable to read installer asset');
    });
  });
}

/** Serve the public installer entry points with explicit MIME and cache headers in dev and preview. */
export function createInstallerAssetsPlugin(): Plugin {
  return {
    name: 'astrid-installer-assets',
    configureServer: (server: DevMiddlewareServer) => {
      registerInstallerAssetMiddleware(server, server.config.publicDir);
    },
    configurePreviewServer: (server: PreviewMiddlewareServer) => {
      registerInstallerAssetMiddleware(server, path.resolve(server.config.root, server.config.build.outDir));
    },
  };
}
