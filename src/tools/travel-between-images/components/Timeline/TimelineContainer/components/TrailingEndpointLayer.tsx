import React, { useMemo } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { TrailingEndpoint } from '../../TrailingEndpoint';
import { sortPositionEntries } from '../../utils/timeline-utils';

interface TrailingEndpointLayerProps {
  imagePositions: Map<string, number>;
  images: GenerationRow[];
  trailingEndFrame: number | undefined;
  hasCallbackTrailingVideo: boolean;
  hasLiveTrailingVideo: boolean;
  containerWidth: number;
  fullMin: number;
  fullRange: number;
  readOnly: boolean;
  onPairClick?: (pairIndex: number) => void;
  trailingVideoUrl: string | null;
  onExtractFinalFrame?: () => Promise<void>;
}

export const TrailingEndpointLayer: React.FC<TrailingEndpointLayerProps> = ({
  imagePositions,
  images,
  trailingEndFrame,
  hasCallbackTrailingVideo,
  hasLiveTrailingVideo,
  containerWidth,
  fullMin,
  fullRange,
  readOnly,
  onPairClick,
  trailingVideoUrl,
  onExtractFinalFrame,
}) => {
  const sortedEntries = useMemo(() => sortPositionEntries(imagePositions), [imagePositions]);

  if (sortedEntries.length === 0) {
    return null;
  }

  const lastEntry = sortedEntries[sortedEntries.length - 1];
  if (!lastEntry) {
    return null;
  }

  const [, imageFrame] = lastEntry;
  const isMultiImage = images.length > 1;
  const hasTrailingSegment = trailingEndFrame !== undefined;

  if (isMultiImage && !hasTrailingSegment && !hasCallbackTrailingVideo && !hasLiveTrailingVideo) {
    return null;
  }

  const defaultEndFrame = imageFrame + (isMultiImage ? 17 : 49);
  const effectiveEndFrame = trailingEndFrame ?? defaultEndFrame;
  const gapToImage = effectiveEndFrame - imageFrame;
  const trailingPairIndex = Math.max(0, sortedEntries.length - 1);

  return (
    <TrailingEndpoint
      framePosition={effectiveEndFrame}
      imageFramePosition={imageFrame}
      timelineWidth={containerWidth}
      fullMinFrames={fullMin}
      fullRange={fullRange}
      gapToImage={gapToImage}
      readOnly={readOnly}
      compact={isMultiImage}
      onDurationClick={onPairClick ? () => onPairClick(trailingPairIndex) : undefined}
      hasTrailingVideo={!!trailingVideoUrl}
      onExtractFinalFrame={trailingVideoUrl && onExtractFinalFrame ? onExtractFinalFrame : undefined}
    />
  );
};
