import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './useElementWidth.ts';

describe('useElementWidth', () => {
  const OriginalResizeObserver = window.ResizeObserver;

  afterEach(() => {
    window.ResizeObserver = OriginalResizeObserver;
  });

  it('reports each width the ResizeObserver delivers for the attached element', () => {
    let notify: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { notify = callback; }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const { result } = renderHook(() => useElementWidth<HTMLDivElement>());
    expect(result.current[1]).toBeNull();

    const element = document.createElement('div');
    act(() => result.current[0](element));
    act(() => notify([{ contentRect: { width: 340 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(result.current[1]).toBe(340);

    act(() => notify([{ contentRect: { width: 180 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(result.current[1]).toBe(180);

    act(() => result.current[0](null));
    expect(disconnect).toHaveBeenCalled();
  });
});
