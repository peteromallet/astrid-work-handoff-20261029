// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { getQuantizedGap, quantizeTotalFrames } from '../utils';

function isFourNPlusOne(value: number): boolean {
  return (value - 1) % 4 === 0;
}

describe('quantizeTotalFrames', () => {
  it('returns the nearest 4N+1 frame count', () => {
    expect(quantizeTotalFrames(17)).toBe(17);
    expect(quantizeTotalFrames(18)).toBe(17);
    expect(quantizeTotalFrames(19)).toBe(21);
    expect(quantizeTotalFrames(22)).toBe(21);
  });

  it('respects minimum total frames', () => {
    expect(quantizeTotalFrames(5)).toBe(17);
    expect(quantizeTotalFrames(5, 5)).toBe(5);
  });
});

describe('getQuantizedGap', () => {
  it('returns a gap whose resulting total is 4N+1', () => {
    const context = 8;
    const gap = getQuantizedGap(10, context, 17);
    const total = context * 2 + gap;

    expect(gap).toBe(9);
    expect(isFourNPlusOne(total)).toBe(true);
  });

  it('returns at least 1 gap even when desired gap would go non-positive', () => {
    const context = 10;
    const gap = getQuantizedGap(-10, context, 17);
    const total = context * 2 + gap;

    expect(gap).toBeGreaterThanOrEqual(1);
    expect(isFourNPlusOne(total)).toBe(true);
  });
});
