import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock errorHandler before importing hook
vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { usePersistentState } from '../usePersistentState';

describe('usePersistentState', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStorageMock[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
      (key: string) => {
        delete localStorageMock[key];
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default value when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistentState('test-key', 'default'));

    expect(result.current[0]).toBe('default');
  });

  it('reads initial value from localStorage', () => {
    localStorageMock['test-key'] = JSON.stringify('stored-value');

    const { result } = renderHook(() => usePersistentState('test-key', 'default'));

    expect(result.current[0]).toBe('stored-value');
  });

  it('updates localStorage when state changes', () => {
    const { result } = renderHook(() => usePersistentState('test-key', 'default'));

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    expect(localStorageMock['test-key']).toBe(JSON.stringify('new-value'));
  });

  it('handles object values', () => {
    const defaultObj = { count: 0, name: 'test' };
    const { result } = renderHook(() => usePersistentState('obj-key', defaultObj));

    expect(result.current[0]).toEqual(defaultObj);

    act(() => {
      result.current[1]({ count: 1, name: 'updated' });
    });

    expect(result.current[0]).toEqual({ count: 1, name: 'updated' });
    expect(localStorageMock['obj-key']).toBe(JSON.stringify({ count: 1, name: 'updated' }));
  });

  it('handles array values', () => {
    const { result } = renderHook(() => usePersistentState<string[]>('arr-key', []));

    act(() => {
      result.current[1](['a', 'b', 'c']);
    });

    expect(result.current[0]).toEqual(['a', 'b', 'c']);
  });

  it('handles boolean values', () => {
    const { result } = renderHook(() => usePersistentState('bool-key', false));

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
  });

  it('returns default when localStorage has invalid JSON', () => {
    localStorageMock['bad-key'] = 'not-valid-json{{{';

    const { result } = renderHook(() => usePersistentState('bad-key', 'fallback'));

    expect(result.current[0]).toBe('fallback');
  });

  it('syncs other hook instances with the same key in this tab through the settings store', () => {
    const first = renderHook(() => usePersistentState('shared-key', 'initial'));
    const second = renderHook(() => usePersistentState('shared-key', 'initial'));

    act(() => {
      first.result.current[1]('updated');
    });

    expect(first.result.current[0]).toBe('updated');
    expect(second.result.current[0]).toBe('updated');
  });

  it('responds to a change another tab makes to the same key (a storage event)', () => {
    const { result } = renderHook(() => usePersistentState('shared-key', 'initial'));

    act(() => {
      localStorageMock['shared-key'] = JSON.stringify('external-update');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'shared-key',
        newValue: JSON.stringify('external-update'),
        storageArea: localStorage,
      }));
    });

    expect(result.current[0]).toBe('external-update');
  });

  it('ignores another tab\'s change to a different key', () => {
    const { result } = renderHook(() => usePersistentState('my-key', 'initial'));

    act(() => {
      localStorageMock['other-key'] = JSON.stringify('should-not-apply');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'other-key',
        newValue: JSON.stringify('should-not-apply'),
        storageArea: localStorage,
      }));
    });

    expect(result.current[0]).toBe('initial');
  });

  it('handles localStorage not available gracefully', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage not available');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage not available');
    });

    const { result } = renderHook(() => usePersistentState('test', 'default'));

    // Should fall back to default value without crashing
    expect(result.current[0]).toBe('default');
  });
});
