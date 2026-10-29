// @vitest-environment node
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMMUTABLE_OBJECT_CACHE_CONTROL, isImmutableObjectRead, objectCacheControl,
} from '../../../config/vite/objectCachePolicy.mjs';
import { createRuntimeProxyServer } from '../../../scripts/runtime-discovery-proxy.mjs';

const DIGEST = 'a'.repeat(64);
const OBJECT = `/v1/objects/sha256:${DIGEST}`;

describe('object cache policy', () => {
  it('makes only GET/HEAD of a digest-addressed object immutable and private', () => {
    expect(IMMUTABLE_OBJECT_CACHE_CONTROL).toBe('private, max-age=31536000, immutable');
    for (const path of [OBJECT, `/v1/objects/sha256%3A${DIGEST}`, `/v1/objects/${DIGEST}`, `/api/runtime${OBJECT}`, `${OBJECT}?x=1`]) {
      expect(isImmutableObjectRead('GET', path), path).toBe(true);
      expect(isImmutableObjectRead('HEAD', path), path).toBe(true);
    }
  });

  it.each([
    ['POST', OBJECT],
    ['PUT', OBJECT],
    ['GET', '/v1/objects/card'],
    ['GET', `/v1/objects/sha256:${'a'.repeat(63)}`],
    ['GET', `${OBJECT}/location`],
    ['GET', `/v1/projects/p/objects/sha256:${DIGEST}/location`],
    ['GET', '/v1/projects'],
    ['GET', '/v1/projects/p/timelines/t'],
    ['GET', '/v1/tasks/sha256'],
  ])('keeps %s %s no-store', (method, path) => {
    expect(isImmutableObjectRead(method, path)).toBe(false);
  });

  it('caches only successful object responses', () => {
    expect(objectCacheControl('GET', OBJECT, 200)).toBe(IMMUTABLE_OBJECT_CACHE_CONTROL);
    expect(objectCacheControl('GET', OBJECT, 206)).toBe(IMMUTABLE_OBJECT_CACHE_CONTROL);
    expect(objectCacheControl('GET', OBJECT, 304)).toBe(IMMUTABLE_OBJECT_CACHE_CONTROL);
    for (const status of [404, 416, 500, 502, 503, 504]) expect(objectCacheControl('GET', OBJECT, status)).toBeUndefined();
  });
});

