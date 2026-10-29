import React from 'react';
import { TimelineRuler } from '../../TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelineTrackPrelude } from './TimelineTrackPrelude';
import { DragLayer } from './DragLayer';
import { PairRegionsLayer } from './PairRegionsLayer';
import { TrailingEndpointLayer } from './TrailingEndpointLayer';
import { TimelineItemsLayer } from './TimelineItemsLayer';

interface TimelineTrackContentProps {
  data: Record<string, unknown>;
}

export const TimelineTrackContent: React.FC<TimelineTrackContentProps> = ({ data }) => {
  const [activeVariantDropTargetId, setActiveVariantDropTargetId] = React.useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timelineData = data as Record<string, any>;
  const {
    timelineRef,
    containerRef,
    zoomLevel,
    isFileOver,
    hasNoImages,
    enableTapToMove,
    selectedIds,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleTimelineDoubleClick,
    handleTimelineTapToMove,
    clearSelection,
    containerWidth,
    shotId,
    projectId,
    readOnly,
    images,
    imagePositions,
    activePendingFrame,
    trailingEndFrame,
    hasCallbackTrailingVideo,
    hasLiveTrailingVideo,
    projectAspectRatio,
    pairInfoWithPending,
    localShotGenPositions,
    parentSegmentSlots,
    parentHasPendingTask,
    selectedOutputId,
    onPairClick,
    handleOpenPairSettings,
    setCallbackTrailingVideoUrl,
    onFileDrop,
    videoOutputs,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    primaryStructureVideo,
    onPrimaryStructureVideoInputChange,
    audioUrl,
    audioMetadata,
    onAudioChange,
    fullMin,
    fullMax,
    fullRange,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    dragState,
    dragType,
    dropTargetFrame,
    pendingDropFrame,
    pendingExternalAddFrame,
    isUploadingImage,
    isInternalDropProcessing,
    currentDragFrame,
    swapTargetId,
    trailingVideoUrl,
    handleExtractFinalFrame,
    framePositions,
    dragOffset,
    isMobile,
    isTablet,
    handleMouseDown,
    handleDesktopDoubleClick,
    handleMobileTap,
    prefetchTaskData,
    onImageDelete,
    onVariantDrop,
    isSelected,
    toggleSelection,
  } = timelineData;

  const suppressParentDropIndicators = Boolean(activeVariantDropTargetId);
  const effectiveIsFileOver = suppressParentDropIndicators ? false : isFileOver;
  const effectiveDropTargetFrame = suppressParentDropIndicators ? null : dropTargetFrame;

  return (
    <TimelineTrack
      timelineRef={timelineRef}
      containerRef={containerRef}
      zoomLevel={zoomLevel}
      isFileOver={effectiveIsFileOver}
      suppressFileOverHighlight={suppressParentDropIndicators}
      hasNoImages={hasNoImages}
      enableTapToMove={enableTapToMove}
      selectedCount={selectedIds.length}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContainerDoubleClick={handleTimelineDoubleClick}
      onContainerClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-item-id]') && !target.closest('button')) {
          if (enableTapToMove && selectedIds.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            handleTimelineTapToMove(e.clientX);
            return;
          }
          if (selectedIds.length > 0) {
            clearSelection();
          }
        }
      }}
      containerWidth={containerWidth}
      prelude={(
        <TimelineTrackPrelude
          timeline={{
            shotId,
            projectId,
            readOnly,
            images,
            imagePositions,
            activePendingFrame,
            trailingEndFrame,
            hasCallbackTrailingVideo,
            hasLiveTrailingVideo,
            projectAspectRatio,
            pairInfoWithPending,
            localShotGenPositions,
            segmentSlots: parentSegmentSlots,
            hasPendingTask: parentHasPendingTask,
            selectedOutputId,
            onPairClick,
            onOpenPairSettings: handleOpenPairSettings,
            onTrailingVideoInfo: setCallbackTrailingVideoUrl,
            onFileDrop,
            videoOutputs,
          }}
          guidance={{
            structureVideos,
            isStructureVideoLoading,
            cachedHasStructureVideo,
            onAddStructureVideo,
            onUpdateStructureVideo,
            onRemoveStructureVideo,
            primaryStructureVideo,
            onPrimaryStructureVideoInputChange,
          }}
          audio={{
            audioUrl,
            audioMetadata,
            onAudioChange,
          }}
          layout={{
            fullMin,
            fullMax,
            fullRange,
            containerWidth,
            zoomLevel,
            hasNoImages,
          }}
          zoom={{
            onZoomIn: handleZoomInToCenter,
            onZoomOut: handleZoomOutFromCenter,
            onZoomReset: handleZoomReset,
            onZoomToStart: handleZoomToStart,
          }}
        />
      )}
    >
      <DragLayer
        isFileOver={effectiveIsFileOver}
        dropTargetFrame={effectiveDropTargetFrame}
        fullMin={fullMin}
        fullRange={fullRange}
        containerWidth={containerWidth}
        dragType={dragType}
        activePendingFrame={activePendingFrame}
        pendingDropFrame={pendingDropFrame}
        pendingExternalAddFrame={pendingExternalAddFrame}
        isUploadingImage={isUploadingImage}
        isInternalDropProcessing={isInternalDropProcessing}
        projectAspectRatio={projectAspectRatio}
        imagesLength={images.length}
        suppressIndicator={suppressParentDropIndicators}
      />
      <TimelineRuler
        fullMin={fullMin}
        fullMax={fullMax}
        fullRange={fullRange}
        zoomLevel={zoomLevel}
        containerWidth={containerWidth}
        hasNoImages={hasNoImages}
      />
      <PairRegionsLayer
        images={images}
        imagePositionsWithPending={imagePositions}
        pairInfoWithPending={pairInfoWithPending}
        pairPrompts={timelineData.pairPrompts}
        defaultPrompt={timelineData.defaultPrompt}
        defaultNegativePrompt={timelineData.defaultNegativePrompt}
        showPairLabels={timelineData.showPairLabels}
        dragState={{
          isDragging: dragState.isDragging,
        }}
        onPairClick={onPairClick}
        onClearEnhancedPrompt={timelineData.onClearEnhancedPrompt}
        readOnly={readOnly}
        enableTapToMove={enableTapToMove}
        selectedIdsCount={selectedIds.length}
        isFileOver={effectiveIsFileOver}
        dropTargetFrame={effectiveDropTargetFrame}
        currentDragFrame={currentDragFrame}
        fullMin={fullMin}
        fullRange={fullRange}
        containerWidth={containerWidth}
      />
      <TrailingEndpointLayer
        imagePositions={imagePositions}
        images={images}
        trailingEndFrame={trailingEndFrame}
        hasCallbackTrailingVideo={hasCallbackTrailingVideo}
        hasLiveTrailingVideo={hasLiveTrailingVideo}
        containerWidth={containerWidth}
        fullMin={fullMin}
        fullRange={fullRange}
        readOnly={readOnly}
        onPairClick={onPairClick}
        trailingVideoUrl={trailingVideoUrl}
        onExtractFinalFrame={onFileDrop ? handleExtractFinalFrame : undefined}
      />
      <TimelineItemsLayer
        images={images}
        currentPositions={timelineData.currentPositions}
        framePositions={framePositions}
        drag={{
          isDragging: dragState.isDragging,
          activeId: dragState.activeId,
          dragOffset,
          currentDragFrame,
          swapTargetId,
        }}
        layout={{
          containerWidth,
          fullMin,
          fullRange,
        }}
        interaction={{
          readOnly,
          isMobile,
          isTablet,
          containerRef,
          handleMouseDown,
          handleDesktopDoubleClick,
          handleMobileTap,
          prefetchTaskData,
        }}
        actions={{
          onImageDelete,
          onVariantDrop,
          onVariantDropTargetChange: setActiveVariantDropTargetId,
        }}
        selection={{
          isSelected,
          toggleSelection,
          selectedCount: selectedIds.length,
        }}
        presentation={{
          projectAspectRatio,
        }}
      />
    </TimelineTrack>
  );
};
