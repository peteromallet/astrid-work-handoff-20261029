import { useRef } from 'react';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useSegmentScrubbingCore } from '@/shared/hooks/useSegmentScrubbingCore';
import type { SegmentSlot } from '@/shared/hooks/segments';

interface UseSegmentScrubbingProps {
  projectAspectRatio?: string;
  displaySlots: SegmentSlot[];
}

export function useSegmentScrubbing({ projectAspectRatio, displaySlots }: UseSegmentScrubbingProps) {
  const isMobile = useIsMobile();
  const stripContainerRef = useRef<HTMLDivElement>(null);
  const core = useSegmentScrubbingCore({
    isMobile,
    slots: displaySlots,
    projectAspectRatio,
  });

  return {
    isMobile,
    previewVideoRef: core.previewVideoRef,
    stripContainerRef,
    activeScrubbingIndex: core.activeScrubbingIndex,
    activeSegmentSlot: core.activeSegmentSlot,
    activeSegmentVideoUrl: core.activeSegmentVideoUrl,
    scrubbing: core.scrubbing,
    previewPosition: core.previewPosition,
    previewDimensions: core.previewDimensions,
    clampedPreviewX: core.clampedPreviewX,
    handleScrubbingStart: core.handleScrubbingStart,
    clearScrubbing: core.clearScrubbing,
  };
}
