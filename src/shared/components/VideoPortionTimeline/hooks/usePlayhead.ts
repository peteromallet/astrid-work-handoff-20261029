import React, { useRef, useState, useEffect, useCallback } from 'react';
import { registerWindowDragListeners } from './windowDragListeners';

interface UsePlayheadOptions {
  duration: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scrubberRef: React.RefObject<HTMLDivElement | null>;
}

interface UsePlayheadReturn {
  currentTime: number;
  isDraggingPlayhead: boolean;
  startPlayheadDrag: (e: React.MouseEvent | React.TouchEvent) => void;
  handleScrubberInteraction: (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => void;
}

export function usePlayhead({ duration, videoRef, scrubberRef }: UsePlayheadOptions): UsePlayheadReturn {
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // Store video playing state before drag
  const wasPlayingRef = useRef(false);

  // Track video time for playhead
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isDraggingPlayhead) {
        setCurrentTime(video.currentTime);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoRef, isDraggingPlayhead]);

  // Handle scrubber click/drag
  const handleScrubberInteraction = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!scrubberRef.current || !videoRef.current) return;

    const rect = scrubberRef.current.getBoundingClientRect();
    const clientX = 'touches' in e
      ? (e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0)
      : (e as MouseEvent).clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = percent * duration;

    setCurrentTime(time);
    videoRef.current.currentTime = time;
  }, [duration, videoRef, scrubberRef]);

  // Start dragging playhead
  const startPlayheadDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();
    }

    setIsDraggingPlayhead(true);
    handleScrubberInteraction(e);
  }, [videoRef, handleScrubberInteraction]);

  // Handle playhead drag move
  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      handleScrubberInteraction(e);
    };

    const handleEnd = () => {
      setIsDraggingPlayhead(false);
      if (wasPlayingRef.current && videoRef.current) {
        videoRef.current.play();
      }
    };

    return registerWindowDragListeners(handleMove, handleEnd);
  }, [isDraggingPlayhead, handleScrubberInteraction, videoRef]);

  return {
    currentTime,
    isDraggingPlayhead,
    startPlayheadDrag,
    handleScrubberInteraction,
  };
}
