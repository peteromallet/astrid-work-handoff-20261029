import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyHeader } from '../useStickyHeader';

function createHeaderRef({
  left = 24,
  width = 480,
  top = 120,
}: {
  left?: number;
  width?: number;
  top?: number;
}): React.RefObject<HTMLDivElement> {
  const element = {
    getBoundingClientRect: () => ({
      left,
      width,
      top,
      right: left + width,
      bottom: top + 40,
      height: 40,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLDivElement;

  return { current: element } as React.RefObject<HTMLDivElement>;
}

describe('useStickyHeader', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates header and stable bounds from the header ref element', () => {
    const headerRef = createHeaderRef({ left: 18, width: 360 });
    const { result } = renderHook(() =>
      useStickyHeader({
        headerRef,
        isMobile: false,
        enabled: false,
      }),
    );

    expect(result.current.headerBounds).toEqual({ left: 0, width: 0 });
    expect(result.current.stableBounds).toEqual({ left: 0, width: 0 });

    act(() => {
      result.current.updateHeaderBounds();
    });

    expect(result.current.headerBounds).toEqual({ left: 18, width: 360 });
    expect(result.current.stableBounds).toEqual({ left: 18, width: 360 });
  });

  it('becomes sticky when scroll is beyond computed threshold', () => {
    Object.defineProperty(window, 'pageYOffset', { value: 300, writable: true, configurable: true });
    const headerRef = createHeaderRef({ top: -200 });

    const { result } = renderHook(() =>
      useStickyHeader({
        headerRef,
        isMobile: false,
        enabled: true,
      }),
    );

    expect(result.current.isSticky).toBe(true);
  });
});