describe('dev runtime discovery proxy', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => { await Promise.all(cleanup.splice(0).map((fn) => fn())); });

  const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
  const close = (server: Server) => async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); };

  async function venue(handler: Parameters<typeof createServer>[1], timeouts: { connectTimeoutMs?: number; idleTimeoutMs?: number } = {}) {
    const runtime = createServer(handler);
    const runtimePort = await listen(runtime);
    cleanup.push(close(runtime));
    const directory = await mkdtemp(join(tmpdir(), 'runtime-proxy-test-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'token'), 'local-token');
    await writeFile(join(directory, 'discovery.json'), JSON.stringify({ endpoint: `http://127.0.0.1:${runtimePort}`, credential_file: join(directory, 'token') }));
    const proxy = createRuntimeProxyServer({ discoveryPath: join(directory, 'discovery.json'), ...timeouts });
    const port = await listen(proxy);
    cleanup.push(close(proxy));
    return (path: string, method = 'GET', headers: Record<string, string> = {}) => new Promise<{ status: number; headers: IncomingHttpHeaders; body: string; error?: Error }>((resolve) => {
      const call = request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        const finish = (error?: Error) => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString(), error });
        res.on('end', () => finish());
        res.on('error', finish);
        res.on('aborted', () => finish(new Error('aborted')));
      });
      call.end();
    });
  }

  // Mirrors the Runtime: always no-store, strong digest ETag, byte ranges.
  const runtimeObject: Parameters<typeof createServer>[1] = (req, res) => {
    const bytes = Buffer.from('0123456789');
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : bytes.length - 1;
    const base = { 'Cache-Control': 'no-store', 'Content-Type': 'audio/mpeg', ETag: `"sha256:${DIGEST}"`, 'Accept-Ranges': 'bytes' };
    if (req.url?.startsWith('/v1/objects/')) {
      res.writeHead(range ? 206 : 200, { ...base, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
      res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
    } else {
      res.writeHead(200, { ...base, 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    }
  };

  it('serves a digest object as cacheable with range support, and keeps API JSON no-store', async () => {
    const get = await venue(runtimeObject);
    const full = await get(OBJECT);
    expect(full).toMatchObject({ status: 200, body: '0123456789' });
    expect(full.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers.etag).toBe(`"sha256:${DIGEST}"`);

    const part = await get(OBJECT, 'GET', { Range: 'bytes=2-4' });
    expect(part).toMatchObject({ status: 206, body: '234' });
    expect(part.headers['content-range']).toBe('bytes 2-4/10');
    expect(part.headers['cache-control']).toBe('private, max-age=31536000, immutable');

    expect((await get(OBJECT, 'HEAD')).headers['cache-control']).toBe('private, max-age=31536000, immutable');

    for (const path of ['/v1/projects', '/v1/objects/card', `/v1/projects/p/objects/sha256:${DIGEST}/location`]) {
      const other = await get(path);
      expect(other.headers['cache-control'], path).toBe('no-store');
    }
  });

  it('logs one upstream error line without the query string when the Runtime drops the socket', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanup.push(async () => { errorSpy.mockRestore(); });
    const get = await venue((req) => { req.socket.destroy(); });
    const reply = await get('/v1/projects/p?token=secret');
    expect(reply.status).toBe(503);
    const lines = errorSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('runtime proxy upstream error'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^runtime proxy upstream error \d{4}-\d{2}-\d{2}T\S+ GET \/v1\/projects\/p code=ECONNRESET message=socket hang up reusedSocket=(true|false) elapsedMs=\d+ inFlight=1$/);
    expect(lines[0]).not.toContain('token');
    expect(lines[0]).not.toContain('secret');
  });

  it('does not cache a failed object read', async () => {
    const get = await venue((_req, res) => { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('{}'); });
    expect((await get(OBJECT)).headers['cache-control']).toBe('no-store');
  });

  it('lets a slow but steadily streaming response run past the idle window', async () => {
    const get = await venue((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      let sent = 0;
      const tick = setInterval(() => {
        res.write('x');
        if (++sent === 8) { clearInterval(tick); res.end(); }
      }, 60);
      res.on('close', () => clearInterval(tick));
    }, { idleTimeoutMs: 200 });
    // 8 chunks x 60ms = ~480ms of wall clock, well past the 200ms idle window.
    expect(await get(OBJECT)).toMatchObject({ status: 200, body: 'xxxxxxxx' });
  });

  it('times out an upstream that goes silent before responding with 504, not 503', async () => {
    const get = await venue(() => { /* never answers */ }, { idleTimeoutMs: 150 });
    expect(await get(OBJECT)).toMatchObject({ status: 504 });
  });

  it('cuts a stream that stalls after it started', async () => {
    const get = await venue((_req, res) => { res.writeHead(200); res.write('x'); }, { idleTimeoutMs: 150 });
    const result = await get(OBJECT);
    expect(result.body).toBe('x');
    expect(result.error).toBeDefined();
  });

  it('answers 503 when the Runtime is unreachable', async () => {
    const dead = createServer();
    const deadPort = await listen(dead);
    await close(dead)();
    const directory = await mkdtemp(join(tmpdir(), 'runtime-proxy-test-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'token'), 't');
    await writeFile(join(directory, 'discovery.json'), JSON.stringify({ endpoint: `http://127.0.0.1:${deadPort}`, credential_file: join(directory, 'token') }));
    const proxy = createRuntimeProxyServer({ discoveryPath: join(directory, 'discovery.json') });
    const port = await listen(proxy);
    cleanup.push(close(proxy));
    const status = await new Promise<number>((resolve) => request({ hostname: '127.0.0.1', port, path: '/v1/health' }, (res) => { res.resume(); resolve(res.statusCode!); }).end());
    expect(status).toBe(503);
  });
});
