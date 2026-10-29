import { describe, expect, it } from 'vitest';
import { TRAILING_ENDPOINT_KEY } from './timeline-constants';
import { getPairInfo } from './timeline-pairs';

describe('timeline-pairs', () => {
  it('sorts image positions into contiguous pairs and ignores the trailing endpoint', () => {
    expect(getPairInfo(new Map([
      ['img-b', 20],
      [TRAILING_ENDPOINT_KEY, 40],
      ['img-a', 0],
      ['img-c', 35],
    ]))).toEqual([
      {
        index: 0,
        startId: 'img-a',
        endId: 'img-b',
        startFrame: 0,
        endFrame: 20,
        frames: 20,
        generationStart: 0,
        contextStart: 20,
        contextEnd: 20,
      },
      {
        index: 1,
        startId: 'img-b',
        endId: 'img-c',
        startFrame: 20,
        endFrame: 35,
        frames: 15,
        generationStart: 20,
        contextStart: 35,
        contextEnd: 35,
      },
    ]);
  });
});
