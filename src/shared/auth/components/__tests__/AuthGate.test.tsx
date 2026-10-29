// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { connectionFor } from '@/shared/components/RuntimeConnection/connectionFixture';
import { AuthGate } from '../AuthGate';

const auth = vi.hoisted(() => ({
  isLoading: false,
  authError: null as Error | null,
  isRetryingAuth: false,
  retryAuth: vi.fn(),
}));
const connectionRef = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('@/shared/contexts/AuthContext', () => ({ useAuth: () => ({
  userId: null,
  isAuthenticated: false,
  isLoading: auth.isLoading,
  authError: auth.authError,
  isRetryingAuth: auth.isRetryingAuth,
  retryAuth: auth.retryAuth,
}) }));
vi.mock('@/integrations/runtime/RuntimeConnectionProvider', () => ({ useRuntimeConnection: () => connectionRef.value }));
vi.mock('@/shared/components/RuntimeConnection/RuntimeConnectorRecoveryBanner', () => ({
  RuntimeConnectorRecoveryBanner: ({ error, retrying, onRetry }: { error: Error; retrying: boolean; onRetry: () => void }) => (
    <div data-testid="auth-recovery" data-retrying={String(retrying)}>
      <span>{error.message}</span><button type="button" onClick={onRetry}>retry connection</button>
    </div>
  ),
}));

afterEach(cleanup);
beforeEach(() => {
  auth.isLoading = false;
  auth.authError = null;
  auth.isRetryingAuth = false;
  auth.retryAuth.mockReset();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function renderGate(path: string, children: ReactNode = <p>app</p>, includeLocationProbe = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {includeLocationProbe && <LocationProbe />}
      <AuthGate>{children}</AuthGate>
    </MemoryRouter>,
  );
}

describe('AuthGate', () => {
  it('exports component', () => {
    expect(AuthGate).toBeDefined();
  });

  it('hosted build, still booting: shows the connecting state, not a blank page', () => {
    auth.isLoading = true;
    connectionRef.value = connectionFor({ status: 'connecting' }, { isBooting: true });
    renderGate('/share/abc');

    expect(screen.getByTestId('runtime-not-connected')).toHaveAttribute('data-state', 'connecting');
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('hosted build, still booting on a workspace route: hands over to the connection gate beneath, which draws the same screen', () => {
    auth.isLoading = true;
    connectionRef.value = connectionFor({ status: 'connecting' }, { isBooting: true });
    renderGate('/tools/video-editor', <p>connection gate</p>);

    expect(screen.getByText('connection gate')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-not-connected')).not.toBeInTheDocument();
  });

  it('same-origin build, still loading: renders nothing', () => {
    auth.isLoading = true;
    connectionRef.value = connectionFor({ status: 'connecting' }, { gated: false });
    const { container } = renderGate('/tools/video-editor');

    expect(container).toBeEmptyDOMElement();
  });

  it('renders its children once loaded', () => {
    auth.isLoading = false;
    connectionRef.value = connectionFor({ status: 'connecting' });
    renderGate('/tools/video-editor');

    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('shows same-origin recovery after a failed boot and retries without changing the route', () => {
    auth.authError = new Error('bridge unreachable');
    auth.retryAuth.mockResolvedValue(undefined);
    connectionRef.value = connectionFor({ status: 'connecting' }, { gated: false });
    renderGate('/tools/video-editor?localProject=legacy-project', <p>app</p>, true);
    expect(screen.getByTestId('auth-recovery')).toHaveTextContent('bridge unreachable');
    expect(screen.queryByText('app')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'retry connection' }));
    expect(auth.retryAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('current-location')).toHaveTextContent('/tools/video-editor?localProject=legacy-project');
  });

  it.each(['/blog', '/share/demo', '/pairing', '/home'])('keeps public route %s visible after a failed same-origin boot probe', (path) => {
    auth.authError = new Error('bridge unreachable');
    connectionRef.value = connectionFor({ status: 'connecting' }, { gated: false });

    renderGate(path, <p>public page</p>);
    expect(screen.getByText('public page')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-recovery')).not.toBeInTheDocument();
  });
});
