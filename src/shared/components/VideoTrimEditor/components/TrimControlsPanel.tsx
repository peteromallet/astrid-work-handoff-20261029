/**
 * TrimControlsPanel Component
 *
 * Side panel with trim controls, similar to EditModePanel in MediaLightbox.
 * Contains the timeline bar, frame previews, the reset control and the save button.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Scissors, RotateCcw } from 'lucide-react';
import { TrimFramePreviews } from '@/shared/components/VideoTrimEditor/components/TrimFramePreviews';
import { TrimTimelineDisplay } from '@/shared/components/VideoTrimEditor/components/TrimTimelineDisplay';
import { useVideoFrameExtraction } from '@/shared/components/VideoTrimEditor/hooks/useVideoFrameExtraction';
import type { TrimControlsPanelProps } from '../types';

export const TrimControlsPanel: React.FC<TrimControlsPanelProps> = ({
  trimState,
  onStartTrimChange,
  onEndTrimChange,
  onResetTrim,
  hasTrimChanges,
  onSave,
  variant,
  videoUrl,
  currentTime: externalCurrentTime,
  videoRef: externalVideoRef,
  hideHeader = false,
}) => {
  const isMobile = variant === 'mobile';
  const labelSize = isMobile ? 'text-xs' : 'text-sm';

  const {
    frameExtractionVideoElementRef,
    canvasElementRef,
    startFrame,
    endFrame,
    handleVideoLoaded,
  } = useVideoFrameExtraction({
    videoUrl,
    trimState,
  });

  return (
    <div className="w-full">
      {videoUrl && (
        <video
          ref={frameExtractionVideoElementRef}
          src={videoUrl}
          crossOrigin="anonymous"
          preload="auto"
          muted
          playsInline
          className="hidden"
          onLoadedMetadata={handleVideoLoaded}
        />
      )}
      <canvas ref={canvasElementRef} className="hidden" />

      <div className="p-4 space-y-4">
        {!hideHeader && (
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Scissors className="w-5 h-5 text-primary" />
              Trim Video
            </h3>
          </div>
        )}

        <TrimTimelineDisplay
          trimState={trimState}
          onStartTrimChange={onStartTrimChange}
          onEndTrimChange={onEndTrimChange}
          currentTime={externalCurrentTime}
          videoRef={externalVideoRef}
          labelSize={labelSize}
        />

        <TrimFramePreviews
          startFrame={startFrame}
          endFrame={endFrame}
          trimState={trimState}
          labelSize={labelSize}
        />

        {hasTrimChanges && (
          <Button variant="outline" size="sm" onClick={onResetTrim} className="w-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to original
          </Button>
        )}

        <Button
          onClick={onSave}
          disabled={!hasTrimChanges || !trimState.isValid}
          className="w-full"
        >
          <Scissors className="w-4 h-4 mr-2" />
          Save trimmed video
        </Button>
      </div>
    </div>
  );
};
