import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('viewportLockRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initializes the runtime once and keeps returning the first service instance', async () => {
    const firstService = { lockLightboxViewport: vi.fn() };
    const secondService = { lockLightboxViewport: vi.fn() };

    vi.doMock('@/shared/services/viewport/viewportLockService', () => ({
      createViewportLockService: vi.fn(() => secondService),
    }));

    const runtime = await import('./viewportLockRuntime');

    expect(runtime.initializeViewportLockRuntime(firstService as never)).toBe(firstService);
    expect(runtime.initializeViewportLockRuntime(secondService as never)).toBe(firstService);
    expect(runtime.getViewportLockRuntime()).toBe(firstService);
  });

  it('lazily creates the runtime service when bootstrap initialization was skipped', async () => {
    const createdService = { lockLightboxViewport: vi.fn() };
    const createViewportLockService = vi.fn(() => createdService);

    vi.doMock('@/shared/services/viewport/viewportLockService', () => ({
      createViewportLockService,
    }));

    const runtime = await import('./viewportLockRuntime');

    expect(runtime.getViewportLockRuntime()).toBe(createdService);
    expect(runtime.getViewportLockRuntime()).toBe(createdService);
    expect(createViewportLockService).toHaveBeenCalledTimes(1);
  });
});
