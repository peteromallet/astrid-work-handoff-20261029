import { describe, expect, it } from 'vitest';
import { trySnapToEdge } from '@/tools/video-editor/lib/coordinate-utils';

const makeRows = (...actions: { id: string; start: number; end: number }[]) => [
  { id: 'V1', actions },
];

describe('trySnapToEdge', () => {
  it('returns unsnapped when the proposed range does not overlap any sibling', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 3, end: 5 }), 'V1', 0, 2)).toEqual({
      time: 0,
      snapped: false,
    });
  });

  it('snaps to a sibling end when there is room after the overlap', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 0, end: 2 }), 'V1', 1, 1)).toEqual({
      time: 2,
      snapped: true,
    });
  });

  it('snaps to a sibling start minus duration when there is room before the overlap', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 3, end: 5 }), 'V1', 2.5, 2)).toEqual({
      time: 1,
      snapped: true,
    });
  });

  it('picks the nearest valid edge when both sides are available', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 3, end: 5 }), 'V1', 4.4, 1)).toEqual({
      time: 5,
      snapped: true,
    });
  });

  it('returns unsnapped when nearby edge candidates still overlap another sibling', () => {
    expect(
      trySnapToEdge(
        makeRows(
          { id: 'clip-a', start: 0, end: 2 },
          { id: 'clip-b', start: 2.25, end: 4.25 },
        ),
        'V1',
        1.5,
        2,
        undefined,
        0.6,
      ),
    ).toEqual({
      time: 1.5,
      snapped: false,
    });
  });

  it('cannot snap left of zero and falls back to the right edge', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 0, end: 2 }), 'V1', 0.5, 2)).toEqual({
      time: 2,
      snapped: true,
    });
  });

  it('picks the nearest valid edge across multiple siblings', () => {
    expect(
      trySnapToEdge(
        makeRows(
          { id: 'clip-a', start: 0, end: 2 },
          { id: 'clip-b', start: 2, end: 4 },
          { id: 'clip-c', start: 6, end: 8 },
        ),
        'V1',
        1.5,
        2,
        undefined,
        10,
      ),
    ).toEqual({
      time: 4,
      snapped: true,
    });
  });

  it('snaps to the start of an exact-fit gap between siblings', () => {
    expect(
      trySnapToEdge(
        makeRows(
          { id: 'clip-a', start: 0, end: 2 },
          { id: 'clip-b', start: 4, end: 6 },
        ),
        'V1',
        1.5,
        2,
      ),
    ).toEqual({
      time: 2,
      snapped: true,
    });
  });

  it('treats a string excludeClipIds value as a single excluded clip', () => {
    expect(
      trySnapToEdge(
        makeRows(
          { id: 'clip-a', start: 0, end: 2 },
          { id: 'clip-b', start: 4, end: 6 },
        ),
        'V1',
        0.5,
        2,
        'clip-a',
      ),
    ).toEqual({
      time: 0.5,
      snapped: false,
    });
  });

  it('treats a Set excludeClipIds value as multiple excluded clips', () => {
    expect(
      trySnapToEdge(
        makeRows(
          { id: 'clip-a', start: 0, end: 2 },
          { id: 'clip-b', start: 2, end: 4 },
          { id: 'clip-c', start: 5, end: 7 },
        ),
        'V1',
        1,
        3,
        new Set(['clip-a', 'clip-b']),
      ),
    ).toEqual({
      time: 1,
      snapped: false,
    });
  });

  it('does not exclude anything when excludeClipIds is undefined', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 0, end: 2 }), 'V1', 0.5, 2)).toEqual({
      time: 2,
      snapped: true,
    });
  });

  it('returns unsnapped when the nearest valid edge exceeds the default threshold', () => {
    expect(trySnapToEdge(makeRows({ id: 'clip-a', start: 0, end: 2 }), 'V1', 0.1, 1)).toEqual({
      time: 0.1,
      snapped: false,
    });
  });

  it('respects a custom threshold override', () => {
    expect(
      trySnapToEdge(makeRows({ id: 'clip-a', start: 0, end: 2 }), 'V1', 0.1, 1, undefined, 2),
    ).toEqual({
      time: 2,
      snapped: true,
    });
  });
});
