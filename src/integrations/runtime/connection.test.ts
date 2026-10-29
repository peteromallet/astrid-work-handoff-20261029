import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The origin is module state set once per page, so each case loads a fresh module.
type Connection = typeof import('./connection.ts');
let connection: Connection;

beforeEach(async () => {
  vi.resetModules();
  connection = await import('./connection.ts');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const GATEWAY = 'http://127.0.0.1:17340';
const IDENTITY = {
  VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID: 'astrid-product-connector',
  VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID: 'realm-r1',
  VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID: 'runtime-instance-r1',
};

function expectSameOrigin(c: Connection) {
  expect(c.runtimeOrigin()).toBe('');
  expect(c.runtimeApiBase()).toBe('/api/runtime');
  expect(c.astridBase()).toBe('/api/astrid');
  expect(c.isGatewayUrl('/api/runtime/v1/health')).toBe(false);
  expect(c.isGatewayUrl(`${GATEWAY}/api/runtime/v1/health`)).toBe(false);
  expect(c.isRuntimeMode('/api/runtime')).toBe(true);
  expect(c.isRuntimeMode('/api/astrid')).toBe(false);
}

describe('same-origin defaults', () => {
  it('before setRuntimeOrigin() runs, everything stays same-origin', () => {
    expectSameOrigin(connection);
  });

  it.each([
    ['unset', {}],
    ['empty', { VITE_RUNTIME_ORIGIN: '' }],
    ['blank', { VITE_RUNTIME_ORIGIN: '   ' }],
  ])('a build with VITE_RUNTIME_ORIGIN %s is same-origin', (_label, env) => {
    expect(connection.setRuntimeOrigin(env)).toBe('');
    expectSameOrigin(connection);
  });

  it('same-origin keeps working with a compiled Runtime identity (the dev:local path)', () => {
    expect(connection.setRuntimeOrigin(IDENTITY)).toBe('');
    expectSameOrigin(connection);
  });

  it('isRuntimeMode is false for a missing base', () => {
    expect(connection.isRuntimeMode(undefined)).toBe(false);
    expect(connection.isRuntimeMode(null)).toBe(false);
    expect(connection.isRuntimeMode('')).toBe(false);
  });
});

describe('gateway origin', () => {
  it('prefixes both bases with the gateway origin', () => {
    expect(connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY })).toBe(GATEWAY);
    expect(connection.runtimeOrigin()).toBe(GATEWAY);
    expect(connection.runtimeApiBase()).toBe(`${GATEWAY}/api/runtime`);
    expect(connection.astridBase()).toBe(`${GATEWAY}/api/astrid`);
  });

  it('normalizes a trailing slash and surrounding whitespace', () => {
    expect(connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: ` ${GATEWAY}/ ` })).toBe(GATEWAY);
    expect(connection.runtimeApiBase()).toBe(`${GATEWAY}/api/runtime`);
  });

  it('the bases are read at call time, so a reader captured before boot follows the origin', () => {
    const readBase = connection.runtimeApiBase;
    expect(readBase()).toBe('/api/runtime');
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(readBase()).toBe(`${GATEWAY}/api/runtime`);
  });

  it('isGatewayUrl matches only absolute URLs on the exact gateway origin', () => {
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(connection.isGatewayUrl(`${GATEWAY}/api/runtime/v1/objects/o1/content`)).toBe(true);
    expect(connection.isGatewayUrl(`${GATEWAY}/api/astrid/media/a.png`)).toBe(true);
    for (const url of [
      '/api/runtime/v1/objects/o1/content',
      'http://127.0.0.1:17341/api/runtime/x',
      'http://localhost:17340/api/runtime/x',
      'https://127.0.0.1:17340/api/runtime/x',
      'https://astrid.example/api/runtime/x',
      'https://cdn.example.com/storage/v1/object/public/a.png',
      'data:image/png;base64,AAAA',
      'blob:https://astrid.example/0f1e',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(connection.isGatewayUrl(url), String(url)).toBe(false);
    }
  });

  it('isRuntimeMode is true for the gateway Runtime base, not the same-origin one or the Astrid base', () => {
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(connection.isRuntimeMode(`${GATEWAY}/api/runtime`)).toBe(true);
    expect(connection.isRuntimeMode(`${GATEWAY}/api/runtime/`)).toBe(true);
    expect(connection.isRuntimeMode('/api/runtime')).toBe(false);
    expect(connection.isRuntimeMode(`${GATEWAY}/api/astrid`)).toBe(false);
  });

  it.each([
    'not a url',
    '127.0.0.1:17340',
    'ftp://127.0.0.1:17340',
    `${GATEWAY}/api`,
    `${GATEWAY}/?x=1`,
    `${GATEWAY}/#x`,
    'http://user:pw@127.0.0.1:17340',
  ])('refuses a malformed origin %s and stays same-origin', (value) => {
    expect(() => connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: value })).toThrow(/VITE_RUNTIME_ORIGIN/);
    expectSameOrigin(connection);
  });
});

