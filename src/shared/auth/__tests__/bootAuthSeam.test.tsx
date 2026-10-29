/**
 * Boot/auth seam tests.
 *
 * (a) The covered journey's boot surface (AuthProvider → AuthGate → Layout
 *     gates) renders with no cloud environment configured: auth is
 *     resolved by the `/api/astrid` bridge probe alone.
 * (b) A failing probe offers recovery at the requested URL, holding the
 *     workspace back until an explicit retry verifies the connection.
 */

// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { probeBridgeSessionMock } = vi.hoisted(() => ({
  probeBridgeSessionMock: vi.fn(),
}));

vi.mock('@/shared/auth/bridgeSession', () => ({
  probeBridgeSession: probeBridgeSessionMock,
}));

import { AuthProvider } from '@/shared/contexts/AuthContext';
import { AuthGate } from '@/shared/auth/components/AuthGate';
import { probeBridgeSession } from '@/shared/auth/bridgeSession';

const probeMock = vi.mocked(probeBridgeSession);

function RouteProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="boot-route">{pathname}{search}</output>;
}

function BootSurface() {
  return (
    <MemoryRouter initialEntries={['/tools/video-editor?timeline=local-timeline']}>
      <RouteProbe />
      <AuthProvider>
        <AuthGate>
          <div data-testid="booted-shell">editor shell</div>
        </AuthGate>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('env-free boot over the bridge probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[XHARD a] boots AuthGate/Layout children with a healthy bridge', async () => {
    probeMock.mockResolvedValue({ ok: true, userId: 'local-user' });

    render(<BootSurface />);

    await waitFor(() => {
      expect(screen.getByTestId('booted-shell')).toBeInTheDocument();
    });
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(probeMock).toHaveBeenCalledWith();
  });

  it('[XHARD b] a failed probe degrades to alive-but-unauthenticated — one probe, no loop', async () => {
    let resolveProbe!: (value: { ok: false; reason: string }) => void;
    const pending = new Promise<{ ok: false; reason: string }>((resolve) => {
      resolveProbe = resolve;
    });
    probeMock.mockReturnValue(pending);

    render(<BootSurface />);

    // While probing, the gate holds children back but nothing crashes.
    expect(screen.queryByTestId('booted-shell')).not.toBeInTheDocument();

    resolveProbe({ ok: false, reason: 'bridge unreachable' });

    await waitFor(() => {
      expect(probeMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('runtime-connector-alert')).toBeInTheDocument();
    expect(screen.queryByTestId('booted-shell')).not.toBeInTheDocument();
    expect(screen.getByTestId('boot-route')).toHaveTextContent('/tools/video-editor?timeline=local-timeline');
    await new Promise((r) => setTimeout(r, 0));
    expect(probeMock).toHaveBeenCalledTimes(1);

    probeMock.mockResolvedValue({ ok: true, userId: 'local-user' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Runtime connection' }));
    expect(await screen.findByTestId('booted-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-connector-alert')).toBeNull();
    expect(probeMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('boot-route')).toHaveTextContent('/tools/video-editor?timeline=local-timeline');
  });
});
