import { useState, useRef, useEffect, useCallback } from 'react';
import type { AuthoredVideoMetadata, VideoMetadata } from '@/shared/lib/media/videoMetadata';

interface UseBatchGuidanceVideoControllerParams {
  shotId: string;
  videoUrl: string | null;
  videoMetadata: AuthoredVideoMetadata | null;
  treatment: 'adjust' | 'clip';
  timelineFramePositions: number[];
  onVideoUploaded: (videoUrl: string | null, metadata: VideoMetadata | null, resourceId?: string) => void;
}

function formatAdjustModeDescription(totalVideoFrames: number, timelineFrames: number): string {
  if (totalVideoFrames === 0 || timelineFrames === 0) return '';

  if (totalVideoFrames > timelineFrames) {
    const framesToDrop = totalVideoFrames - timelineFrames;
    return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll drop ${framesToDrop} frame${framesToDrop === 1 ? '' : 's'} to compress your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
  }

  if (totalVideoFrames < timelineFrames) {
    const framesToDuplicate = timelineFrames - totalVideoFrames;
    return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll duplicate ${framesToDuplicate} frame${framesToDuplicate === 1 ? '' : 's'} to stretch your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
  }

  return `Perfect! Your input video has ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'}, matching your timeline exactly.`;
}

function formatClipModeDescription(totalVideoFrames: number, timelineFrames: number): string {
  if (totalVideoFrames === 0 || timelineFrames === 0) return '';

  if (totalVideoFrames > timelineFrames) {
    const unusedFrames = totalVideoFrames - timelineFrames;
    return `Your video will guide all ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} of your timeline. The last ${unusedFrames} frame${unusedFrames === 1 ? '' : 's'} of your video (frame${unusedFrames === 1 ? '' : 's'} ${timelineFrames + 1}-${totalVideoFrames}) will be ignored.`;
  }

  if (totalVideoFrames < timelineFrames) {
    const uncoveredFrames = timelineFrames - totalVideoFrames;
    return `Your video will guide the first ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} of your timeline. The last ${uncoveredFrames} frame${uncoveredFrames === 1 ? '' : 's'} (frame${uncoveredFrames === 1 ? '' : 's'} ${totalVideoFrames + 1}-${timelineFrames}) won't have video guidance.`;
  }

  return `Perfect! Your video length matches your timeline exactly (${timelineFrames} frame${timelineFrames === 1 ? '' : 's'}).`;
}

export function useBatchGuidanceVideoController({
  shotId,
  videoUrl,
  videoMetadata,
  treatment,
  timelineFramePositions,
  onVideoUploaded,
}: UseBatchGuidanceVideoControllerParams) {
  const [currentTimelineFrame, setCurrentTimelineFrame] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const minFrame = timelineFramePositions.length > 0 ? Math.min(...timelineFramePositions) : 0;
  const maxFrame = timelineFramePositions.length > 0 ? Math.max(...timelineFramePositions) : 0;
  const timelineFrames = maxFrame - minFrame + 1;
  const effectiveMetadata = videoMetadata &&
    typeof videoMetadata.total_frames === 'number' &&
    typeof videoMetadata.frame_rate === 'number'
    ? videoMetadata
    : null;
  const totalVideoFrames = effectiveMetadata?.total_frames ?? 0;

  const videoCoversFrames = treatment === 'clip' ? Math.min(totalVideoFrames, timelineFrames) : timelineFrames;
  const lastCoveredFrame = treatment === 'clip' ? minFrame + videoCoversFrames - 1 : maxFrame;
  const isFrameBeyondVideoCoverage = treatment === 'clip' && currentTimelineFrame > lastCoveredFrame;

  const adjustModeDescription = formatAdjustModeDescription(totalVideoFrames, timelineFrames);
  const clipModeDescription = formatClipModeDescription(totalVideoFrames, timelineFrames);

  const drawTimelineFrame = useCallback((timelineFrame: number) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !effectiveMetadata) return;

    let videoFrame: number;
    if (treatment === 'adjust') {
      const timelineRange = maxFrame - minFrame;
      const normalizedPosition = timelineRange > 0 ? (timelineFrame - minFrame) / timelineRange : 0;
      videoFrame = Math.floor(normalizedPosition * ((effectiveMetadata.total_frames ?? 0) - 1));
    } else {
      const offsetFromStart = timelineFrame - minFrame;
      videoFrame = Math.min(offsetFromStart, (effectiveMetadata.total_frames ?? 0) - 1);
    }

    const fps = effectiveMetadata.frame_rate;
    if (!fps || fps <= 0 || !isFinite(fps)) {
      console.error('[BatchGuidanceVideo] Invalid frame_rate:', fps);
      return;
    }

    const timeInSeconds = videoFrame / fps;
    if (!isFinite(timeInSeconds) || timeInSeconds < 0) {
      console.error('[BatchGuidanceVideo] Invalid time value:', { videoFrame, fps, timeInSeconds });
      return;
    }

    video.currentTime = timeInSeconds;

    const handleSeeked = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      video.removeEventListener('seeked', handleSeeked);
    };

    video.addEventListener('seeked', handleSeeked);
  }, [effectiveMetadata, treatment, minFrame, maxFrame]);

  const handleFrameChange = useCallback((value: number) => {
    setCurrentTimelineFrame(value);
    drawTimelineFrame(value);
  }, [drawTimelineFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadedMetadata = () => {
      drawTimelineFrame(minFrame);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [videoUrl, minFrame, drawTimelineFrame]);

  const handleRemoveVideo = useCallback(() => {
    onVideoUploaded(null, null, undefined);
  }, [onVideoUploaded]);

  return {
    videoRef,
    canvasRef,
    minFrame,
    maxFrame,
    timelineFrames,
    totalVideoFrames,
    videoCoversFrames,
    lastCoveredFrame,
    isFrameBeyondVideoCoverage,
    currentTimelineFrame,
    adjustModeDescription,
    clipModeDescription,
    handleFrameChange,
    handleRemoveVideo,
  };
}
