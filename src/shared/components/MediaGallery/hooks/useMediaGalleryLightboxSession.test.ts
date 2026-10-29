import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMediaGalleryLightboxSession } from '@/shared/components/MediaGallery/hooks/useMediaGalleryLightboxSession';
import { useLightboxNavigationState } from '@/shared/components/MediaGallery/hooks/useMediaGalleryLightboxControllers';

vi.mock('@/shared/components/MediaGallery/hooks/useMediaGalleryLightboxControllers', () => ({
  buildTaskDetailsPayload: ({
    task,
    isLoadingTask,
    taskError,
    inputImages,
    taskId,
    onClose,
  }: {
    task?: unknown;
    isLoadingTask?: boolean;
    taskError?: Error | null;
    inputImages?: string[];
    taskId?: string | null;
    onClose: () => void;
  }) => ({
    task: task ?? null,
    isLoading: isLoadingTask ?? false,
    status: taskError ? 'error' : (task ? 'ok' : 'missing'),
    error: taskError ?? null,
    inputImages: inputImages ?? [],
    taskId: taskId ?? null,
    onClose,
  }),
  useLightboxNavigationState: vi.fn(() => ({ hasNext: true, hasPrevious: true })),
  useShotAssociationState: () => ({
    positionedInSelectedShot: undefined,
    associatedWithoutPositionInSelectedShot: undefined,
  }),
  useGenerationNavigationController: () => ({
    handleNavigateToGeneration: vi.fn(),
    handleOpenExternalGeneration: vi.fn(),
  }),
}));

function buildParams(overrides: Record<string, unknown> = {}) {
  const stateHook = {
    state: {
      activeLightboxMedia: {
        id: 'img-1',
        metadata: { __autoEnterEditMode: true, source: 'active' },
        starred: false,
      },
      selectedShotIdLocal: 'shot-1',
      showTickForImageId: 'img-1',
      showTickForSecondaryImageId: 'img-2',
      optimisticPositionedIds: new Set(['img-1']),
      optimisticUnpositionedIds: new Set(['img-3']),
      showTaskDetailsModal: false,
      selectedImageForDetails: null,
    },
    setShowTickForImageId: vi.fn(),
    setShowTickForSecondaryImageId: vi.fn(),
    setShowTaskDetailsModal: vi.fn(),
    setSelectedImageForDetails: vi.fn(),
    markOptimisticPositioned: vi.fn(),
    markOptimisticUnpositioned: vi.fn(),
  };

  const actionsHook = {
    handleCloseLightbox: vi.fn(),
    handleOptimisticDelete: vi.fn(),
    handleShotChange: vi.fn(),
  };

  return {
    stateHook,
    actionsHook,
    filtersHook: {
      filteredImages: [
        { id: 'img-1', metadata: { source: 'filtered' }, starred: true },
        { id: 'img-2' },
      ],
    },
    paginationHook: {
      isServerPagination: true,
      totalPages: 4,
    },
    serverPage: 2,
    handleNextImage: vi.fn(),
    handlePreviousImage: vi.fn(),
    handleSetActiveLightboxIndex: vi.fn(),
    lightboxDeletingId: 'img-2',
    simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
    onAddToLastShot: vi.fn(),
    onAddToLastShotWithoutPosition: vi.fn(),
    task: { id: 'task-1' },
    taskDetailsLoading: true,
    taskError: null,
    inputImages: ['in-1.png'],
    lightboxTaskMapping: { taskId: 'task-1' },
    handleNavigateToShot: vi.fn(),
    showDelete: true,
    ...overrides,
  };
}

describe('useMediaGalleryLightboxSession', () => {
  it('maps all controller/state fields into a lightbox session object', () => {
    const params = buildParams();
    const { result } = renderHook(() => useMediaGalleryLightboxSession(params as never));

    expect(vi.mocked(useLightboxNavigationState)).toHaveBeenCalledWith({
      activeLightboxMedia: params.stateHook.state.activeLightboxMedia,
      filteredImages: params.filtersHook.filteredImages,
      isServerPagination: true,
      serverPage: 2,
      totalPages: 4,
    });

    expect(result.current).toEqual(expect.objectContaining({
      onClose: expect.any(Function),
      filteredImages: params.filtersHook.filteredImages,
      isServerPagination: true,
      serverPage: 2,
      totalPages: 4,
      onNext: params.handleNextImage,
      onPrevious: params.handlePreviousImage,
      onDelete: params.actionsHook.handleOptimisticDelete,
      isDeleting: 'img-2',
      simplifiedShotOptions: params.simplifiedShotOptions,
      selectedShotIdLocal: 'shot-1',
      selectedShotIdForLightbox: 'shot-1',
      onShotChange: expect.any(Function),
      hasNext: true,
      hasPrevious: true,
      handleNavigateToGeneration: expect.any(Function),
      handleOpenExternalGeneration: expect.any(Function),
      showTickForImageId: 'img-1',
      showTickForSecondaryImageId: 'img-2',
      optimisticPositionedIds: params.stateHook.state.optimisticPositionedIds,
      optimisticUnpositionedIds: params.stateHook.state.optimisticUnpositionedIds,
      onOptimisticPositioned: params.stateHook.markOptimisticPositioned,
      onOptimisticUnpositioned: params.stateHook.markOptimisticUnpositioned,
      task: params.task,
      isLoadingTask: true,
      taskError: null,
      inputImages: ['in-1.png'],
      lightboxTaskMapping: params.lightboxTaskMapping,
      taskDetailsData: expect.objectContaining({
        task: params.task,
        taskId: 'task-1',
        status: 'ok',
        onClose: expect.any(Function),
      }),
      onNavigateToShot: params.handleNavigateToShot,
      setActiveLightboxIndex: params.handleSetActiveLightboxIndex,
    }));
    expect(result.current).not.toHaveProperty('autoEnterEditMode');
    expect(result.current).not.toHaveProperty('onApplySettings');
    expect(result.current.lightboxMedia).toEqual(expect.objectContaining({
      id: 'img-1',
      generation_id: 'img-1',
      starred: true,
      location: null,
      metadata: { source: 'filtered' },
    }));
  });

  it('keeps the shot override inside the session boundary instead of the component', () => {
    const params = buildParams();
    const { result } = renderHook(() => useMediaGalleryLightboxSession(params as never));

    act(() => {
      result.current.onShotChange('shot-2');
    });

    expect(params.actionsHook.handleShotChange).toHaveBeenCalledWith('shot-2');
    expect(result.current.selectedShotIdForLightbox).toBe('shot-2');
  });

  it('omits delete action when showDelete is false', () => {
    const params = buildParams({ showDelete: false });
    const { result } = renderHook(() => useMediaGalleryLightboxSession(params as never));

    expect(result.current.onDelete).toBeUndefined();
    expect(result.current.isDeleting).toBe('img-2');
  });
});
