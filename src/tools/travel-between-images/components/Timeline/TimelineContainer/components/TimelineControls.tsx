import React from 'react';
import type { PrimaryStructureVideo } from '@/shared/lib/tasks/travelBetweenImages';
import type { OnPrimaryStructureVideoInputChange } from '@/tools/travel-between-images/types/mediaHandlers';
import { TimelineBottomControls, type TimelineBottomControlsProps } from './TimelineBottomControls';
import { ZoomControls } from './ZoomControls';

interface TimelineControlsProps {
  timeline: {
    shotId: string;
    projectId: string | null;
    readOnly: boolean;
    hasNoImages: boolean;
    zoomLevel: number;
    showDragHint: boolean;
  };
  guidance: {
    primaryStructureVideo: PrimaryStructureVideo;
    onPrimaryStructureVideoInputChange?: OnPrimaryStructureVideoInputChange;
  };
  zoom: {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onZoomToStart: () => void;
  };
  bottom: {
    resetGap: TimelineBottomControlsProps['resetGap'];
    setResetGap: TimelineBottomControlsProps['setResetGap'];
    maxGap: TimelineBottomControlsProps['maxGap'];
    onReset: TimelineBottomControlsProps['onReset'];
    onFileDrop?: TimelineBottomControlsProps['onFileDrop'];
    isUploadingImage: TimelineBottomControlsProps['isUploadingImage'];
    uploadProgress: TimelineBottomControlsProps['uploadProgress'];
    pushMode: TimelineBottomControlsProps['pushMode'];
  };
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  timeline,
  guidance,
  zoom,
  bottom,
}) => (
  <>
    {timeline.shotId
      && (timeline.projectId || timeline.readOnly)
      && guidance.onPrimaryStructureVideoInputChange
      && (guidance.primaryStructureVideo.path || !timeline.readOnly) && (
      <div
        className="absolute left-0 z-30 flex items-end justify-between pointer-events-none px-8"
        style={{ width: '100%', maxWidth: '100vw', top: timeline.zoomLevel > 1 ? '0.98875rem' : '1rem' }}
      >
        <ZoomControls
          zoomLevel={timeline.zoomLevel}
          onZoomIn={zoom.onZoomIn}
          onZoomOut={zoom.onZoomOut}
          onZoomReset={zoom.onZoomReset}
          onZoomToStart={zoom.onZoomToStart}
          hasNoImages={timeline.hasNoImages}
        />
      </div>
    )}

    <TimelineBottomControls
      resetGap={bottom.resetGap}
      setResetGap={bottom.setResetGap}
      maxGap={bottom.maxGap}
      onReset={bottom.onReset}
      onFileDrop={bottom.onFileDrop}
      isUploadingImage={bottom.isUploadingImage}
      uploadProgress={bottom.uploadProgress}
      readOnly={timeline.readOnly}
      hasNoImages={timeline.hasNoImages}
      zoomLevel={timeline.zoomLevel}
      pushMode={bottom.pushMode}
      showDragHint={timeline.showDragHint}
    />
  </>
);
