import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lightboxIndex: 0 as number | null,
  normalizeAndPresentError: vi.fn(),
  setExternalGenerations: vi.fn(),
  setTempDerivedGenerations: vi.fn(),
  setDerivedNavContext: vi.fn(),
  closeBaseLightbox: vi.fn(),
  onAddToShot: vi.fn(),
  onAddToShotWithoutPosition: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/hooks/usePendingImageOpen', () => ({
  usePendingImageOpen: () => ({ current: null }),
}));

vi.mock('@/tools/travel-between-images/hooks/navigation/useDerivedNavigation', () => ({
  useDerivedNavigation: () => ({
    wrappedGoNext: vi.fn(),
    wrappedGoPrev: vi.fn(),
    hasNext: false,
    hasPrevious: false,
  }),
}));

vi.mock('@/shared/components/ShotImageManager/hooks/useExternalGenerations', () => ({
  useExternalGenerations: () => ({
    externalGenerations: [
      {
        id: 'ext-1',
        generation_id: 'ext-1',
        imageUrl: 'https://example.com/ext-1.png',
      },
    ],
    tempDerivedGenerations: [
      {
        id: 'tmp-1',
        generation_id: 'tmp-1',
        imageUrl: 'https://example.com/tmp-1.png',
      },
    ],
    derivedNavContext: null,
    setExternalGenerations: mocks.setExternalGenerations,
    setTempDerivedGenerations: mocks.setTempDerivedGenerations,
    setDerivedNavContext: mocks.setDerivedNavContext,
    handleOpenExternalGeneration: vi.fn(),
  }),
}));

vi.mock('./segment/useAdjacentSegments', () => ({
  useAdjacentSegments: () => ({
    hasAdjacentSegment: false,
  }),
}));

vi.mock('./useLightbox', () => ({
  useLightbox: () => ({
    lightboxIndex: mocks.lightboxIndex,
    goNext: vi.fn(),
    goPrev: vi.fn(),
    closeLightbox: mocks.closeBaseLightbox,
    openLightbox: vi.fn(),
    handleDesktopDoubleClick: vi.fn(),
    handleMobileTap: vi.fn(),
    showNavigation: false,
    setLightboxIndex: vi.fn(),
  }),
}));

vi.mock('@/shared/components/TaskDetails/hooks/useGenerationTaskDetails', () => ({
  useGenerationTaskDetails: () => ({
    task: null,
    isLoadingTask: false,
    taskError: null,
    inputImages: [],
  }),
}));

import { useTimelineLightboxOrchestrator } from './useTimelineLightboxOrchestrator';

describe('useTimelineLightboxOrchestrator', () => {
  const baseImages = [
    {
      id: 'gen-1',
      generation_id: 'gen-1',
      imageUrl: 'https://example.com/gen-1.png',
      shot_id: 'shot-1',
      timeline_frame: 24,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lightboxIndex = 0;
    mocks.onAddToShot = vi.fn().mockResolvedValue(true);
    mocks.onAddToShotWithoutPosition = vi.fn().mockResolvedValue(true);
  });

  it('merges base, external, and temp images into current media list', () => {
    const { result } = renderHook(() =>
      useTimelineLightboxOrchestrator({
        shotId: 'shot-1',
        projectId: 'project-1',
        images: baseImages,
      }),
    );

    expect(result.current.media.currentImages.map((img) => img.id)).toEqual([
      'gen-1',
      'ext-1',
      'tmp-1',
    ]);
    expect(result.current.media.currentLightboxImage?.id).toBe('gen-1');
  });

  it('clears derived/external state when closing lightbox', () => {
    const { result } = renderHook(() =>
      useTimelineLightboxOrchestrator({
        shotId: 'shot-1',
        projectId: 'project-1',
        images: baseImages,
      }),
    );

    act(() => {
      result.current.lightbox.closeLightbox();
    });

    expect(mocks.setExternalGenerations).toHaveBeenCalledWith([]);
    expect(mocks.setTempDerivedGenerations).toHaveBeenCalledWith([]);
    expect(mocks.setDerivedNavContext).toHaveBeenCalledWith(null);
    expect(mocks.closeBaseLightbox).toHaveBeenCalledTimes(1);
  });

  it('exposes shot-state flags for positioned images in selected shot', () => {
    const { result } = renderHook(() =>
      useTimelineLightboxOrchestrator({
        shotId: 'shot-1',
        selectedShotId: 'shot-1',
        projectId: 'project-1',
        images: baseImages,
      }),
    );

    expect(result.current.shotSelection.lightboxShotState).toEqual(
      expect.objectContaining({
        isExternalGen: false,
        positionedInSelectedShot: true,
        associatedWithoutPositionInSelectedShot: false,
      }),
    );
  });

  it('wraps add-to-shot errors and returns false on failure', async () => {
    const failure = new Error('add failed');
    mocks.onAddToShot.mockRejectedValueOnce(failure);
    const { result } = renderHook(() =>
      useTimelineLightboxOrchestrator({
        shotId: 'shot-1',
        projectId: 'project-1',
        images: baseImages,
        onAddToShot: mocks.onAddToShot,
        onAddToShotWithoutPosition: mocks.onAddToShotWithoutPosition,
      }),
    );

    let ok = false;
    await act(async () => {
      ok = (await result.current.shotSelection.addToShot?.('shot-2', 'gen-1')) ?? true;
    });

    expect(ok).toBe(false);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        context: 'Timeline',
        toastTitle: 'Failed to add to shot',
      }),
    );
  });
});
