import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelinePositionUtils } from './useTimelinePositionUtils';

const mocks = vi.hoisted(() => ({
  refetchQueries: vi.fn(),
  invalidateGenerations: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  useTimelineFrameUpdates: vi.fn(),
  useTimelineInitialization: vi.fn(),
  extractPairPrompts: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      refetchQueries: (...args: unknown[]) => mocks.refetchQueries(...args),
    }),
  };
});

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/hooks/invalidation', () => ({
  useEnqueueGenerationsInvalidation: () => (...args: unknown[]) => mocks.invalidateGenerations(...args),
}));

vi.mock('@/shared/hooks/timeline/useTimelineFrameUpdates', () => ({
  useTimelineFrameUpdates: (...args: unknown[]) => mocks.useTimelineFrameUpdates(...args),
}));

vi.mock('./useTimelineInitialization', () => ({
  useTimelineInitialization: (...args: unknown[]) => mocks.useTimelineInitialization(...args),
}));

vi.mock('../settings/useSegmentPromptMetadata', () => ({
  extractPairPrompts: (...args: unknown[]) => mocks.extractPairPrompts(...args),
}));

describe('useTimelinePositionUtils', () => {
  beforeEach(() => {
    mocks.refetchQueries.mockReset();
    mocks.invalidateGenerations.mockReset();
    mocks.normalizeAndPresentError.mockReset();
    mocks.useTimelineFrameUpdates.mockReset();
    mocks.useTimelineInitialization.mockReset();
    mocks.extractPairPrompts.mockReset();
  });

  it('wires direct timeline write helpers with filtered shot generations', async () => {
    const updateTimelineFrame = vi.fn().mockResolvedValue(undefined);
    const batchExchangePositions = vi.fn().mockResolvedValue(undefined);
    const moveItemsToMidpoint = vi.fn().mockResolvedValue(undefined);

    mocks.useTimelineFrameUpdates.mockReturnValue({
      updateTimelineFrame,
      batchExchangePositions,
      moveItemsToMidpoint,
    });
    mocks.useTimelineInitialization.mockReturnValue({
      initializeTimelineFrames: vi.fn().mockResolvedValue(undefined),
    });
    mocks.extractPairPrompts.mockReturnValue([{ pairId: 'pair-1' }]);
    mocks.refetchQueries.mockResolvedValue(undefined);

    const generations = [
      {
        id: 'sg-1',
        generation_id: 'gen-1',
        type: 'image',
        imageUrl: 'https://example.com/image-1.png',
        createdAt: '2026-01-01T00:00:00.000Z',
        timeline_frame: 0,
        metadata: { pairId: 'pair-1' },
        starred: true,
      },
      {
        id: 'video-1',
        generation_id: 'video-gen-1',
        type: 'video',
        location: 'https://example.com/video-1.mp4',
        timeline_frame: 40,
      },
      {
        id: 'sg-2',
        generation_id: 'gen-2',
        type: 'image',
        location: 'https://example.com/image-2.png',
        timeline_frame: null,
      },
    ] as unknown as import('@/domains/generation/types').GenerationRow[];

    const { result } = renderHook(() => useTimelinePositionUtils({
      shotId: 'shot-1',
      generations,
      projectId: 'project-1',
    }));

    expect(mocks.useTimelineFrameUpdates).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'shot-1',
      projectId: 'project-1',
      shotGenerations: [
        expect.objectContaining({
          id: 'sg-1',
          shot_id: 'shot-1',
          generation_id: 'gen-1',
          timeline_frame: 0,
        }),
        expect.objectContaining({
          id: 'sg-2',
          shot_id: 'shot-1',
          generation_id: 'gen-2',
          timeline_frame: -1,
        }),
      ],
      syncShotData: expect.any(Function),
    }));
    expect(result.current.pairPrompts).toEqual([{ pairId: 'pair-1' }]);
    expect(result.current.shotGenerations).toHaveLength(2);

    await act(async () => {
      await result.current.updateTimelineFrame('sg-1', 75);
      await result.current.batchExchangePositions([{ shotGenerationId: 'sg-1', newFrame: 90 }]);
      await result.current.loadPositions();
    });

    expect(updateTimelineFrame).toHaveBeenCalledWith('sg-1', 75);
    expect(batchExchangePositions).toHaveBeenCalledWith([{ shotGenerationId: 'sg-1', newFrame: 90 }]);
    expect(mocks.refetchQueries).toHaveBeenCalledWith({
      queryKey: ['all-shot-generations', 'shot-1'],
    });
    expect(mocks.invalidateGenerations).toHaveBeenCalledWith('shot-1', {
      reason: 'timeline-position-utils-reload',
      scope: 'all',
      includeShots: true,
      projectId: 'project-1',
    });
  });
});
