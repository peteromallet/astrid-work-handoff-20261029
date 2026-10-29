import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePaneLockPolicyState } from './usePaneLockPolicyState';
import { acquirePaneControlsHost } from '@/shared/state/paneControlsHost';

const useUserUIStateSpy = vi.fn();
const useIsMobileSpy = vi.fn();
const useIsTabletSpy = vi.fn();

vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: (...args: unknown[]) => useUserUIStateSpy(...args),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => useIsMobileSpy(),
  useIsTablet: () => useIsTabletSpy(),
}));

describe('usePaneLockPolicyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates persisted locks and updates lock state on desktop', () => {
    const savePaneLocks = vi.fn();
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: true, gens: false, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result } = renderHook(() => usePaneLockPolicyState());

    expect(result.current.locks).toEqual({ shots: false, tasks: true, gens: false, editor: false });
    expect(result.current.isTasksPaneOpenState).toBe(true);

    act(() => {
      result.current.setIsShotsPaneLocked(true);
    });
    expect(result.current.locks.shots).toBe(true);
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: true });

    act(() => {
      result.current.setIsTasksPaneLocked(false);
    });
    expect(result.current.isTasksPaneOpenState).toBe(false);
    expect(savePaneLocks).toHaveBeenCalledWith({ tasks: false });

    act(() => {
      result.current.resetAllPaneLocks();
    });
    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false, editor: false });
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: false, tasks: false, gens: false, editor: false });
    expect(result.current.isTasksPaneOpenState).toBe(false);
  });

  it('opens a chat pane through the lock path: the same store state as pressing the lock button', () => {
    const savePaneLocks = vi.fn();
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: false, gens: false, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result: lockButton } = renderHook(() => usePaneLockPolicyState());
    act(() => {
      lockButton.current.setIsTasksPaneLocked(true);
    });
    const afterLockButton = { locks: lockButton.current.locks, open: lockButton.current.isTasksPaneOpenState };

    const { result: chat } = renderHook(() => usePaneLockPolicyState());
    act(() => {
      chat.current.setIsTasksPaneLocked(true);
    });

    expect(chat.current.locks.tasks).toBe(true);
    expect(chat.current.isTasksPaneOpenState).toBe(true);
    expect({ locks: chat.current.locks, open: chat.current.isTasksPaneOpenState }).toEqual(afterLockButton);
    expect(savePaneLocks).toHaveBeenLastCalledWith({ tasks: true });
  });

  it('a temporary programmatic open leaves the Tasks lock off, so the pane is not locked', () => {
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: false, gens: false, editor: false },
      update: vi.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => usePaneLockPolicyState());
    act(() => {
      result.current.setIsTasksPaneOpen(true);
    });
    expect(result.current.isTasksPaneOpenState).toBe(true);
    expect(result.current.locks.tasks).toBe(false);
  });

  it('never locks a transient-pane host (phones or pages hosting their own pane controls)', () => {
    const savePaneLocks = vi.fn();
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: false, gens: false, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });
    const release = acquirePaneControlsHost();

    const { result } = renderHook(() => usePaneLockPolicyState());
    act(() => {
      result.current.setIsTasksPaneLocked(true);
    });
    expect(result.current.locks.tasks).toBe(false);
    expect(result.current.isTasksPaneOpenState).toBe(false);
    expect(savePaneLocks).not.toHaveBeenCalled();
    release();
  });

  it('enforces exclusive locks on tablet/mobile, keeps small mobile unlocked, and preserves the editor key', () => {
    const savePaneLocks = vi.fn();

    useIsMobileSpy.mockReturnValue(true);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: true, tasks: true, gens: false, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result, rerender } = renderHook(() => usePaneLockPolicyState());
    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false, editor: false });

    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(true);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: false, gens: true, editor: true },
      update: savePaneLocks,
      isLoading: false,
    });
    rerender();

    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: true, editor: false });

    act(() => {
      result.current.setIsEditorPaneLocked(true);
    });

    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false, editor: true });
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: false, tasks: false, gens: false, editor: true });
  });

  it('closes the programmatic tasks pane when another exclusive lock is activated on tablet', () => {
    const savePaneLocks = vi.fn();

    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(true);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: true, gens: false, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result } = renderHook(() => usePaneLockPolicyState());

    expect(result.current.isTasksPaneOpenState).toBe(true);

    act(() => {
      result.current.setIsEditorPaneLocked(true);
    });

    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false, editor: true });
    expect(result.current.isTasksPaneOpenState).toBe(false);
  });

  it('keeps a saved tablet lock but does not apply it while a page hosts the pane entry points', () => {
    const savePaneLocks = vi.fn();
    useIsMobileSpy.mockReturnValue(true);
    useIsTabletSpy.mockReturnValue(true);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: false, gens: true, editor: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result } = renderHook(() => usePaneLockPolicyState());
    expect(result.current.locks.gens).toBe(true);

    let release = () => {};
    act(() => { release = acquirePaneControlsHost(); });
    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false, editor: false });
    expect(savePaneLocks).not.toHaveBeenCalled();

    act(() => release());
    expect(result.current.locks.gens).toBe(true);
  });
});

describe('usePaneLockPolicyState Tasks pane lock persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Hold the fallback in state, as the real hook does, so a remount reads the value the hook saved before it.
    useUserUIStateSpy.mockImplementation((_key: string, fallback: unknown) => {
      const [value] = useState(fallback);
      return { value, update: vi.fn(), isLoading: false };
    });
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
  });

  it('opens the Tasks pane locked on a first desktop visit', () => {
    const { result } = renderHook(() => usePaneLockPolicyState());

    expect(result.current.locks.tasks).toBe(true);
    expect(result.current.isTasksPaneOpenState).toBe(true);
  });

  it('restores a Tasks pane locked closed after a remount', () => {
    const first = renderHook(() => usePaneLockPolicyState());
    act(() => {
      first.result.current.setIsTasksPaneLocked(false);
    });
    first.unmount();

    const second = renderHook(() => usePaneLockPolicyState());
    expect(second.result.current.locks.tasks).toBe(false);
    expect(second.result.current.isTasksPaneOpenState).toBe(false);
  });

  it('restores a Tasks pane locked open after a remount', () => {
    const first = renderHook(() => usePaneLockPolicyState());
    act(() => {
      first.result.current.setIsTasksPaneLocked(false);
    });
    first.unmount();

    const second = renderHook(() => usePaneLockPolicyState());
    act(() => {
      second.result.current.setIsTasksPaneLocked(true);
    });
    second.unmount();

    const third = renderHook(() => usePaneLockPolicyState());
    expect(third.result.current.locks.tasks).toBe(true);
    expect(third.result.current.isTasksPaneOpenState).toBe(true);
  });

  it('does not apply the locked-open default on a phone', () => {
    useIsMobileSpy.mockReturnValue(true);

    const { result } = renderHook(() => usePaneLockPolicyState());

    expect(result.current.locks.tasks).toBe(false);
    expect(result.current.isTasksPaneOpenState).toBe(false);
  });
});
