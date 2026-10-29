import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { useAppExternalDrop } from './useAppExternalDrop';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

function createDragEndEvent(params: {
  activeData: Record<string, unknown>;
  overData: Record<string, unknown>;
  overId?: string;
}): DragEndEvent {
  const { activeData, overData, overId = 'target' } = params;
  return {
    active: { data: { current: activeData } },
    over: { id: overId, data: { current: overData } },
  } as unknown as DragEndEvent;
}

describe('useAppExternalDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('places a dropped generation into the target shot, records it, and finalizes the overlay', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      setLastAffectedShotId,
      addImageToShotMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: {
          generationId: 'gen-1',
          imageUrl: 'https://example.com/image.png',
          thumbUrl: 'https://example.com/thumb.png',
        },
        overData: {
          type: 'shot-group',
          shotId: 'shot-1',
        },
      }));
    });

    expect(addImageToShotMutation.mutateAsync).toHaveBeenCalledWith({
      shot_id: 'shot-1',
      generation_id: 'gen-1',
      imageUrl: 'https://example.com/image.png',
      thumbUrl: 'https://example.com/thumb.png',
      project_id: 'project-1',
    });
    expect(setLastAffectedShotId).toHaveBeenCalledWith('shot-1');
    expect(onDropHandled).toHaveBeenCalledTimes(1);
  });

  it('finalizes overlay when drop target is missing', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn() };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      setLastAffectedShotId,
      addImageToShotMutation,
      onDropHandled,
    }));

    const event = {
      active: { data: { current: { generationId: 'gen-1' } } },
      over: null,
    } as unknown as DragEndEvent;

    await act(async () => {
      await result.current(event);
    });

    expect(onDropHandled).toHaveBeenCalledTimes(1);
    expect(addImageToShotMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
  });

  it('ignores drops on zones that are not shot groups', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn() };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      setLastAffectedShotId,
      addImageToShotMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: { generationId: 'gen-1' },
        overData: { type: 'other-zone' },
      }));
    });

    expect(addImageToShotMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
    expect(onDropHandled).toHaveBeenCalledTimes(1);
  });

  it('finalizes overlay for generation drop failures', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error('mutation failed')),
    };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      setLastAffectedShotId,
      addImageToShotMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: {
          generationId: 'gen-1',
          imageUrl: 'https://example.com/image.png',
        },
        overData: {
          type: 'shot-group',
          shotId: 'shot-1',
        },
      }));
    });

    expect(addImageToShotMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onDropHandled).toHaveBeenCalledTimes(1);
    expect(normalizeAndPresentError).toHaveBeenCalledTimes(1);
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
  });
});
