import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inspectAstridCapabilitiesMock, probeBridgeSessionMock } = vi.hoisted(() => ({
  inspectAstridCapabilitiesMock: vi.fn(),
  probeBridgeSessionMock: vi.fn(),
}));

vi.mock('@/shared/auth/bridgeSession.ts', () => ({
  probeBridgeSession: probeBridgeSessionMock,
}));

vi.mock('./capabilityCensus.ts', () => ({
  inspectAstridCapabilities: inspectAstridCapabilitiesMock,
}));

import {
  ASTRID_DOCTOR_COMMAND,
  checkAstridDoctorAvailability,
  checkAstridRuntimeReachable,
} from './doctorAvailability.ts';

describe('checkAstridDoctorAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the doctor-owned local runtime as available after a healthy bridge probe', async () => {
    inspectAstridCapabilitiesMock.mockResolvedValue({
      health: 'available',
      readiness: 'ready',
      capabilities: { tasks: 'supported', generations: 'supported', media: 'supported' },
      reasons: {},
    });

    await expect(checkAstridDoctorAvailability()).resolves.toEqual({ status: 'available' });
    expect(inspectAstridCapabilitiesMock).toHaveBeenCalledWith('/api/astrid');
  });

  it('preserves the bridge failure reason for explicit recovery UX', async () => {
    inspectAstridCapabilitiesMock.mockResolvedValue({
      health: 'unavailable',
      readiness: 'unavailable',
      capabilities: { tasks: 'unknown', generations: 'unknown', media: 'unknown' },
      reasons: { health: 'connection refused' },
    });

    await expect(checkAstridDoctorAvailability()).resolves.toEqual({
      status: 'unavailable',
      reason: 'connection refused',
    });
    expect(ASTRID_DOCTOR_COMMAND).toBe('python3 -m astrid doctor --json');
  });

  it('does not call a healthy bridge ready when required routes are absent', async () => {
    inspectAstridCapabilitiesMock.mockResolvedValue({
      health: 'available',
      readiness: 'degraded',
      capabilities: { tasks: 'unavailable', generations: 'unavailable', media: 'unknown' },
      reasons: { tasks: 'unknown route: tasks' },
    });

    await expect(checkAstridDoctorAvailability()).resolves.toEqual({
      status: 'degraded',
      unavailable: ['tasks', 'generations'],
      unknown: ['media'],
      reason: 'unknown route: tasks',
    });
  });
});

describe('checkAstridRuntimeReachable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads bridge health only, so a launch never probes the sentinel media object', async () => {
    probeBridgeSessionMock.mockResolvedValue({ ok: true, userId: 'local-user' });

    await expect(checkAstridRuntimeReachable()).resolves.toEqual({ status: 'available' });
    expect(probeBridgeSessionMock).toHaveBeenCalledWith('/api/astrid');
    expect(inspectAstridCapabilitiesMock).not.toHaveBeenCalled();
  });

  it('keeps the health failure reason for the reconnect step', async () => {
    probeBridgeSessionMock.mockResolvedValue({ ok: false, reason: 'connection refused' });

    await expect(checkAstridRuntimeReachable()).resolves.toEqual({
      status: 'unavailable',
      reason: 'connection refused',
    });
  });
});
