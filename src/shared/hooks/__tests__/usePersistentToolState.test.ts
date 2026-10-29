import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock useAutoSaveSettings (adapter boundary used by usePersistentToolState)
vi.mock('@/shared/settings/hooks/useAutoSaveSettings', () => ({
  useAutoSaveSettings: vi.fn(() => ({
    settings: { generationMode: 'batch', steps: 6 },
    status: 'ready',
    entityId: 'proj-1',
    isDirty: false,
    error: null,
    hasShotSettings: true,
    hasPersistedData: true,
    updateField: vi.fn(),
    updateFields: vi.fn(),
    save: vi.fn(),
    saveImmediate: vi.fn(),
    revert: vi.fn(),
    reset: vi.fn(),
    initializeFrom: vi.fn(),
  })),
}));

vi.mock('@/tooling/toolDefaultsRegistry', () => ({
  toolDefaultsRegistry: {
    'test-tool': { generationMode: 'single', steps: 4 },
  },
  getToolDefaults: vi.fn((toolId: string) => {
    if (toolId === 'test-tool') {
      return { generationMode: 'single', steps: 4 };
    }
    return undefined;
  }),
}));

vi.mock('@/shared/lib/utils/deepEqual', () => ({
  deepEqual: vi.fn((a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)),
  sanitizeSettings: vi.fn((s: unknown) => s),
}));

import { usePersistentToolState } from '../usePersistentToolState';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('usePersistentToolState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready=true immediately when enabled=false', () => {
    const { result } = renderHook(() =>
      usePersistentToolState(
        'test-tool',
        { projectId: 'proj-1' },
        {},
        { enabled: false }
      ),
      { wrapper: createWrapper() },
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.hasUserInteracted).toBe(false);
  });

  it('provides markAsInteracted function when disabled', () => {
    const { result } = renderHook(() =>
      usePersistentToolState(
        'test-tool',
        { projectId: 'proj-1' },
        {},
        { enabled: false }
      ),
      { wrapper: createWrapper() },
    );

    expect(typeof result.current.markAsInteracted).toBe('function');
    // Should not throw
    expect(() => result.current.markAsInteracted()).not.toThrow();
  });
});
