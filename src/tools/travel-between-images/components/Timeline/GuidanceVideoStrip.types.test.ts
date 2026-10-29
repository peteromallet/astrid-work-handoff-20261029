import { describe, expect, it } from 'vitest';
import { calculateVideoFrameFromPosition } from './GuidanceVideoStrip.types';

describe('GuidanceVideoStrip.types', () => {
  it('maps normalized positions across the whole video in adjust mode', () => {
    expect(
      calculateVideoFrameFromPosition(0.5, 'adjust', 100, 40, 10, 70),
    ).toBe(49);
    expect(
      calculateVideoFrameFromPosition(2, 'adjust', 100, 40, 10, 70),
    ).toBe(99);
  });

  it('maps output frames into the clipped source range and clamps to the last usable frame', () => {
    expect(
      calculateVideoFrameFromPosition(0.25, 'clip', 200, 40, 50, 90),
    ).toBe(60);
    expect(
      calculateVideoFrameFromPosition(1, 'clip', 200, 40, 50, 90),
    ).toBe(89);
  });
});
