import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useUserUIState } from '../useUserUIState';

describe('useUserUIState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('keeps local-test preferences deterministic', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localTest=1');
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(fallback);

    act(() => {
      result.current.update({ darkMode: false });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.value).toEqual({ darkMode: false });
  });

  it('keeps Astrid-authority preferences local', async () => {
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(fallback);

    act(() => {
      result.current.update({ darkMode: false });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.value).toEqual({ darkMode: false });
  });

  it('returns fallback value initially with nothing to load on the Runtime path', () => {
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    expect(result.current.value).toEqual(fallback);
    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.update).toBe('function');
  });

  it('is completely local in Astrid editor mode', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=demo-project&timeline=demo-timeline');

    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(fallback);

    act(() => {
      result.current.update({ darkMode: false });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.value.darkMode).toBe(false);
  });

  it('update changes local value immediately', async () => {
    const fallback = { darkMode: true };
    const { result } = renderHook(() => useUserUIState('theme', fallback));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.update({ darkMode: false });
    });

    expect(result.current.value.darkMode).toBe(false);
  });
});
