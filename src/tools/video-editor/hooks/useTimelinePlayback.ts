import { useCallback, useRef, useState } from 'react';
import type { PreviewHandle } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx';
import { useTimelineSync } from '@/tools/video-editor/hooks/useTimelineSync.ts';
import type { TimelineCanvasHandle } from '@/tools/video-editor/types/timeline-canvas.ts';
import { CENTISECOND_TIME_OPTIONS, formatTime } from '@/shared/lib/timeFormatting';

export interface UseTimelinePlaybackResult {
  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  timelineRef: React.RefObject<TimelineCanvasHandle>;
  previewRef: React.RefObject<PreviewHandle>;
  playerContainerRef: React.RefObject<HTMLDivElement>;
  timelineWrapperRef: React.RefObject<HTMLDivElement>;
  onPreviewTimeUpdate: (time: number) => void;
  onCursorDrag: (time: number) => void;
  onClickTimeArea: (time: number) => undefined;
  formatTime: (time: number) => string;
}

export function useTimelinePlayback(): UseTimelinePlaybackResult {
  const timelineRef = useRef<TimelineCanvasHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);
  const isSyncingFromPreview = useRef(false);
  const isSyncingFromTimeline = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);

  const { onPreviewTimeUpdate, onCursorDrag, onClickTimeArea } = useTimelineSync({
    timelineRef,
    previewRef,
    setCurrentTime,
    isSyncingFromPreview,
    isSyncingFromTimeline,
  });

  const formatPlaybackTime = useCallback(
    (time: number) => formatTime(time, CENTISECOND_TIME_OPTIONS),
    [],
  );

  return {
    currentTime,
    setCurrentTime,
    timelineRef,
    previewRef,
    playerContainerRef,
    timelineWrapperRef,
    onPreviewTimeUpdate,
    onCursorDrag,
    onClickTimeArea,
    formatTime: formatPlaybackTime,
  };
}
