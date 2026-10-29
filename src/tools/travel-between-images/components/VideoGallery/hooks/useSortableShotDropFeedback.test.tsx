// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shot } from '@/domains/generation/types';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
  isValidDropTarget: vi.fn(() => true),
  getGenerationDropData: vi.fn(() => null),
  isFileDrag: vi.fn(() => false),
  isVideoGeneration: vi.fn((image: { type?: string | null }) => image.type === 'video'),
  eventHandlers: {} as Record<string, (detail: unknown) => void>,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  isValidDropTarget: (...args: unknown[]) => mocks.isValidDropTarget(...args),
  getGenerationDropData: (...args: unknown[]) => mocks.getGenerationDropData(...args),
  isFileDrag: (...args: unknown[]) => mocks.isFileDrag(...args),
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoGeneration: (...args: unknown[]) => mocks.isVideoGeneration(...args),
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  useAppEventListener: (name: string, handler: (detail: unknown) => void) => {
    mocks.eventHandlers[name] = handler;
  },
}));

import { useSortableShotDropFeedback } from './useSortableShotDropFeedback';

function createShot(images: Array<Record<string, unknown>> = []): Shot {
  return {
    id: 'shot-1',
    images,
  } as Shot;
}

function createDragEvent(overrides: Record<string, unknown> = {}) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { contains: () => false },
    relatedTarget: null,
    dataTransfer: {
      dropEffect: 'none',
      files: [],
    },
    ...overrides,
  } as never;
}

describe('useSortableShotDropFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.eventHandlers = {};
    mocks.isValidDropTarget.mockReturnValue(true);
    mocks.getGenerationDropData.mockReturnValue(null);
    mocks.isFileDrag.mockReturnValue(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('tracks drag-target state for valid drops and clears it on leave', () => {
    const { result } = renderHook(() => useSortableShotDropFeedback({
      shot: createShot(),
      onGenerationDrop: vi.fn(),
    }));
    const event = createDragEvent();

    act(() => {
      result.current.handleDragEnter(event);
      result.current.handleDragOver(event);
    });

    expect(result.current.isDropTarget).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe('copy');

    act(() => {
      result.current.handleDragLeave(createDragEvent());
    });

    expect(result.current.isDropTarget).toBe(false);
  });

  it('handles without-position generation drops through the success lifecycle', async () => {
    mocks.getGenerationDropData.mockReturnValue({ generationId: 'gen-1' });
    const onGenerationDrop = vi.fn(async () => {});
    const { result } = renderHook(() => useSortableShotDropFeedback({
      shot: createShot([{ id: 'img-1', type: 'image' }]),
      onGenerationDrop,
    }));

    await act(async () => {
      await result.current.handleWithoutPositionDrop(createDragEvent());
    });

    expect(onGenerationDrop).toHaveBeenCalledWith(
      'shot-1',
      { generationId: 'gen-1' },
      { withoutPosition: true },
    );
    expect(result.current.withoutPositionDropState).toBe('success');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.withoutPositionDropState).toBe('idle');
    expect(result.current.isDropTarget).toBe(false);
  });

  it('derives pending skeleton counts from upload events and clears the success state afterward', () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useSortableShotDropFeedback>[0]) => useSortableShotDropFeedback(props),
      {
        initialProps: {
          shot: createShot([{ id: 'img-1', type: 'image' }]),
          onGenerationDrop: vi.fn(),
          onFilesDrop: vi.fn(),
        },
      },
    );

    act(() => {
      mocks.eventHandlers['shot-pending-upload']({
        shotId: 'shot-1',
        expectedCount: 2,
        operationId: 'op-1',
      });
    });

    expect(result.current.withPositionDropState).toBe('loading');
    expect(result.current.pendingSkeletonCount).toBe(2);

    rerender({
      shot: createShot([
        { id: 'img-1', type: 'image' },
        { id: 'img-2', type: 'image' },
        { id: 'img-3', type: 'image' },
      ]),
      onGenerationDrop: vi.fn(),
      onFilesDrop: vi.fn(),
    });

    expect(result.current.pendingSkeletonCount).toBe(0);

    act(() => {
      mocks.eventHandlers['shot-pending-upload-succeeded']({
        shotId: 'shot-1',
        operationId: 'op-1',
      });
    });

    expect(result.current.withPositionDropState).toBe('success');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.withPositionDropState).toBe('idle');
  });
});
