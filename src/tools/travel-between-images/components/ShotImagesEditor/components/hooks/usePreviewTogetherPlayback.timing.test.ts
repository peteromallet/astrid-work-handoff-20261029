// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  computeSegmentTiming,
  scrollCurrentThumbnailIntoView,
} from './usePreviewTogetherPlayback.timing';

describe('usePreviewTogetherPlayback.timing', () => {
  it('computes durations with frame-based fallbacks and cumulative offsets', () => {
    expect(
      computeSegmentTiming([
        { durationFromFrames: 1.5 },
        {},
        { durationFromFrames: 3 },
      ] as never),
    ).toEqual({
      durations: [1.5, 2, 3],
      offsets: [0, 1.5, 3.5],
    });
  });

  it('scrolls the current thumbnail into view only when the strip overflows', () => {
    const compactContainer = document.createElement('div') as HTMLDivElement;
    Object.defineProperty(compactContainer, 'offsetWidth', { value: 300, configurable: true });
    compactContainer.scrollTo = vi.fn();

    scrollCurrentThumbnailIntoView(compactContainer, 1, 3);
    expect(compactContainer.scrollTo).not.toHaveBeenCalled();

    const wideContainer = document.createElement('div') as HTMLDivElement;
    Object.defineProperty(wideContainer, 'offsetWidth', { value: 120, configurable: true });
    wideContainer.scrollTo = vi.fn();

    scrollCurrentThumbnailIntoView(wideContainer, 4, 6);
    expect(wideContainer.scrollTo).toHaveBeenCalledWith({
      left: 260,
      behavior: 'smooth',
    });
  });
});
