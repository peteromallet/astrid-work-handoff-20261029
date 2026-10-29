import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installNetworkStatusDebugHelpers } from './networkStatusDebug';

const originalDEV = import.meta.env.DEV;

describe('networkStatusDebug', () => {
  const originalCheckNetworkStatus = window.checkNetworkStatus;
  const originalSimulateNetworkChange = window.simulateNetworkChange;
  const originalManager = window.__NETWORK_STATUS_MANAGER__;
  const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');

  beforeEach(() => {
    vi.useFakeTimers();
    // installNetworkStatusDebugHelpers guards on import.meta.env.DEV
    (import.meta.env as Record<string, unknown>).DEV = true;
    delete window.checkNetworkStatus;
    delete window.simulateNetworkChange;
    delete window.__NETWORK_STATUS_MANAGER__;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (import.meta.env as Record<string, unknown>).DEV = originalDEV;
    if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine);
    if (originalConnection) {
      Object.defineProperty(navigator, 'connection', originalConnection);
    } else {
      delete (navigator as Record<string, unknown>).connection;
    }
    if (originalCheckNetworkStatus) window.checkNetworkStatus = originalCheckNetworkStatus;
    if (originalSimulateNetworkChange) window.simulateNetworkChange = originalSimulateNetworkChange;
    if (originalManager) window.__NETWORK_STATUS_MANAGER__ = originalManager;
  });

  it('installs debug helpers and manager on window', () => {
    const manager = {
      getStatus: vi.fn(),
      getRecommendedIntervals: vi.fn(),
    };

    installNetworkStatusDebugHelpers(manager as never);

    expect(typeof window.checkNetworkStatus).toBe('function');
    expect(typeof window.simulateNetworkChange).toBe('function');
  });

  it('checkNetworkStatus calls manager status helpers', () => {
    const manager = {
      getStatus: vi.fn(),
      getRecommendedIntervals: vi.fn(),
    };

    installNetworkStatusDebugHelpers(manager as never);
    window.checkNetworkStatus?.();

    expect(manager.getStatus).toHaveBeenCalledTimes(1);
    expect(manager.getRecommendedIntervals).toHaveBeenCalledTimes(1);
  });

  it('simulateNetworkChange dispatches event and restores network properties', () => {
    const manager = {
      getStatus: vi.fn(),
      getRecommendedIntervals: vi.fn(),
    };
    const offlineListener = vi.fn();
    window.addEventListener('offline', offlineListener);

    installNetworkStatusDebugHelpers(manager as never);
    window.simulateNetworkChange?.(false, '3g');

    expect(navigator.onLine).toBe(false);
    expect((navigator.connection as { effectiveType?: string }).effectiveType).toBe('3g');
    expect(offlineListener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(navigator.onLine).toBe(true);
    expect((navigator.connection as { effectiveType?: string }).effectiveType).toBe('4g');
    window.removeEventListener('offline', offlineListener);
  });
});
