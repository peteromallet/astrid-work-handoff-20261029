import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileImageSelection } from '../useMobileImageSelection';

const mocks = vi.hoisted(() => ({
  dispatchAppEvent: vi.fn(),
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  dispatchAppEvent: mocks.dispatchAppEvent,
}));

describe('useMobileImageSelection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.dispatchAppEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toggles selection and shows the selection bar after delay', () => {
    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMobileImageSelection({ readOnly: false, onSelectionChange }),
    );

    act(() => {
      result.current.handleMobileTap('img-1');
    });

    expect(result.current.mobileSelectedIds).toEqual(['img-1']);
    expect(result.current.isInMoveMode).toBe(true);
    expect(result.current.showSelectionBar).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.showSelectionBar).toBe(true);

    act(() => {
      result.current.handleMobileTap('img-1');
    });
    expect(result.current.mobileSelectedIds).toEqual([]);
    expect(result.current.showSelectionBar).toBe(false);

    expect(onSelectionChange).toHaveBeenCalledWith(true);
    expect(mocks.dispatchAppEvent).toHaveBeenCalledWith('mobileSelectionActive', true);
  });

  it('ignores mobile taps in read-only mode', () => {
    const { result } = renderHook(() =>
      useMobileImageSelection({ readOnly: true }),
    );

    act(() => {
      result.current.handleMobileTap('img-1');
    });

    expect(result.current.mobileSelectedIds).toEqual([]);
    expect(result.current.isInMoveMode).toBe(false);
  });

  it('clears selection and emits inactive state', () => {
    const onSelectionChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useMobileImageSelection({ readOnly: false, onSelectionChange }),
    );

    act(() => {
      result.current.setMobileSelectedIds(['img-1', 'img-2']);
    });
    expect(result.current.mobileSelectedIds).toEqual(['img-1', 'img-2']);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.mobileSelectedIds).toEqual([]);

    unmount();
    expect(onSelectionChange).toHaveBeenCalledWith(false);
    expect(mocks.dispatchAppEvent).toHaveBeenCalledWith('mobileSelectionActive', false);
  });
});
