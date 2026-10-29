import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import { getPreviewDimensions } from '@/shared/lib/media/aspectRatios';
import type { SegmentSlot } from '@/shared/hooks/segments';

interface UseSegmentScrubbingCoreInput {
  isMobile: boolean;
  slots: SegmentSlot[];
  projectAspectRatio?: string;
}

export function useSegmentScrubbingCore({
  isMobile,
  slots,
  projectAspectRatio,
}: UseSegmentScrubbingCoreInput) {
  const [activeScrubbingIndex, setActiveScrubbingIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const scrubbing = useVideoScrubbing({
    enabled: !isMobile && activeScrubbingIndex !== null,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
    onHoverEnd: () => setActiveScrubbingIndex(null),
  });
  const handleScrubbingMouseEnter = scrubbing.containerProps.onMouseEnter;
  const resetScrubbing = scrubbing.reset;
  const setScrubbingVideoElement = scrubbing.setVideoElement;

  useEffect(() => {
    if (activeScrubbingIndex !== null) {
      handleScrubbingMouseEnter();
    }
  }, [activeScrubbingIndex, handleScrubbingMouseEnter]);

  useEffect(() => {
    if (activeScrubbingIndex === null) return;

    const handleScroll = () => {
      setActiveScrubbingIndex(null);
      resetScrubbing();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeScrubbingIndex, resetScrubbing]);

  const activeSegmentSlot = activeScrubbingIndex !== null ? slots[activeScrubbingIndex] : null;
  const activeSegmentVideoUrl = activeSegmentSlot?.type === 'child' ? activeSegmentSlot.child.location : null;

  useEffect(() => {
    if (previewVideoRef.current && activeScrubbingIndex !== null) {
      setScrubbingVideoElement(previewVideoRef.current);
    }
  }, [activeScrubbingIndex, activeSegmentVideoUrl, setScrubbingVideoElement]);

  const handleScrubbingStart = useCallback((index: number, segmentRect: DOMRect) => {
    setActiveScrubbingIndex(index);
    setPreviewPosition({
      x: segmentRect.left + segmentRect.width / 2,
      y: segmentRect.top,
    });
  }, []);

  const previewDimensions = useMemo(() => getPreviewDimensions(projectAspectRatio), [projectAspectRatio]);

  const clampedPreviewX = useMemo(() => {
    const padding = 16;
    const halfWidth = previewDimensions.width / 2;
    const minX = padding + halfWidth;
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1920) - padding - halfWidth;
    return Math.max(minX, Math.min(maxX, previewPosition.x));
  }, [previewPosition.x, previewDimensions.width]);

  const clearScrubbing = useCallback(() => {
    setActiveScrubbingIndex(null);
    resetScrubbing();
  }, [resetScrubbing]);

  return {
    activeScrubbingIndex,
    activeSegmentSlot,
    activeSegmentVideoUrl,
    clampedPreviewX,
    previewDimensions,
    previewPosition,
    previewVideoRef,
    scrubbing,
    handleScrubbingStart,
    clearScrubbing,
  };
}
