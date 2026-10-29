import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard, useKeyedCopyToClipboard } from '../useCopyToClipboard';

describe('useCopyToClipboard', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    writeTextMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with copied = false', () => {
    const { result } = renderHook(() => useCopyToClipboard('test'));
    expect(result.current.copied).toBe(false);
  });

  it('sets copied to true when handleCopy is called', () => {
    const { result } = renderHook(() => useCopyToClipboard('hello'));
    act(() => {
      result.current.handleCopy();
    });
    expect(result.current.copied).toBe(true);
  });

  it('copies text to clipboard via navigator.clipboard.writeText', () => {
    const { result } = renderHook(() => useCopyToClipboard('clipboard text'));
    act(() => {
      result.current.handleCopy();
    });
    expect(writeTextMock).toHaveBeenCalledWith('clipboard text');
  });

  it('resets copied to false after 2 seconds', () => {
    const { result } = renderHook(() => useCopyToClipboard('text'));
    act(() => {
      result.current.handleCopy();
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it('does nothing when text is undefined', () => {
    const { result } = renderHook(() => useCopyToClipboard(undefined));
    act(() => {
      result.current.handleCopy();
    });
    expect(result.current.copied).toBe(false);
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('does nothing when text is empty string', () => {
    const { result } = renderHook(() => useCopyToClipboard(''));
    act(() => {
      result.current.handleCopy();
    });
    expect(result.current.copied).toBe(false);
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('handles clipboard write failure silently', () => {
    writeTextMock.mockRejectedValueOnce(new Error('clipboard error'));
    const { result } = renderHook(() => useCopyToClipboard('text'));
    act(() => {
      result.current.handleCopy();
    });
    // copied is still true even if writeText fails (feedback already shown)
    expect(result.current.copied).toBe(true);
  });

  it('updates handleCopy when text changes', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useCopyToClipboard(text),
      { initialProps: { text: 'first' } }
    );

    rerender({ text: 'second' });
    act(() => {
      result.current.handleCopy();
    });
    expect(writeTextMock).toHaveBeenCalledWith('second');
  });
});

describe('useKeyedCopyToClipboard', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    writeTextMock.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('sets copied value and resets after timeout when copy succeeds', async () => {
    const { result } = renderHook(() => useKeyedCopyToClipboard<'task-id'>(500));

    await act(async () => {
      await result.current.copyText('hello world', 'task-id');
    });

    expect(writeTextMock).toHaveBeenCalledWith('hello world');
    expect(result.current.copiedValue).toBe('task-id');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.copiedValue).toBeNull();
  });

  it('does not set copied value when clipboard write fails', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('clipboard error'));
    const { result } = renderHook(() => useKeyedCopyToClipboard<string>(500));

    let didCopy = true;
    await act(async () => {
      didCopy = await result.current.copyText('hello world', 'done');
    });

    expect(didCopy).toBe(false);
    expect(result.current.copiedValue).toBeNull();
  });
});
