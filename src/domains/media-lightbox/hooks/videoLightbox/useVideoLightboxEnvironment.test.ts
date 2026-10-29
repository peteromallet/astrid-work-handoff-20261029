import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoLightboxMode } from './useVideoLightboxEnvironment';
import type { SegmentSlotModeData } from '../../types';

describe('useVideoLightboxMode navigation', () => {
  it('uses the regular next and previous callbacks', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const { result } = renderHook(() => useVideoLightboxMode({
      navigation: { hasNext: true, hasPrevious: true, onNext, onPrevious },
    }));

    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
    result.current.handleSlotNavNext();
    result.current.handleSlotNavPrev();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it('navigates between segment slots and reports the slot boundaries', () => {
    const onNavigateToPair = vi.fn();
    const segmentSlotMode = {
      currentIndex: 1,
      totalPairs: 3,
      pairData: {
        index: 1,
        frames: 10,
        startFrame: 10,
        endFrame: 19,
        startImage: null,
        endImage: null,
      },
      segmentVideo: null,
      onNavigateToPair,
      projectId: 'project-1',
      shotId: 'shot-1',
    } satisfies Partial<SegmentSlotModeData>;
    const { result } = renderHook(() => useVideoLightboxMode({
      segmentSlotMode: segmentSlotMode as SegmentSlotModeData,
    }));

    expect(result.current.isSegmentSlotMode).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
    expect(result.current.hasNext).toBe(true);
    result.current.handleSlotNavPrev();
    result.current.handleSlotNavNext();
    expect(onNavigateToPair.mock.calls).toEqual([[0], [2]]);
  });

  it('disables segment navigation at either end', () => {
    const segmentSlotMode = {
      currentIndex: 0,
      totalPairs: 1,
      segmentVideo: null,
      onNavigateToPair: vi.fn(),
    } as unknown as SegmentSlotModeData;
    const { result } = renderHook(() => useVideoLightboxMode({ segmentSlotMode }));

    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(false);
  });
});
