import React, { useState } from "react";
import { ImagePlus } from "lucide-react";
import { framesToSeconds } from '@/shared/lib/media/videoUtils';
import { useTimelineFps } from './TimelineMediaContext';
import { TIMELINE_PADDING_OFFSET } from "./constants";

interface TrailingEndpointProps {
  /** Frame position of the endpoint */
  framePosition: number;
  /** Frame position of the image (start of the region) */
  imageFramePosition: number;
  /** Timeline width in pixels */
  timelineWidth: number;
  /** Minimum frame in coordinate system */
  fullMinFrames: number;
  /** Frame range for coordinate system */
  fullRange: number;
  /** Gap to the image (for display) */
  gapToImage: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Click handler for the duration label - opens settings modal */
  onDurationClick?: () => void;
  /** Compact mode - hides duration label unless hovered (for multi-image trailing segments) */
  compact?: boolean;
  /** Whether there's a video in the trailing segment slot */
  hasTrailingVideo?: boolean;
  /** Callback to extract final frame from trailing video and add as next image */
  onExtractFinalFrame?: () => void;
}

/**
 * TrailingEndpoint - A marker for the trailing segment duration
 *
 * Renders as a simple vertical marker with the duration label. Used when the
 * last image has no following image (single-image mode or multi-image with
 * trailing segment). The end frame is not editable here.
 */
const TrailingEndpoint: React.FC<TrailingEndpointProps> = ({
  framePosition,
  imageFramePosition,
  timelineWidth,
  fullMinFrames,
  fullRange,
  gapToImage,
  readOnly = false,
  onDurationClick,
  compact = false,
  hasTrailingVideo = false,
  onExtractFinalFrame,
}) => {
  const timelineFps = useTimelineFps();
  const [isHovered, setIsHovered] = useState(false);

  // Calculate pixel positions (same as TimelineItem/PairRegion)
  const effectiveWidth = timelineWidth - (TIMELINE_PADDING_OFFSET * 2);

  // Calculate image position (start of region)
  const imagePixelPos = TIMELINE_PADDING_OFFSET + ((imageFramePosition - fullMinFrames) / fullRange) * effectiveWidth;
  const imageLeftPercent = (imagePixelPos / timelineWidth) * 100;

  // Calculate endpoint position
  const endpointPixelPos = TIMELINE_PADDING_OFFSET + ((framePosition - fullMinFrames) / fullRange) * effectiveWidth;
  const endpointLeftPercent = (endpointPixelPos / timelineWidth) * 100;

  // Color scheme (blue - matches first pair in PairRegion)
  const colorScheme = {
    regionBg: 'bg-blue-50 dark:bg-blue-950/40',
    regionBorder: 'border-blue-300 dark:border-blue-700',
    line: 'bg-blue-400 dark:bg-blue-600',
    handle: 'bg-blue-500 dark:bg-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
  };

  return (
    <>
      {/* Highlighted region between image and endpoint (like PairRegion) */}
      <div
        className={`absolute top-0 bottom-0 ${colorScheme.regionBg} ${colorScheme.regionBorder} border-l-2 border-r-2 border-solid pointer-events-none`}
        style={{
          left: `${imageLeftPercent}%`,
          width: `${Math.max(0, endpointLeftPercent - imageLeftPercent)}%`,
          transition: 'width 0.1s ease-out, left 0.1s ease-out',
        }}
      />

      {/* Connecting line from image to endpoint */}
      <div
        className={`absolute top-1/2 h-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${imageLeftPercent}%`,
          width: `${Math.max(0, endpointLeftPercent - imageLeftPercent)}%`,
          transform: 'translateY(-50%)',
          transition: 'width 0.1s ease-out',
        }}
      />

      {/* Duration label (centered in the region) - clickable to open settings */}
      {/* In compact mode, only show when hovering */}
      {(!compact || isHovered) && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap z-10
            px-2.5 py-1 rounded-full text-[11px] font-light shadow-sm
            bg-card/90 dark:bg-gray-800/90 ${colorScheme.text} border ${colorScheme.regionBorder}
            ${onDurationClick ? 'cursor-pointer hover:bg-card dark:hover:bg-gray-800 hover:shadow-md transition-all duration-200' : 'pointer-events-none'}
          `}
          style={{
            left: `${(imageLeftPercent + endpointLeftPercent) / 2}%`,
            transform: 'translate(-50%, -50%)',
          }}
          onClick={onDurationClick}
          onTouchEnd={onDurationClick ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            onDurationClick();
          } : undefined}
        >
          Duration • {framesToSeconds(gapToImage, timelineFps)}
        </div>
      )}

      {/* Endpoint marker with optional extract button */}
      <div
        className="absolute"
        style={{
          left: `${endpointLeftPercent}%`,
          top: 0,
          bottom: 0,
          transform: 'translateX(-50%)',
          zIndex: 15,
          transition: 'left 0.1s ease-out',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Vertical line at endpoint */}
        <div
          className={`absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 ${colorScheme.line}`}
        />

        {/* Extract final frame icon - appears on hover */}
        {hasTrailingVideo && onExtractFinalFrame && !readOnly && isHovered && (
          <button
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full ${colorScheme.handle} text-white flex items-center justify-center shadow-md hover:scale-110 transition-all duration-150`}
            onClick={(e) => {
              e.stopPropagation();
              onExtractFinalFrame();
            }}
            title="Extract final frame as new image"
          >
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </>
  );
};

const MemoizedTrailingEndpoint = React.memo(TrailingEndpoint);

export { MemoizedTrailingEndpoint as TrailingEndpoint };
