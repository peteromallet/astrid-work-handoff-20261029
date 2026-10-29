import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_CLIENT_SCOPES } from './client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';

// The Runtime origin is module state set once per page, so each case loads fresh modules and
// builds its clients the way the App does: before boot has set the origin.
const GATEWAY = 'http://127.0.0.1:17340';

type ClientModule = typeof import('./client.ts');
type ConnectionModule = typeof import('./connection.ts');
let clientModule: ClientModule;
let connection: ConnectionModule;

function stubRuntime(urls: string[]) {
  const handler = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const path = new URL(url, 'http://localhost').pathname.replace(/^(\/api\/[^/]+)/, '');
    const body = path === '/v1/health'
      ? { status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1, runtime_instance_id: 'instance-gw' }
      : path === '/v1/handshake'
        ? { protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 's', actor_id: 'astrid-product', realm_id: 'realm-gw', scopes: [...RUNTIME_CLIENT_SCOPES], capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }
        : path === '/v1/realm'
          ? { realm_id: 'realm-gw', display_name: 'Direct Journey', version: 1, created_at: '2026-01-01T00:00:00Z' }
          : { items: [], next_cursor: null };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', handler);
  return handler;
}

beforeEach(async () => {
  vi.resetModules();
  clientModule = await import('./client.ts');
  connection = await import('./connection.ts');
});

afterEach(() => vi.unstubAllGlobals());

describe('AstridRuntimeClient base resolution', () => {
  it('a client built before the origin is set calls the gateway', async () => {
    const urls: string[] = [];
    stubRuntime(urls);
    const client = new clientModule.AstridRuntimeClient();
    expect(client.baseUrl).toBe('/api/runtime');

    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    await client.listProjects();

    expect(client.baseUrl).toBe(`${GATEWAY}/api/runtime`);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${GATEWAY}/api/runtime/v1/`)).toBe(true);
  });

  it('stays same-origin when no origin is configured', async () => {
    const urls: string[] = [];
    stubRuntime(urls);
    await new clientModule.AstridRuntimeClient().listProjects();

    // With no origin configured, a default client first reads the page's same-origin runtime config
    // (an absolute URL on window.location.origin); every other request is a relative /api/runtime call.
    const configUrl = new URL('/runtime-config/v1/workspace.json', window.location.origin).href;
    const runtimeUrls = urls.filter((url) => url !== configUrl);
    expect(urls.filter((url) => url === configUrl)).toHaveLength(1);
    expect(runtimeUrls.length).toBeGreaterThan(0);
    for (const url of runtimeUrls) expect(url.startsWith('/api/runtime/v1/')).toBe(true);
    // Nothing leaves the page's own origin.
    for (const url of urls) expect(new URL(url, window.location.origin).origin).toBe(window.location.origin);
  });

  it('does not read the same-origin runtime config once an origin is configured', async () => {
    const urls: string[] = [];
    stubRuntime(urls);
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    await new clientModule.AstridRuntimeClient().listProjects();
    expect(urls.some((url) => url.includes('/runtime-config/'))).toBe(false);
  });

  it('an explicit baseUrl wins over the configured origin', async () => {
    const urls: string[] = [];
    stubRuntime(urls);
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    const client = new clientModule.AstridRuntimeClient({ baseUrl: '/api/pinned' });
    await client.listProjects();
    expect(client.baseUrl).toBe('/api/pinned');
    for (const url of urls) expect(url.startsWith('/api/pinned/v1/')).toBe(true);
  });

  it('keeps one session slot per resolved base, whichever way the client was built', async () => {
    const urls: string[] = [];
    stubRuntime(urls);
    const early = new clientModule.AstridRuntimeClient();
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    const late = new clientModule.AstridRuntimeClient();
    const pinned = new clientModule.AstridRuntimeClient({ baseUrl: `${GATEWAY}/api/runtime` });
    const other = new clientModule.AstridRuntimeClient({ baseUrl: '/api/elsewhere' });

    await Promise.all([early, late, pinned, other].map((client) => client.ensureSession()));

    const handshakes = urls.filter((url) => url.endsWith('/v1/handshake'));
    expect(handshakes.filter((url) => url.startsWith(GATEWAY))).toHaveLength(1);
    expect(handshakes.filter((url) => url.startsWith('/api/elsewhere'))).toHaveLength(1);
  });

  it('objectContentUrl follows the configured origin', () => {
    const client = new clientModule.AstridRuntimeClient();
    expect(client.objectContentUrl('sha256:abc')).toBe('/api/runtime/v1/objects/sha256%3Aabc');
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(client.objectContentUrl('sha256:abc')).toBe(`${GATEWAY}/api/runtime/v1/objects/sha256%3Aabc`);
  });

  it('isRuntimeMode is true for the base a default client reports, on either origin', () => {
    expect(connection.isRuntimeMode(new clientModule.AstridRuntimeClient().baseUrl)).toBe(true);
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(connection.isRuntimeMode(new clientModule.AstridRuntimeClient().baseUrl)).toBe(true);
    expect(connection.isRuntimeMode(connection.astridBase())).toBe(false);
  });
});
