import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTimelineUiState } from './useTimelineUiState';

describe('useTimelineUiState', () => {
  it('exposes default values and max gap contract', () => {
    const { result } = renderHook(() => useTimelineUiState());

    expect(result.current.resetGap).toBe(50);
    expect(result.current.maxGap).toBe(81);
  });

  it('updates state through setter callbacks', () => {
    const { result } = renderHook(() => useTimelineUiState());

    act(() => {
      result.current.setResetGap(72);
    });

    expect(result.current.resetGap).toBe(72);
  });

  it('uses model-provided max gap and default gap when supplied', () => {
    const { result } = renderHook(() => useTimelineUiState({
      maxFrameLimit: 241,
      defaultFrameGap: 97,
    }));

    expect(result.current.maxGap).toBe(241);
    expect(result.current.resetGap).toBe(97);
  });

  it('re-syncs reset gap when the model default changes', () => {
    const { result, rerender } = renderHook(
      ({ defaultFrameGap }: { defaultFrameGap: number }) => useTimelineUiState({
        maxFrameLimit: 81,
        defaultFrameGap,
      }),
      { initialProps: { defaultFrameGap: 61 } },
    );

    expect(result.current.resetGap).toBe(61);

    rerender({ defaultFrameGap: 97 });
    expect(result.current.resetGap).toBe(97);
  });
});
