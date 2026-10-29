import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVideoShotDisplayState } from './useVideoShotDisplayState';

describe('useVideoShotDisplayState', () => {
  it('tracks the modal toggle and synchronizes the selected-for-addition flag', () => {
    const { result, rerender } = renderHook(
      (props: { locked: boolean; selectedShotId?: string | null }) =>
        useVideoShotDisplayState({
          shotId: 'shot-1',
          selectedShotId: props.selectedShotId,
          isGenerationsPaneLocked: props.locked,
        }),
      {
        initialProps: {
          locked: false,
          selectedShotId: null,
        },
      },
    );

    expect(result.current.isSelectedForAddition).toBe(false);
    expect(result.current.isVideoModalOpen).toBe(false);

    act(() => {
      result.current.setVideoModalOpen(true);
    });

    expect(result.current.isVideoModalOpen).toBe(true);

    rerender({
      locked: true,
      selectedShotId: 'shot-1',
    });

    expect(result.current.isSelectedForAddition).toBe(true);

    rerender({
      locked: true,
      selectedShotId: 'shot-2',
    });

    expect(result.current.isSelectedForAddition).toBe(false);
  });
});