describe('identity guard', () => {
  it('refuses a gateway origin combined with the full compiled Runtime identity', () => {
    expect(() => connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY, ...IDENTITY }))
      .toThrow(/compiled Runtime identity/);
    expectSameOrigin(connection);
  });

  it.each(Object.keys(IDENTITY))('refuses a gateway origin with only %s compiled in', (key) => {
    expect(() => connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY, [key]: 'x' }))
      .toThrow(new RegExp(key));
  });

  it('guards exactly the identity variables client.ts reads', () => {
    expect([...connection.RUNTIME_IDENTITY_ENV_KEYS].sort()).toEqual(Object.keys(IDENTITY).sort());
  });

  it('ignores blank identity values, as client.ts does', () => {
    expect(connection.setRuntimeOrigin({
      VITE_RUNTIME_ORIGIN: GATEWAY,
      VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID: '  ',
      VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID: '',
    })).toBe(GATEWAY);
  });

  it('reads import.meta.env by default: the hosted build connects to the gateway', () => {
    vi.stubEnv('VITE_RUNTIME_ORIGIN', GATEWAY);
    for (const key of connection.RUNTIME_IDENTITY_ENV_KEYS) vi.stubEnv(key, '');
    expect(connection.setRuntimeOrigin()).toBe(GATEWAY);
    expect(connection.runtimeApiBase()).toBe(`${GATEWAY}/api/runtime`);
  });

  it('reads import.meta.env by default: the guard sees the identity client.ts would compile in', () => {
    vi.stubEnv('VITE_RUNTIME_ORIGIN', GATEWAY);
    for (const [key, value] of Object.entries(IDENTITY)) vi.stubEnv(key, value);
    expect(() => connection.setRuntimeOrigin()).toThrow(/compiled Runtime identity/);
  });
});

describe('set once', () => {
  it('setting the same origin again is a no-op', () => {
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: `${GATEWAY}/` })).toBe(GATEWAY);
    expect(connection.runtimeOrigin()).toBe(GATEWAY);
  });

  it('changing the origin after boot throws and keeps the first one', () => {
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    expect(() => connection.setRuntimeOrigin({})).toThrow(/already set/);
    expect(connection.runtimeOrigin()).toBe(GATEWAY);
  });

  it('a same-origin boot cannot later switch to the gateway', () => {
    connection.setRuntimeOrigin({});
    expect(() => connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY })).toThrow(/already set/);
    expectSameOrigin(connection);
  });
});

describe('RUNTIME_QUERY_ROOTS', () => {
  // The list is the single source for the on-connect invalidation, so a root that no query uses is a dead
  // entry and a Runtime-reading root missing from it is a stale read. Each root is pinned to a real key here.
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) && !/__tests__/.test(full) ? [full] : [];
    });
  }

  it('names a query key root that exists in src, for every entry', () => {
    const sources = sourceFiles(join(process.cwd(), 'src')).map((file) => readFileSync(file, 'utf8'));
    for (const root of connection.RUNTIME_QUERY_ROOTS) {
      const asFirstElement = new RegExp(`\\[\\s*['"]${root}['"]\\s*[,\\]]`);
      expect(sources.some((text) => asFirstElement.test(text)), `no query key starts with '${root}'`).toBe(true);
    }
  });

  it('covers the Runtime read roots, and matches by root only', () => {
    for (const root of ['runtime', 'runtime-editor', 'runtime-tasks', 'runtime-final-videos']) {
      expect(connection.isRuntimeQueryKey([root, 'p1'])).toBe(true);
    }
    expect(connection.isRuntimeQueryKey(['shots', 'p1'])).toBe(false);
    expect(connection.isRuntimeQueryKey([])).toBe(false);
  });
});
