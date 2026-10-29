import { afterEach, describe, expect, it } from 'vitest';
import { skipWhen } from '@/test/declaredSkip';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { createRuntimeProxyServer, currentChat } from '../../../scripts/runtime-discovery-proxy.mjs';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('agent-owned chat discovery', () => {
  function fixture() {
    const directory = mkdtempSync(join(tmpdir(), 'astrid-chat-proxy-'));
    directories.push(directory);
    return { path: join(directory, 'chat.json'), discovery: join(directory, 'discovery.json') };
  }

  it('follows endpoint and credential changes on every request', () => {
    const { path, discovery } = fixture();
    for (const port of [17335, 19191]) {
      writeFileSync(path, JSON.stringify({ endpoint: `http://127.0.0.1:${port}`, token: `token-${port}` }), { mode: 0o600 });
      const current = currentChat(discovery);
      expect(current.endpoint.origin).toBe(`http://127.0.0.1:${port}`);
      expect(current.token).toBe(`token-${port}`);
    }
  });

  it('fails closed for missing, malformed, remote, or credential-free registrations', () => {
    const { path, discovery } = fixture();
    expect(() => currentChat(discovery)).toThrow();
    for (const value of ['{', JSON.stringify({ endpoint: 'https://elsewhere.example', token: 'private' }),
      JSON.stringify({ endpoint: 'http://127.0.0.1:17335', token: '' }),
      JSON.stringify({ endpoint: 'http://127.0.0.1:17335/redirect', token: 'private' })]) {
      writeFileSync(path, value, { mode: 0o600 });
      expect(() => currentChat(discovery)).toThrow();
    }
  });

  it('refuses a registration readable by other users on POSIX', (ctx) => {
    skipWhen('posix-owner-only-modes', ctx);
    const { path, discovery } = fixture();
    writeFileSync(path, JSON.stringify({ endpoint: 'http://127.0.0.1:17335', token: 'private' }));
    chmodSync(path, 0o644);
    expect(() => currentChat(discovery)).toThrow(/owner-only/);
  });

  async function get(server: ReturnType<typeof createRuntimeProxyServer>, url: string) {
    const incoming = Object.assign(Readable.from([]), { method: 'GET', url, headers: { authorization: 'Bearer browser-value' } });
    const response = Object.assign(new PassThrough(), { status: 0, writeHead(status: number) { this.status = status; } });
    let body = '';
    response.on('data', chunk => { body += chunk.toString(); });
    const done = new Promise<void>(resolve => response.on('finish', resolve));
    server.emit('request', incoming, response);
    await done;
    return { status: response.status, body };
  }

  it('forwards ACP through the current registration with a service credential and protocol header', async () => {
    const { path, discovery } = fixture();
    const requests: Array<{ port: number; path: string; headers: Record<string, string> }> = [];
    const timeouts: number[] = [];
    const proxy = createRuntimeProxyServer({ discoveryPath: discovery, request: (options, ready) => {
      requests.push(options);
      const outgoing = Object.assign(new PassThrough(), { setTimeout(milliseconds: number) { timeouts.push(milliseconds); } });
      queueMicrotask(() => {
        ready(Object.assign(Readable.from(['{"status":"ok"}']), { statusCode: 200, headers: {} }));
        outgoing.emit('socket', { connecting: false });
        outgoing.emit('close');
      });
      return outgoing;
    } });
    for (const port of [17335, 19191]) {
      writeFileSync(path, JSON.stringify({ endpoint: `http://127.0.0.1:${port}`, token: `token-${port}` }), { mode: 0o600 });
      expect(await get(proxy, '/acp/health')).toEqual({ status: 200, body: '{"status":"ok"}' });
      expect(requests.at(-1)).toMatchObject({ port, path: '/health', headers: {
        authorization: `Bearer token-${port}`, 'x-astrid-bridge-version': 'v1',
      } });
    }
    expect(timeouts).toEqual([300_000, 300_000]);
  });

  it('answers acp_unavailable without contacting an upstream when chat is absent', async () => {
    const { discovery } = fixture();
    const proxy = createRuntimeProxyServer({ discoveryPath: discovery, request: () => { throw new Error('unexpected upstream'); } });
    const response = await get(proxy, '/acp/health');
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ error: 'acp_unavailable' });
  });
});
