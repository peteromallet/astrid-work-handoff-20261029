// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';

const mocks = vi.hoisted(() => ({
  filterTimelineEligiblePositionedImages: vi.fn((images: GenerationRow[]) => images),
  useTimelinePositionUtils: vi.fn(),
  usePositionManagement: vi.fn(),
}));

vi.mock('@/shared/lib/timelineEligibility', () => ({
  filterTimelineEligiblePositionedImages: mocks.filterTimelineEligiblePositionedImages,
}));

vi.mock('../../../../hooks/timeline/useTimelinePositionUtils', () => ({
  useTimelinePositionUtils: mocks.useTimelinePositionUtils,
}));

vi.mock('../usePositionManagement', () => ({
  usePositionManagement: mocks.usePositionManagement,
}));

import { useTimelineDomainService } from './useTimelineDomainService';

function createGeneration(
  id: string,
  timeline_frame: number | null,
  extra: Partial<GenerationRow> = {},
): GenerationRow {
  return {
    id,
    timeline_frame,
    ...extra,
  } as GenerationRow;
}

describe('useTimelineDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filterTimelineEligiblePositionedImages.mockImplementation((images: GenerationRow[]) => [...images]);
    mocks.useTimelinePositionUtils.mockReturnValue({
      pairPrompts: { 2: { prompt: 'utils', negativePrompt: 'none' } },
      loadPositions: vi.fn(),
    });
    mocks.usePositionManagement.mockReturnValue({
      positions: new Map([['img-1', 0]]),
      updatePositions: vi.fn(),
    });
  });

  it('uses prop-backed generations through the utils path and returns sorted images', () => {
    const propAllGenerations = [
      createGeneration('img-b', 10),
      createGeneration('img-a', 0),
      createGeneration('img-c', 10),
    ];

    const { result } = renderHook(() => useTimelineDomainService({
      shotId: 'shot-1',
      projectId: 'project-1',
      frameSpacing: 5,
      isDragInProgress: false,
      onFramePositionsChange: vi.fn(),
      propAllGenerations,
      readOnly: true,
    }));

    expect(mocks.useTimelinePositionUtils).toHaveBeenCalledWith({
      shotId: 'shot-1',
      generations: propAllGenerations,
      projectId: 'project-1',
    });
    expect(mocks.usePositionManagement).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'shot-1',
      shotGenerations: propAllGenerations,
      frameSpacing: 5,
      isDragInProgress: false,
    }));
    expect(result.current.shotGenerations).toEqual(propAllGenerations);
    expect(result.current.images.map((image) => image.id)).toEqual(['img-a', 'img-b', 'img-c']);
    expect(result.current.readOnlyGenerations).toEqual(propAllGenerations);
    expect(result.current.actualPairPrompts).toEqual({ 2: { prompt: 'utils', negativePrompt: 'none' } });
    expect(result.current.positions).toEqual(new Map([['img-1', 0]]));
    expect(result.current.updatePositions).toBe(mocks.usePositionManagement.mock.results[0]?.value.updatePositions);
    expect(result.current.loadPositions).toBe(mocks.useTimelinePositionUtils.mock.results[0]?.value.loadPositions);
  });

  it('renders an empty timeline when no generations are supplied', () => {
    const { result } = renderHook(() => useTimelineDomainService({
      shotId: 'shot-2',
      frameSpacing: 9,
      isDragInProgress: true,
      readOnly: false,
    }));

    expect(mocks.useTimelinePositionUtils).toHaveBeenCalledWith({
      shotId: 'shot-2',
      generations: [],
      projectId: undefined,
    });
    expect(result.current.shotGenerations).toEqual([]);
    expect(result.current.images).toEqual([]);
    expect(result.current.readOnlyGenerations).toBeUndefined();
  });
});
