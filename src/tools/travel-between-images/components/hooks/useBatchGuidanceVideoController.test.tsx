// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBatchGuidanceVideoController } from './useBatchGuidanceVideoController';

describe('useBatchGuidanceVideoController', () => {
  it('derives timeline/video coverage descriptions', () => {
    const { result } = renderHook(() => useBatchGuidanceVideoController({
      shotId: 'shot-1',
      videoUrl: 'https://cdn.example.com/input.mp4',
      videoMetadata: { total_frames: 7, frame_rate: 24 } as never,
      treatment: 'adjust',
      timelineFramePositions: [10, 12, 14],
      onVideoUploaded: vi.fn(),
    }));

    expect(result.current.minFrame).toBe(10);
    expect(result.current.maxFrame).toBe(14);
    expect(result.current.timelineFrames).toBe(5);
    expect(result.current.videoCoversFrames).toBe(5);
    expect(result.current.adjustModeDescription).toContain("drop 2 frames");
  });

  it('describes a clipped video and flags frames beyond its coverage', () => {
    const { result } = renderHook(() => useBatchGuidanceVideoController({
      shotId: 'shot-1',
      videoUrl: 'https://cdn.example.com/input.mp4',
      videoMetadata: { total_frames: 3, frame_rate: 24 } as never,
      treatment: 'clip',
      timelineFramePositions: [0, 4],
      onVideoUploaded: vi.fn(),
    }));

    expect(result.current.videoCoversFrames).toBe(3);
    expect(result.current.lastCoveredFrame).toBe(2);
    expect(result.current.clipModeDescription).toContain("won't have video guidance");
  });

  it('clears the guidance video through the callback', () => {
    const onVideoUploaded = vi.fn();
    const { result } = renderHook(() => useBatchGuidanceVideoController({
      shotId: 'shot-1',
      videoUrl: 'https://cdn.example.com/input.mp4',
      videoMetadata: { total_frames: 5, frame_rate: 24 } as never,
      treatment: 'clip',
      timelineFramePositions: [0, 1, 2],
      onVideoUploaded,
    }));

    result.current.handleRemoveVideo();

    expect(onVideoUploaded).toHaveBeenCalledWith(null, null, undefined);
  });
});
