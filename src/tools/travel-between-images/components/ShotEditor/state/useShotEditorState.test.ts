import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useShotEditorState } from './useShotEditorState';

describe('useShotEditorState', () => {
  it('initializes autoAdjustedAspectRatio to null', () => {
    const { result } = renderHook(() => useShotEditorState());

    expect(result.current.state.autoAdjustedAspectRatio).toBeNull();
  });

  it('updates and clears autoAdjustedAspectRatio through the action callback', () => {
    const { result } = renderHook(() => useShotEditorState());

    act(() => {
      result.current.actions.setAutoAdjustedAspectRatio({
        previousAspectRatio: '1:1',
        adjustedTo: '16:9',
      });
    });

    expect(result.current.state.autoAdjustedAspectRatio).toEqual({
      previousAspectRatio: '1:1',
      adjustedTo: '16:9',
    });

    act(() => {
      result.current.actions.setAutoAdjustedAspectRatio(null);
    });

    expect(result.current.state.autoAdjustedAspectRatio).toBeNull();
  });
});
