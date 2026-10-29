// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://astrid.haus"}
/**
 * AuthContext on the hosted build: the Runtime boot gate is the session, not the bridge probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { POLL_INTERVAL_MS } from '@/integrations/runtime/RuntimeConnectionProvider';
import { RUNTIME_SCHEMA_DIGEST } from '@/integrations/runtime/contract-metadata';

const { probeBridgeSessionMock } = vi.hoisted(() => ({ probeBridgeSessionMock: vi.fn() }));
vi.mock('@/shared/auth/bridgeSession', () => ({
  probeBridgeSession: probeBridgeSessionMock,
  LOCAL_USER_ID: 'local-user',
}));

const GATEWAY = 'http://127.0.0.1:17340';

function stubGateway(health: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/health')) return health();
    if (url.endsWith('/v1/realm')) return new Response(JSON.stringify({ realm_id: 'r1', display_name: 'Direct Journey' }), { status: 200 });
    throw new Error(`unexpected ${url}`);
  });
  // The refusal check (a `no-cors` follow-up to a failed read) fails like a closed port here and is not a counted request.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => init?.mode === 'no-cors'
    ? Promise.reject(new TypeError('Failed to fetch'))
    : fetchMock(input));
  return fetchMock;
}

function stubPermission(state: string) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state, onchange: null })) },
  });
}

async function renderHosted() {
  vi.resetModules();
  const connection = await import('@/integrations/runtime/connection');
  connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
  const { AuthProvider, useAuth } = await import('../AuthContext');
  const { queryClient } = await import('@/app/providers/queryClient');
  function Consumer() {
    const { userId, isAuthenticated, isLoading } = useAuth();
    return (
      <div>
        <span data-testid="userId">{userId ?? 'null'}</span>
        <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
        <span data-testid="isLoading">{String(isLoading)}</span>
      </div>
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe('AuthProvider on the hosted build', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    // The hosted gate probes only supported desktop Chromium browsers.
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    );
    probeBridgeSessionMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'permissions');
  });

  it('resolves the local user from the gate when the Runtime is connected, without the bridge probe, and invalidates Runtime queries', async () => {
    stubPermission('granted');
    stubGateway(() => new Response(JSON.stringify({ status: 'ok', schema_digest: RUNTIME_SCHEMA_DIGEST }), { status: 200 }));
    const { queryClient } = await renderHosted();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByTestId('userId')).toHaveTextContent('local-user'));
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
    expect(probeBridgeSessionMock).not.toHaveBeenCalled();
    // The onConnected effect flushes after the DOM the waitFor above reads; under load it can land later.
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    const { predicate } = invalidate.mock.calls[0]![0] as { predicate: (query: { queryKey: unknown[] }) => boolean };
    expect(predicate({ queryKey: ['runtime', 'generation-variants'] })).toBe(true);
    expect(predicate({ queryKey: ['astrid-bridge', 'health'] })).toBe(false);
    expect(predicate({ queryKey: ['runtime-tasks', 'p1'] })).toBe(true);
    expect(predicate({ queryKey: ['runtime-editor', 'session', 'projects'] })).toBe(true);
    expect(predicate({ queryKey: ['shots', 'p1'] })).toBe(false);
  });

  it('is loading while the permission is read, then anonymous and not loading when the Runtime is not reachable', async () => {
    vi.useFakeTimers();
    const status: { state: string; onchange: ((this: unknown, event: Event) => unknown) | null } = {
      state: 'granted',
      onchange: null,
    };
    let resolvePermission!: (value: typeof status) => void;
    const permissionRead = new Promise<typeof status>((resolve) => { resolvePermission = resolve; });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn(() => permissionRead) },
    });
    const fetchMock = stubGateway(() => { throw new TypeError('Failed to fetch'); });
    await renderHosted();

    expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
    await act(async () => {
      resolvePermission(status);
      await permissionRead;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The first answer ends booting; subsequent background polls keep the panel visible.
    expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
    expect(screen.getByTestId('userId')).toHaveTextContent('null');
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(fetchMock).toHaveBeenCalled();
    expect(probeBridgeSessionMock).not.toHaveBeenCalled();
  });

  it('sends nothing while the permission is prompt, and does not stay in loading', async () => {
    stubPermission('prompt');
    const fetchMock = stubGateway(() => new Response('{}'));
    await renderHosted();

    await waitFor(() => expect(screen.getByTestId('isLoading')).toHaveTextContent('false'));
    expect(screen.getByTestId('userId')).toHaveTextContent('null');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(probeBridgeSessionMock).not.toHaveBeenCalled();
  });
});
