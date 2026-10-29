import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_SCHEMA_DIGEST } from '@/integrations/runtime/contract-metadata.ts';
import WelcomeConnection from './WelcomeConnection.tsx';

const mocks = vi.hoisted(() => ({
  origin: '',
  prepareStarterProject: vi.fn(),
}));

vi.mock('@/integrations/runtime/connection.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/runtime/connection.ts')>();
  return { ...actual, runtimeOrigin: () => mocks.origin };
});
vi.mock('./prepareStarterProject.ts', () => ({ prepareStarterProject: mocks.prepareStarterProject }));

const REALM = { realm_id: 'realm-local-test', display_name: 'Local Test' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  cleanup();
  // Model the localhost hosted-mode preview: a Runtime origin is configured, but it is the page's own origin.
  mocks.origin = window.location.origin;
  mocks.prepareStarterProject.mockReset().mockReturnValue(new Promise(() => {}));
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  );
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: 'prompt', onchange: null })) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('same-origin WelcomeConnection', () => {
  it('keeps the project handoff gated until a real local Runtime answers, without querying browser permission', async () => {
    let completedHealthProbes = 0;
    const fetchImpl = vi.fn(async () => {
      completedHealthProbes += 1;
      return json({ error: 'runtime_unavailable' }, 503);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const permissionQuery = vi.mocked(navigator.permissions.query);

    render(<WelcomeConnection />);
    await waitFor(() => expect(completedHealthProbes).toBe(1));
    expect(screen.getByTestId('runtime-not-connected')).toBeInTheDocument();
    expect(screen.queryByRole('main', { name: 'Opening your project' })).not.toBeInTheDocument();
    expect(mocks.prepareStarterProject).not.toHaveBeenCalled();

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(completedHealthProbes).toBe(2));
    expect(screen.getByTestId('runtime-not-connected')).toHaveAttribute('data-state', 'not_running');
    expect(screen.queryByRole('main', { name: 'Opening your project' })).not.toBeInTheDocument();
    expect(mocks.prepareStarterProject).not.toHaveBeenCalled();
    expect(permissionQuery).not.toHaveBeenCalled();
  });

  it('opens the project handoff after the proxied local Runtime health and realm checks succeed', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST });
      }
      if (url.endsWith('/v1/realm')) return json(REALM);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const permissionQuery = vi.mocked(navigator.permissions.query);

    render(<WelcomeConnection />);

    await waitFor(() => expect(mocks.prepareStarterProject).toHaveBeenCalledOnce());
    expect(screen.getByRole('main', { name: 'Opening your project' })).toBeInTheDocument();
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/runtime/v1/health',
      '/api/runtime/v1/realm',
    ]);
    expect(permissionQuery).not.toHaveBeenCalled();
  });

  it('probes the same-origin Runtime in an unsupported browser without requesting local-network permission', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Firefox/153.0');
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v1/health')) {
        return json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST });
      }
      if (String(input).endsWith('/v1/realm')) return json(REALM);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const permissionQuery = vi.mocked(navigator.permissions.query);

    render(<WelcomeConnection />);

    await waitFor(() => expect(mocks.prepareStarterProject).toHaveBeenCalledOnce());
    expect(screen.getByRole('main', { name: 'Opening your project' })).toBeInTheDocument();
    expect(permissionQuery).not.toHaveBeenCalled();
  });
});
