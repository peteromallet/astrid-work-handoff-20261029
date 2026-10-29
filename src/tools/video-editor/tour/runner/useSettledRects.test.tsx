// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettledRects } from './useSettledRects';
import type { SpotlightRect } from './useSpotlightRects';

const rect = (x: number, y = 100): SpotlightRect => ({ x, y, width: 100, height: 50 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const frames = (n: number) => act(() => { vi.advanceTimersByTime(16 * n); });

function mount(initial: { beatKey: string; rects: SpotlightRect[] }) {
  return renderHook((props) => useSettledRects(props.beatKey, props.rects), { initialProps: initial });
}

describe('useSettledRects', () => {
  it('shows the first beat at once, without animating', () => {
    const { result } = mount({ beatKey: '1:1:welcome', rects: [] });
    expect(result.current).toEqual({ value: [], animate: false, beatKey: '1:1:welcome' });
  });

  it('keeps the old beat and cutouts until the new targets hold still, then moves once to where they ended', () => {
    const { result, rerender } = mount({ beatKey: '1:1:welcome', rects: [] });
    frames(3);
    rerender({ beatKey: '1:1:compose', rects: [rect(100)] });
    // The target keeps sliding for a few frames: the beat shown (so the card's content) and the cutouts wait.
    for (const x of [140, 180, 220]) {
      frames(1);
      rerender({ beatKey: '1:1:compose', rects: [rect(x)] });
      expect(result.current).toMatchObject({ value: [], beatKey: '1:1:welcome' });
    }
    frames(2);
    expect(result.current).toEqual({ value: [rect(220)], animate: true, beatKey: '1:1:compose' });
    frames(10);
    expect(result.current.value).toEqual([rect(220)]);
  });

  it('moves on after the cap even if the targets never stop moving', () => {
    const { result, rerender } = mount({ beatKey: '1:1:welcome', rects: [] });
    frames(3);
    rerender({ beatKey: '1:1:compose', rects: [rect(100)] });
    for (let i = 0; i < 30; i += 1) {
      frames(1);
      rerender({ beatKey: '1:1:compose', rects: [rect(100 + i * 10)] });
    }
    expect(result.current.beatKey).toBe('1:1:compose');
  });

  it('ignores drift of a pixel or two within a beat and moves once after a real change', () => {
    const { result, rerender } = mount({ beatKey: '1:1:compose', rects: [rect(100)] });
    frames(3);
    rerender({ beatKey: '1:1:compose', rects: [rect(101)] });
    frames(5);
    expect(result.current.value).toEqual([rect(100)]);
    rerender({ beatKey: '1:1:compose', rects: [rect(300)] });
    frames(1);
    expect(result.current.value).toEqual([rect(100)]);
    frames(2);
    expect(result.current).toMatchObject({ value: [rect(300)], animate: true });
  });

  it('follows a viewport resize at once, unanimated', () => {
    const { result, rerender } = mount({ beatKey: '1:1:compose', rects: [rect(100)] });
    frames(3);
    rerender({ beatKey: '1:1:compose', rects: [rect(80)] });
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toMatchObject({ value: [rect(80)], animate: false });
  });
});
