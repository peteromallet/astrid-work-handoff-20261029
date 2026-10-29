import React from 'react';
import { DropIndicator } from '../../DropIndicator';
import { PendingFrameMarker } from './PendingFrameMarker';
import { TimelineSkeletonItem } from './TimelineSkeletonItem';

interface DragLayerProps {
  isFileOver: boolean;
  dropTargetFrame: number | null;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
  dragType: 'external-file' | 'gallery-item' | 'internal-reorder' | null;
  activePendingFrame: number | null;
  pendingDropFrame: number | null;
  pendingExternalAddFrame: number | null;
  isUploadingImage: boolean;
  isInternalDropProcessing: boolean;
  projectAspectRatio?: string;
  imagesLength: number;
  suppressIndicator?: boolean;
}

export const DragLayer: React.FC<DragLayerProps> = ({
  isFileOver,
  dropTargetFrame,
  fullMin,
  fullRange,
  containerWidth,
  dragType,
  activePendingFrame,
  pendingDropFrame,
  pendingExternalAddFrame,
  isUploadingImage,
  isInternalDropProcessing,
  projectAspectRatio,
  imagesLength,
  suppressIndicator = false,
}) => {
  return (
    <>
      <DropIndicator
        isVisible={isFileOver}
        dropTargetFrame={dropTargetFrame}
        fullMin={fullMin}
        fullRange={fullRange}
        containerWidth={containerWidth}
        dragType={dragType}
        suppressIndicator={suppressIndicator}
      />

      <PendingFrameMarker
        pendingFrame={activePendingFrame}
        fullMin={fullMin}
        fullRange={fullRange}
        containerWidth={containerWidth}
        imagesLength={imagesLength}
      />

      {(isUploadingImage || isInternalDropProcessing) && pendingDropFrame !== null && (
        <TimelineSkeletonItem
          framePosition={pendingDropFrame}
          fullMin={fullMin}
          fullRange={fullRange}
          containerWidth={containerWidth}
          projectAspectRatio={projectAspectRatio}
        />
      )}

      {pendingExternalAddFrame !== null && (
        <TimelineSkeletonItem
          framePosition={pendingExternalAddFrame}
          fullMin={fullMin}
          fullRange={fullRange}
          containerWidth={containerWidth}
          projectAspectRatio={projectAspectRatio}
        />
      )}
    </>
  );
};
