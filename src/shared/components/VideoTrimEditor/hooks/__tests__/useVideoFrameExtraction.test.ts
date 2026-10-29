import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVideoFrameExtraction } from '../useVideoFrameExtraction';
import type { TrimState } from '@/shared/types/videoTrim';

const baseTrimState: TrimState = {
  startTrim: 0.2,
  endTrim: 0.3,
  videoDuration: 12,
  isValid: true,
};

describe('useVideoFrameExtraction', () => {
  it('returns initial frame extraction state', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction({
        videoUrl: 'video-a.mp4',
        trimState: baseTrimState,
      }),
    );

    expect(result.current.startFrame).toBeNull();
    expect(result.current.endFrame).toBeNull();
    expect(result.current.isVideoReady).toBe(false);
    expect(result.current.frameExtractionVideoRef.current).toBeNull();
    expect(result.current.canvasRef.current).toBeNull();
    expect(typeof result.current.handleVideoLoaded).toBe('function');
  });

  it('marks the video as ready and resets readiness when video source changes', () => {
    const { result, rerender } = renderHook(
      (props: { videoUrl?: string; trimState: TrimState }) => useVideoFrameExtraction(props),
      {
        initialProps: {
          videoUrl: 'video-a.mp4',
          trimState: baseTrimState,
        },
      },
    );

    act(() => {
      result.current.handleVideoLoaded();
    });
    expect(result.current.isVideoReady).toBe(true);

    rerender({
      videoUrl: 'video-b.mp4',
      trimState: baseTrimState,
    });

    expect(result.current.isVideoReady).toBe(false);
    expect(result.current.startFrame).toBeNull();
    expect(result.current.endFrame).toBeNull();
  });

  it('keeps frames empty when duration is zero', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction({
        videoUrl: 'video-a.mp4',
        trimState: { ...baseTrimState, videoDuration: 0 },
      }),
    );

    act(() => {
      result.current.handleVideoLoaded();
    });

    expect(result.current.startFrame).toBeNull();
    expect(result.current.endFrame).toBeNull();
  });
});
