import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock smart polling
vi.mock('@/shared/hooks/useSmartPolling', () => ({
  useSmartPollingConfig: vi.fn(() => ({
    refetchInterval: false,
    staleTime: 30000,
  })),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    projectStats: {
      videos: (projectId: string) => ['project-stats', 'videos', projectId],
    },
  },
}));

import { useProjectVideoCountsCache } from '../useProjectVideoCountsCache';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useProjectVideoCountsCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null values when projectId is null', () => {
    const { result } = renderHook(() => useProjectVideoCountsCache(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.getShotVideoCount('shot-1')).toBeNull();
    expect(result.current.getFinalVideoCount('shot-1')).toBeNull();
    expect(result.current.getHasStructureVideo('shot-1')).toBeNull();
    expect(result.current.getAllShotCounts()).toBeNull();
  });

  it('returns null for null shotId', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.getShotVideoCount(null)).toBeNull();
    expect(result.current.getFinalVideoCount(null)).toBeNull();
    expect(result.current.getHasStructureVideo(null)).toBeNull();
  });

  it('provides clearCache function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.clearCache).toBe('function');
    // Should not throw
    expect(() => result.current.clearCache()).not.toThrow();
  });

  it('provides deleteProjectCache function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.deleteProjectCache).toBe('function');
    // Should not throw
    expect(() => result.current.deleteProjectCache('project-1')).not.toThrow();
    expect(() => result.current.deleteProjectCache(null)).not.toThrow();
  });

  it('provides invalidateOnVideoChanges function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.invalidateOnVideoChanges).toBe('function');
  });

  it('exposes loading state', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    // Initially loading
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('keeps the unsupported per-shot counts query disabled with zero retries', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, gcTime: 0 } } });
    renderHook(() => useProjectVideoCountsCache('project-1'), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children),
    });

    const query = queryClient.getQueryCache().find({
      queryKey: ['project-video-counts', 'project-1'],
    });
    expect(query?.options.enabled).toBe(false);
    expect(query?.options.retry).toBe(false);
    expect(query?.state.error).toBeNull();
  });
});
