// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTimelineDimensions: vi.fn(),
  getTrailingEffectiveEnd: vi.fn(),
  useZoom: vi.fn(),
  useGlobalEvents: vi.fn(),
  handleZoomIn: vi.fn(),
  handleZoomOut: vi.fn(),
  handleZoomReset: vi.fn(),
  handleZoomToStart: vi.fn(),
  handleTimelineDoubleClick: vi.fn(),
}));

vi.mock('../../utils/timeline-utils', () => ({
  getTimelineDimensions: mocks.getTimelineDimensions,
  getTrailingEffectiveEnd: mocks.getTrailingEffectiveEnd,
}));

vi.mock('../useZoom', () => ({
  useZoom: mocks.useZoom,
}));

vi.mock('../useGlobalEvents', () => ({
  useGlobalEvents: mocks.useGlobalEvents,
}));

import { useTimelineViewportController } from './useTimelineViewportController';

function createDiv(dimensions: {
  clientWidth?: number;
  scrollWidth?: number;
  scrollLeft?: number;
} = {}) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', {
    value: dimensions.clientWidth ?? 200,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollWidth', {
    value: dimensions.scrollWidth ?? 400,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollLeft', {
    value: dimensions.scrollLeft ?? 0,
    writable: true,
    configurable: true,
  });
  element.scrollTo = vi.fn();
  return element as HTMLDivElement;
}

function createInput(overrides: Partial<Parameters<typeof useTimelineViewportController>[0]> = {}) {
  return {
    framePositions: new Map([['img-1', 0], ['img-2', 20]]),
    pendingDropFrame: 12,
    pendingExternalAddFrame: 36,
    imagesCount: 2,
    hasExistingTrailingVideo: true,
    timelineRef: { current: createDiv({ clientWidth: 200, scrollWidth: 320, scrollLeft: 100 }) } as RefObject<HTMLDivElement>,
    containerRef: { current: createDiv({ clientWidth: 480, scrollWidth: 400 }) } as RefObject<HTMLDivElement>,
    dragState: { isDragging: false, activeId: null },
    shotId: 'shot-1',
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
    ...overrides,
  };
}

describe('useTimelineViewportController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrailingEffectiveEnd.mockReturnValue(80);
    mocks.getTimelineDimensions.mockReturnValue({ fullMin: 0, fullMax: 100, fullRange: 100 });
    mocks.useZoom.mockReturnValue({
      zoomLevel: 2,
      zoomCenter: 40,
      handleZoomIn: mocks.handleZoomIn,
      handleZoomOut: mocks.handleZoomOut,
      handleZoomReset: mocks.handleZoomReset,
      handleZoomToStart: mocks.handleZoomToStart,
      handleTimelineDoubleClick: mocks.handleTimelineDoubleClick,
      isZooming: false,
    });
  });

  it('wires global events, derives dimensions, and zooms from the viewport center', () => {
    const input = createInput();

    const { result } = renderHook(() => useTimelineViewportController(input));

    expect(mocks.getTrailingEffectiveEnd).toHaveBeenCalledWith({
      framePositions: input.framePositions,
      imagesCount: 2,
      hasExistingTrailingVideo: true,
    });
    expect(mocks.getTimelineDimensions).toHaveBeenCalledWith(input.framePositions, [12, 36, 80]);
    expect(mocks.useGlobalEvents).toHaveBeenCalledWith(expect.objectContaining({
      isDragging: false,
      activeId: undefined,
      shotId: 'shot-1',
      handleMouseMove: input.handleMouseMove,
      handleMouseUp: input.handleMouseUp,
      containerRef: input.containerRef,
    }));
    expect(result.current.containerWidth).toBe(480);

    act(() => {
      result.current.handleZoomInToCenter();
      result.current.handleZoomOutFromCenter();
    });

    expect(mocks.handleZoomIn).toHaveBeenCalledWith(50);
    expect(mocks.handleZoomOut).toHaveBeenCalledWith(50);
    expect(result.current.handleZoomReset).toBe(mocks.handleZoomReset);
    expect(result.current.handleZoomToStart).toBe(mocks.handleZoomToStart);
    expect(result.current.handleTimelineDoubleClick).toBe(mocks.handleTimelineDoubleClick);
  });

  it('falls back to fullMin when the viewport center cannot be resolved', () => {
    const input = createInput({
      timelineRef: { current: null } as RefObject<HTMLDivElement>,
      containerRef: { current: null } as RefObject<HTMLDivElement>,
    });
    mocks.getTimelineDimensions.mockReturnValueOnce({ fullMin: -20, fullMax: 80, fullRange: 100 });

    const { result } = renderHook(() => useTimelineViewportController(input));

    act(() => {
      result.current.handleZoomInToCenter();
      result.current.handleZoomOutFromCenter();
    });

    expect(mocks.handleZoomIn).toHaveBeenCalledWith(-20);
    expect(mocks.handleZoomOut).toHaveBeenCalledWith(-20);
  });

  it('preserves drag-start dimensions while dragging and clears them after drag end', async () => {
    mocks.getTimelineDimensions
      .mockReturnValueOnce({ fullMin: 0, fullMax: 100, fullRange: 100 })
      .mockReturnValueOnce({ fullMin: 10, fullMax: 80, fullRange: 70 })
      .mockReturnValueOnce({ fullMin: 10, fullMax: 80, fullRange: 70 });

    const { result, rerender } = renderHook(
      (input) => useTimelineViewportController(input),
      {
        initialProps: createInput({
          dragState: { isDragging: true, activeId: 'img-1' },
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.dragStartDimensionsRef.current).toEqual({
        fullMin: 0,
        fullMax: 100,
        fullRange: 100,
      });
    });

    rerender(createInput({
      dragState: { isDragging: true, activeId: 'img-1' },
    }));

    expect(result.current.fullMin).toBe(0);
    expect(result.current.fullMax).toBe(100);
    expect(result.current.fullRange).toBe(100);

    rerender(createInput({
      dragState: { isDragging: false, activeId: null },
    }));

    await waitFor(() => {
      expect(result.current.dragStartDimensionsRef.current).toBeNull();
    });
  });
});
