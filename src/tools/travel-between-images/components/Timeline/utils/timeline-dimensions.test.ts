import { describe, expect, it } from 'vitest';
import { TRAILING_ENDPOINT_KEY } from './timeline-constants';
import { getTimelineDimensions, getTrailingEffectiveEnd } from './timeline-dimensions';

describe('timeline-dimensions', () => {
  it('uses a minimum timeline range when no frames exist', () => {
    expect(getTimelineDimensions(new Map())).toEqual({
      fullMin: 0,
      fullMax: 30,
      fullRange: 30,
    });
  });

  it('includes pending frames and negative positions when deriving bounds', () => {
    expect(getTimelineDimensions(
      new Map([
        ['img-1', -12],
        ['img-2', 18],
      ]),
      [null, undefined, 24, -4],
    )).toEqual({
      fullMin: -12,
      fullMax: 30,
      fullRange: 42,
    });
  });

  it('returns no trailing end when there are no eligible trailing frames', () => {
    expect(getTrailingEffectiveEnd({
      framePositions: new Map(),
      imagesCount: 0,
      hasExistingTrailingVideo: false,
    })).toBeNull();

    expect(getTrailingEffectiveEnd({
      framePositions: new Map([
        ['img-1', 0],
        ['img-2', 12],
      ]),
      imagesCount: 2,
      hasExistingTrailingVideo: false,
    })).toBeNull();
  });

  it('calculates the trailing end from the last image frame with the right offset', () => {
    expect(getTrailingEffectiveEnd({
      framePositions: new Map([
        ['img-1', 0],
        [TRAILING_ENDPOINT_KEY, 99],
      ]),
      imagesCount: 1,
      hasExistingTrailingVideo: false,
    })).toBe(49);

    expect(getTrailingEffectiveEnd({
      framePositions: new Map([
        ['img-1', 0],
        ['img-2', 12],
        [TRAILING_ENDPOINT_KEY, 200],
      ]),
      imagesCount: 2,
      hasExistingTrailingVideo: true,
    })).toBe(29);
  });
});
