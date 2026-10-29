import { describe, expect, it } from 'vitest';
import { sourceToTimelineTime, timelineToSourceTime } from './sourceTime.ts';

describe('source and timeline time arithmetic', () => {
  it('maps trimmed, sped-up clip times in both directions', () => {
    const clip = { at: 12, from: 4, speed: 2 };
    expect(sourceToTimelineTime(clip, 10)).toBe(15);
    expect(timelineToSourceTime(clip, 15)).toBe(10);
  });

  it('uses normal speed when a clip has no valid speed', () => {
    const clip = { at: 3, from: 1, speed: 0 };
    expect(sourceToTimelineTime(clip, 5)).toBe(7);
    expect(timelineToSourceTime(clip, 7)).toBe(5);
  });
});
