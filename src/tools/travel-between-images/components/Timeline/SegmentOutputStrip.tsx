/**
 * SegmentOutputStrip - Compact strip showing segment outputs above timeline
 *
 * Displays generated video segments aligned with their corresponding image pairs.
 * Each segment is positioned to match the timeline pair below it.
 *
 * Logic extracted to useSegmentOutputStrip hook — this file is rendering-only.
 */

import React from 'react';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { DesktopScrubbingPreview } from '@/shared/components/ShotImageManager/components/DesktopScrubbingPreview';
import { InlineSegmentVideo } from '@/shared/components/InlineSegmentVideo';
import { TIMELINE_HORIZONTAL_PADDING } from './constants';

import type { SegmentSlot } from '@/shared/hooks/segments';
import { useSegmentOutputStrip } from './hooks/segment/useSegmentOutputStrip';

interface PairInfo {
  index: number;
  startId: string;
  endId: string;
  startFrame: number;
  endFrame: number;
  frames: number;
}

interface SegmentOutputStripProps {
  shotId: string;
  projectId?: string | null;
  projectAspectRatio?: string;
  pairInfo: PairInfo[];
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  segmentSlots: SegmentSlot[];
  localShotGenPositions?: Map<string, number>;
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  onOpenPairSettings?: (pairIndex: number) => void;
  selectedParentId?: string | null;
  trailingSegmentMode?: {
    imageId: string;
    imageFrame: number;
    endFrame: number;
  };
  readOnly?: boolean;
  onTrailingVideoInfo?: (videoUrl: string | null) => void;
}

export const SegmentOutputStrip: React.FC<SegmentOutputStripProps> = ({
  shotId,
  projectAspectRatio,
  pairInfo,
  fullMin,
  fullRange,
  containerWidth,
  zoomLevel,
  segmentSlots: rawSegmentSlots,
  hasPendingTask: hasPendingTaskProp,
  onOpenPairSettings,
  selectedParentId,
  trailingSegmentMode,
  readOnly = false,
  onTrailingVideoInfo,
}) => {
  const {
    // Refs
    previewVideoRef,
    stripContainerRef,
    // Mobile
    isMobile,
    // Display data
    positionedSlots,
    hasPendingTask,
    // Scrubbing
    activeScrubbingIndex,
    activeSegmentSlot,
    activeSegmentVideoUrl,
    scrubbing,
    previewPosition,
    previewDimensions,
    clampedPreviewX,
    handleScrubbingStart,
    // Lightbox
    lightboxMedia,
    childSlotIndices,
    handleSegmentClick,
    handleLightboxNext,
    handleLightboxPrev,
    handleLightboxClose,
  } = useSegmentOutputStrip({
    shotId,
    projectAspectRatio,
    containerWidth,
    fullMin,
    fullRange,
    pairInfo,
    rawSegmentSlots,
    trailingSegmentMode,
    hasPendingTaskProp,
    onTrailingVideoInfo,
    selectedParentId,
  });

  // Don't render if no pairs AND not in single-image mode
  if (pairInfo.length === 0 && !trailingSegmentMode) {
    return null;
  }

  return (
    <div className="w-full relative" ref={stripContainerRef}>
      <DesktopScrubbingPreview
        activeScrubbingIndex={activeScrubbingIndex}
        activeSegmentSlot={activeSegmentSlot}
        activeSegmentVideoUrl={activeSegmentVideoUrl ?? null}
        clampedPreviewX={clampedPreviewX}
        previewY={previewPosition.y}
        previewDimensions={previewDimensions}
        previewVideoRef={previewVideoRef}
        scrubbing={scrubbing}
      />

      {/* Segment output strip - compact height for segment thumbnails */}
      <div
        className="relative h-32 mt-3 mb-1"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Segment thumbnails - positioned to align with timeline pairs */}
        <div className="absolute left-0 right-0 top-5 bottom-1 overflow-visible">
          {positionedSlots.length > 0 ? (
            <div className="relative w-full h-full">
              {positionedSlots.map((positioned, index) => {
                const { slot } = positioned;
                const isActiveScrubbing = activeScrubbingIndex === index;

                return (
                  <React.Fragment key={slot.type === 'child' ? slot.child.id : `placeholder-${index}`}>
                    <InlineSegmentVideo
                      slot={slot}
                      pairIndex={index}
                      onClick={() => {
                        handleSegmentClick(slot, index, onOpenPairSettings);
                      }}
                      projectAspectRatio={projectAspectRatio}
                      isMobile={isMobile}
                      leftPercent={positioned.leftPercent}
                      widthPercent={positioned.widthPercent}
                      onOpenPairSettings={onOpenPairSettings}
                      isPending={hasPendingTask(slot.pairShotGenerationId)}
                      // Scrubbing props
                      isScrubbingActive={isActiveScrubbing}
                      onScrubbingStart={(rect: DOMRect) => handleScrubbingStart(index, rect)}
                      scrubbingContainerRef={isActiveScrubbing ? scrubbing.containerRef : undefined}
                      scrubbingContainerProps={isActiveScrubbing ? scrubbing.containerProps : undefined}
                      scrubbingProgress={isActiveScrubbing ? scrubbing.progress : undefined}
                      readOnly={readOnly}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 h-full flex items-center justify-center text-xs text-muted-foreground">
              <span>No segments generated yet</span>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox for segment videos */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={handleLightboxClose}
          navigation={{
            onNext: handleLightboxNext,
            onPrevious: handleLightboxPrev,
            showNavigation: true,
            hasNext: childSlotIndices.length > 1,
            hasPrevious: childSlotIndices.length > 1,
          }}
          features={{
            showDownload: true,
            showTaskDetails: true,
          }}
          shotId={shotId}
          videoProps={{
            fetchVariantsForSelf: true,
          }}
        />
      )}

    </div>
  );
};
