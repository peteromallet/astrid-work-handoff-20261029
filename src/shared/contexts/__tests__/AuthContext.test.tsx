/**
 * AuthContext Tests — boot/auth seam over the bridge probe.
 *
 * The provider resolves the fixed local user from a single
 * `/api/astrid/health` probe per boot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { probeBridgeSessionMock } = vi.hoisted(() => ({
  probeBridgeSessionMock: vi.fn(),
}));
vi.mock('@/shared/auth/bridgeSession', () => ({ probeBridgeSession: probeBridgeSessionMock }));

import { AuthProvider, useAuth } from '../AuthContext';

// Test consumer component
function AuthConsumer() {
  const { userId, isAuthenticated, isLoading, authError, isRetryingAuth, retryAuth } = useAuth();
  return (
    <div>
      <span data-testid="userId">{userId ?? 'null'}</span>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <span data-testid="authError">{authError?.message ?? 'null'}</span>
      <span data-testid="isRetryingAuth">{String(isRetryingAuth)}</span>
      <button type="button" onClick={() => void retryAuth()}>retry auth</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    probeBridgeSessionMock.mockReset();
  });

  describe('useAuth hook', () => {
    it('throws when used outside AuthProvider', () => {
      // Suppress console.error from the expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadConsumer() {
        useAuth();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('AuthProvider', () => {
    it('does not let legacy document selectors bypass connection-based auth', async () => {
      probeBridgeSessionMock.mockReturnValue(new Promise(() => {}));
      window.history.replaceState({}, '', '/tools/video-editor?runtime=1&runtimeProject=runtime-project&runtimeTimeline=runtime-timeline&localProject=legacy-project&localTimeline=legacy-timeline');

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
      expect(screen.getByTestId('userId')).toHaveTextContent('null');
      await waitFor(() => expect(probeBridgeSessionMock).toHaveBeenCalledTimes(1));
    });

    it('renders children', async () => {
      probeBridgeSessionMock.mockResolvedValue({ ok: true, userId: 'local-user' });

      render(
        <AuthProvider>
          <div data-testid="child">Hello</div>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('child')).toHaveTextContent('Hello');
      });
    });

    it('starts in loading state while probing', () => {
      // A probe that never settles: isLoading must stay true.
      probeBridgeSessionMock.mockReturnValue(
        new Promise<{ ok: true; userId: string }>(() => {}),
      );

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
      expect(screen.getByTestId('userId')).toHaveTextContent('null');
    });

    it('resolves the fixed local user after a healthy probe', async () => {
      probeBridgeSessionMock.mockResolvedValue({ ok: true, userId: 'local-user' });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('userId')).toHaveTextContent('local-user');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    });

    it('exposes an honest failure state when the probe fails — no retry loop', async () => {
      probeBridgeSessionMock.mockResolvedValue({ ok: false, reason: 'bridge unreachable' });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('userId')).toHaveTextContent('null');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('authError')).toHaveTextContent('bridge unreachable');

      // Failure remains terminal until the user explicitly retries.
      await waitFor(() => {
        expect(probeBridgeSessionMock).toHaveBeenCalledTimes(1);
      });
    });

    it('allows a manual retry to recover authentication after a failed boot', async () => {
      probeBridgeSessionMock
        .mockResolvedValueOnce({ ok: false, reason: 'bridge unreachable' })
        .mockResolvedValueOnce({ ok: true, userId: 'local-user' });

      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      await waitFor(() => expect(screen.getByTestId('authError')).toHaveTextContent('bridge unreachable'));
      expect(probeBridgeSessionMock).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'retry auth' }));
      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('authError')).toHaveTextContent('null');
      });
      expect(probeBridgeSessionMock).toHaveBeenCalledTimes(2);
    });
  });
});
