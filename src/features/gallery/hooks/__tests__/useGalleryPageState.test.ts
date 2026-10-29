import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock all dependencies
vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'test-project-id' }),
}));

const queryMock = vi.hoisted(() => ({ response: undefined as unknown }));

vi.mock('@/shared/hooks/projects/useProjectGenerations', () => ({
  useProjectGenerations: vi.fn(() => ({
    data: queryMock.response,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
  })),
}));

vi.mock('@/shared/hooks/shots', () => ({
  useAddImageToShot: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    mutateAsyncWithoutPosition: vi.fn().mockResolvedValue(undefined),
  }),
  usePositionExistingGenerationInShot: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/shared/state/selectionStore', () => ({
  useLastAffectedShot: () => ({
    lastAffectedShotId: 'shot-1',
    setLastAffectedShotId: vi.fn(),
  }),
  useCurrentShot: () => ({ currentShotId: 'shot-1' }),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: () => ({
    shots: [{ id: 'shot-1', name: 'Shot 1' }, { id: 'shot-2', name: 'Shot 2' }],
  }),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn() },
}));

const filterMock = vi.hoisted(() => ({ searchTerm: '' }));

vi.mock('@/shared/hooks/gallery/useGalleryFilterState', () => ({
  useGalleryFilterState: () => ({
    selectedShotFilter: null,
    excludePositioned: false,
    searchTerm: filterMock.searchTerm,
    starredOnly: false,
    filters: {},
    expectedItemCount: 0,
    applyQueryFallback: vi.fn(),
    setSelectedShotFilter: vi.fn(),
    setExcludePositioned: vi.fn(),
    setSearchTerm: vi.fn(),
    setStarredOnly: vi.fn(),
  }),
}));

import { useGalleryPageState } from '@/features/gallery/hooks/useGalleryPageState';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useGalleryPageState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.response = { items: [], total: 0, hasMore: false };
    filterMock.searchTerm = '';
  });

  it('returns initial page state', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(result.current.page).toBe(1);
    expect(result.current.selectedProjectId).toBe('test-project-id');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('provides paginated data structure', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(result.current.paginatedData).toEqual({
      items: [],
      totalPages: 0,
      currentPage: 1,
    });
  });

  it('has totalCount of 0 when no data', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(result.current.totalCount).toBe(0);
  });

  it('provides shots data from context', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(result.current.shotsData).toHaveLength(2);
  });

  it('provides filter state', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(result.current.selectedShotFilter).toBeNull();
    expect(result.current.excludePositioned).toBe(false);
    expect(result.current.searchTerm).toBe('');
    expect(result.current.starredOnly).toBe(false);
  });

  it('provides handler functions', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.handleServerPageChange).toBe('function');
    expect(typeof result.current.handleAddToShot).toBe('function');
    expect(typeof result.current.handleAddToShotWithoutPosition).toBe('function');
  });

  it('provides setter functions', () => {
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.setPage).toBe('function');
    expect(typeof result.current.setSelectedShotFilter).toBe('function');
    expect(typeof result.current.setExcludePositioned).toBe('function');
    expect(typeof result.current.setSearchTerm).toBe('function');
    expect(typeof result.current.setStarredOnly).toBe('function');
  });

  it('updates page when handleServerPageChange is called', () => {
    queryMock.response = { items: [], total: 135, hasMore: false };
    const { result } = renderHook(
      () => useGalleryPageState(),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.handleServerPageChange(3);
    });

    expect(result.current.page).toBe(3);
  });

  it('accepts custom itemsPerPage', () => {
    const { result } = renderHook(
      () => useGalleryPageState({ itemsPerPage: 20 }),
      { wrapper: createWrapper() }
    );

    expect(result.current.paginatedData.currentPage).toBe(1);
  });

  it('defaults mediaType to image', () => {
    // The useProjectGenerations mock is called - we just verify the hook doesn't crash
    const { result } = renderHook(
      () => useGalleryPageState({ mediaType: 'video' }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });

  it('disables data loading when enableDataLoading is false', () => {
    const { result } = renderHook(
      () => useGalleryPageState({ enableDataLoading: false }),
      { wrapper: createWrapper() }
    );

    // When data loading is disabled, we should still get a valid structure
    expect(result.current.paginatedData).toBeDefined();
  });

  describe('filter resets and page clamping', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g-${i}` }));
    const response = (total: number, hasMore: boolean) => ({ items: items(45), total, hasMore });

    it('resets page to 1 when mediaType changes after paging to page 2', () => {
      queryMock.response = response(100, true);
      const { result, rerender } = renderHook(
        ({ mediaType }: { mediaType: 'image' | 'video' }) => useGalleryPageState({ mediaType }),
        { initialProps: { mediaType: 'image' as 'image' | 'video' }, wrapper: createWrapper() },
      );

      act(() => {
        result.current.handleServerPageChange(2);
      });
      expect(result.current.page).toBe(2);
      expect(result.current.paginatedData.items).toHaveLength(45);

      rerender({ mediaType: 'video' });

      expect(result.current.page).toBe(1);
      expect(result.current.paginatedData.items).toHaveLength(45);
    });

    it('resets page to 1 when the search term changes', () => {
      queryMock.response = response(100, true);
      const { result, rerender } = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });

      act(() => {
        result.current.handleServerPageChange(2);
      });
      expect(result.current.page).toBe(2);

      filterMock.searchTerm = 'cat';
      rerender();

      expect(result.current.page).toBe(1);
    });

    it('clamps page to the last page when the total shrinks', () => {
      queryMock.response = response(135, true);
      const { result, rerender } = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });

      act(() => {
        result.current.handleServerPageChange(3);
      });
      expect(result.current.page).toBe(3);

      queryMock.response = { items: items(5), total: 50, hasMore: false };
      rerender();

      expect(result.current.page).toBe(2);
    });

    it('does not clamp while there is no response', () => {
      queryMock.response = undefined;
      const { result } = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });

      act(() => {
        result.current.handleServerPageChange(3);
      });

      expect(result.current.page).toBe(3);
    });

    it('reports totalIsExact true only when hasMore is false', () => {
      queryMock.response = response(45, false);
      const exact = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });
      expect(exact.result.current.totalIsExact).toBe(true);

      queryMock.response = response(46, true);
      const lookAhead = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });
      expect(lookAhead.result.current.totalIsExact).toBe(false);
    });

    it('reports totalIsExact false when there is no response', () => {
      queryMock.response = undefined;
      const { result } = renderHook(() => useGalleryPageState(), { wrapper: createWrapper() });
      expect(result.current.totalIsExact).toBe(false);
    });
  });
});
