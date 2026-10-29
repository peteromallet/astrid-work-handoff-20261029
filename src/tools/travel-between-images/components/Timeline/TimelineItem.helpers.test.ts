import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAspectRatioStyle: vi.fn(),
}));

vi.mock('@/shared/components/ShotImageManager/utils/image-utils', () => ({
  getAspectRatioStyle: (...args: unknown[]) => mocks.getAspectRatioStyle(...args),
}));

import { TIMELINE_PADDING_OFFSET } from './constants';
import { getTimelineItemAspectRatioStyle, getTimelineItemPosition } from './TimelineItem.helpers';

describe('TimelineItem.helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAspectRatioStyle.mockReturnValue({ aspectRatio: '16/9' });
  });

  describe('getTimelineItemAspectRatioStyle', () => {
    it('uses metadata width and height when available', () => {
      const style = getTimelineItemAspectRatioStyle(
        { metadata: { width: 800, height: 400 } } as never,
        '1:1',
      );
      expect(style).toEqual({ aspectRatio: '2' });
      expect(mocks.getAspectRatioStyle).not.toHaveBeenCalled();
    });

    it('falls back to resolution in original params', () => {
      const style = getTimelineItemAspectRatioStyle(
        {
          metadata: {
            originalParams: {
              orchestrator_details: { resolution: '1920x1080' },
            },
          },
        } as never,
        '1:1',
      );
      expect(style).toEqual({ aspectRatio: `${1920 / 1080}` });
    });

    it('falls back to project ratio style when dimensions are missing', () => {
      const style = getTimelineItemAspectRatioStyle({ metadata: {} } as never, '4:3');
      expect(style).toEqual({ aspectRatio: '16/9' });
      expect(mocks.getAspectRatioStyle).toHaveBeenCalledWith('4:3');
    });
  });

  describe('getTimelineItemPosition', () => {
    it('returns frame position in timeline coordinates', () => {
      const result = getTimelineItemPosition({
        timelineWidth: 1000,
        fullMinFrames: 0,
        fullRange: 100,
        framePosition: 50,
        isDragging: false,
        dragOffset: null,
        originalFramePos: 50,
        currentDragFrame: null,
      });

      const effectiveWidth = 1000 - TIMELINE_PADDING_OFFSET * 2;
      const expectedPixel = TIMELINE_PADDING_OFFSET + (50 / 100) * effectiveWidth;
      expect(result.leftPercent).toBeCloseTo((expectedPixel / 1000) * 100, 6);
      expect(result.displayFrame).toBe(50);
    });

    it('uses drag offset and current drag frame while dragging', () => {
      const result = getTimelineItemPosition({
        timelineWidth: 1000,
        fullMinFrames: 0,
        fullRange: 100,
        framePosition: 60,
        isDragging: true,
        dragOffset: { x: 20, y: 0 },
        originalFramePos: 40,
        currentDragFrame: 42,
      });

      const effectiveWidth = 1000 - TIMELINE_PADDING_OFFSET * 2;
      const originalPixel = TIMELINE_PADDING_OFFSET + (40 / 100) * effectiveWidth;
      expect(result.leftPercent).toBeCloseTo(((originalPixel + 20) / 1000) * 100, 6);
      expect(result.displayFrame).toBe(42);
    });
  });
});
