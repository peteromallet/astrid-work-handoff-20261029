import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { ShotImageManagerProps, ShotLightboxSelectionProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useLightboxContextData } from './hooks/useLightboxContextData';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import type { GenerationRow } from '@/domains/generation/types';
import { useSegmentScrubbingCore } from '@/shared/hooks/useSegmentScrubbingCore';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { BatchDropZone } from './components/BatchDropZone';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';
import { ImageGrid } from './components/ImageGrid';
import { SelectionActionBar } from './components/SelectionActionBar';
import { MultiImagePreview, SingleImagePreview } from '@/shared/components/ImageDragPreview';
import { DesktopLightboxOverlay } from './components/DesktopLightboxOverlay';
import { DesktopScrubbingPreview } from './components/DesktopScrubbingPreview';
import type { useSelection } from './hooks/useSelection';
import type { useDragAndDrop } from './hooks/useDragAndDrop';
import type { useLightbox } from './hooks/useLightbox';
import type { useBatchOperations } from './hooks/useBatchOperations';
import type { useOptimisticOrder } from './hooks/useOptimisticOrder';
import type { useExternalGenerations } from './hooks/useExternalGenerations';

interface ShotImageManagerDesktopProps extends ShotImageManagerProps, ShotLightboxSelectionProps {
  selection: ReturnType<typeof useSelection>;
  dragAndDrop: ReturnType<typeof useDragAndDrop>;
  lightbox: ReturnType<typeof useLightbox>;
  batchOps: ReturnType<typeof useBatchOperations>;
  optimistic: ReturnType<typeof useOptimisticOrder>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  getFramePosition: (index: number) => number | undefined;
}

function useImageTickFeedback() {
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  const [showTickForSecondaryImageId, setShowTickForSecondaryImageId] = useState<string | null>(null);

  useEffect(() => {
    if (!showTickForImageId) return;
    const timer = setTimeout(() => setShowTickForImageId(null), 3000);
    return () => clearTimeout(timer);
  }, [showTickForImageId]);

  useEffect(() => {
    if (!showTickForSecondaryImageId) return;
    const timer = setTimeout(() => setShowTickForSecondaryImageId(null), 3000);
    return () => clearTimeout(timer);
  }, [showTickForSecondaryImageId]);

  return {
    showTickForImageId,
    setShowTickForImageId,
    showTickForSecondaryImageId,
    setShowTickForSecondaryImageId,
  };
}

function useDesktopSegmentScrubbing({
  isMobile,
  segmentSlots,
  projectAspectRatio,
}: {
  isMobile: boolean;
  segmentSlots?: SegmentSlot[];
  projectAspectRatio?: string;
}) {
  const { previewPosition, ...core } = useSegmentScrubbingCore({
    isMobile,
    slots: segmentSlots ?? [],
    projectAspectRatio,
  });

  return {
    ...core,
    previewY: previewPosition.y,
  };
}

export const ShotImageManagerDesktop: React.FC<ShotImageManagerDesktopProps> = ({
  selection,
  dragAndDrop,
  lightbox,
  batchOps,
  optimistic,
  externalGens,
  getFramePosition,
  lightboxSelectedShotId,
  setLightboxSelectedShotId,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
  onSegmentDelete,
  deletingSegmentId,
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  navigateWithTransition,
  images,
  shotId,
  projectId,
  allShots,
  selectedShotId,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
  onNewShotFromSelection,
  onPairClick,
  pairPrompts,
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  pairOverrides,
  onImageDelete,
  onImageDuplicate,
  onImageUpload,
  isUploadingImage,
  onFileDrop,
  onGenerationDrop,
  onVariantDrop,
  columns,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  batchVideoFrames,
  readOnly,
}) => {
  const [activeVariantDropTargetId, setActiveVariantDropTargetId] = useState<string | null>(null);
  const {
    showTickForImageId,
    setShowTickForImageId,
    showTickForSecondaryImageId,
    setShowTickForSecondaryImageId,
  } = useImageTickFeedback();

  const { capturedVariantIdRef, adjacentSegmentsData, taskDetailsData } = useLightboxContextData({
    lightboxIndex: lightbox.lightboxIndex,
    currentImages: lightbox.currentImages,
    setLightboxIndex: lightbox.setLightboxIndex,
    projectId: projectId ?? null,
    pendingImageToOpen,
    pendingImageVariantId,
    onClearPendingImageToOpen,
    segmentSlots,
    onPairClick,
    navigateWithTransition,
  });

  const gridColsClass = GRID_COLS_CLASSES[columns || 4] || 'grid-cols-4';
  const isMobile = useIsMobile();
  
  // Shot navigation for "add without position" flow
  const { navigateToShot } = useShotNavigation();

  const {
    activeScrubbingIndex,
    activeSegmentSlot,
    activeSegmentVideoUrl,
    clampedPreviewX,
    previewY,
    previewDimensions,
    previewVideoRef,
    scrubbing,
    handleScrubbingStart,
  } = useDesktopSegmentScrubbing({
    isMobile,
    segmentSlots,
    projectAspectRatio,
  });

  const lightboxManagerProps = {
    images,
    shotId,
    allShots,
    selectedShotId,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    onImageDelete,
    readOnly,
  };

  const dragOverlayContent = dragAndDrop.activeImage ? (
    selection.selectedIds.length > 1 &&
    dragAndDrop.activeId !== null &&
    selection.selectedIds.includes(dragAndDrop.activeId) ? (
      <MultiImagePreview
        count={selection.selectedIds.length}
        image={dragAndDrop.activeImage}
      />
    ) : (
      <SingleImagePreview image={dragAndDrop.activeImage} />
    )
  ) : null;

  return (
    <>
      <DesktopScrubbingPreview
        activeScrubbingIndex={activeScrubbingIndex}
        activeSegmentSlot={activeSegmentSlot ?? null}
        activeSegmentVideoUrl={activeSegmentVideoUrl ?? null}
        clampedPreviewX={clampedPreviewX}
        previewY={previewY}
        previewDimensions={previewDimensions}
        previewVideoRef={previewVideoRef}
        scrubbing={scrubbing}
      />

      <BatchDropZone
        onFileDrop={onFileDrop}
        onGenerationDrop={onGenerationDrop}
        activeVariantDropTargetId={activeVariantDropTargetId}
        columns={columns || 4}
        itemCount={lightbox.currentImages.length}
        disabled={readOnly || (!onFileDrop && !onGenerationDrop)}
        getFramePositionForIndex={getFramePosition}
        projectAspectRatio={projectAspectRatio}
      >
        {(_isFileDragOver, dropTargetIndex) => (
          <DndContext
            sensors={dragAndDrop.sensors}
            collisionDetection={closestCenter}
            onDragStart={dragAndDrop.handleDragStart}
            onDragEnd={dragAndDrop.handleDragEnd}
          >
            <SortableContext
              items={lightbox.currentImages.map((image: GenerationRow) => image.id)}
              strategy={rectSortingStrategy}
            >
              <ImageGrid
                layout={{
                  gridColsClass,
                  columns,
                  isMobile,
                  readOnly,
                  projectAspectRatio,
                  batchVideoFrames,
                  activeDragId: dragAndDrop.activeId,
                  dropTargetIndex,
                  activeScrubbingIndex,
                }}
                content={{
                  images: lightbox.currentImages,
                  selectedIds: selection.selectedIds,
                  segmentSlots,
                  hasPendingTask,
                  deletingSegmentId,
                  scrubbing,
                }}
                interactions={{
                  onItemClick: selection.handleItemClick,
                  onItemDoubleClick: (index) => lightbox.setLightboxIndex(index),
                  onDelete: batchOps.handleIndividualDelete,
                  onDuplicate: onImageDuplicate,
                  onVariantDrop,
                  onVariantDropTargetChange: setActiveVariantDropTargetId,
                  duplicatingImageId,
                  duplicateSuccessImageId,
                  onGridDoubleClick: () => {
                    selection.setSelectedIds([]);
                    selection.setLastSelectedIndex(null);
                  },
                  onImageUpload,
                  isUploadingImage,
                  onSegmentClick,
                  onSegmentDelete,
                  onScrubbingStart: handleScrubbingStart,
                }}
                prompts={{
                  onPairClick,
                  pairPrompts,
                  enhancedPrompts,
                  defaultPrompt,
                  defaultNegativePrompt,
                  onClearEnhancedPrompt,
                  pairOverrides,
                }}
              />
            </SortableContext>

            {typeof document !== 'undefined'
              ? createPortal(<DragOverlay>{dragOverlayContent}</DragOverlay>, document.body)
              : <DragOverlay>{dragOverlayContent}</DragOverlay>}

            <DesktopLightboxOverlay
              lightbox={lightbox}
              optimistic={optimistic}
              externalGens={externalGens}
              managerProps={lightboxManagerProps}
              lightboxSelectedShotId={lightboxSelectedShotId}
              setLightboxSelectedShotId={setLightboxSelectedShotId}
              taskDetailsData={taskDetailsData ?? undefined}
              capturedVariantIdRef={capturedVariantIdRef}
              showTickForImageId={showTickForImageId}
              onShowTick={setShowTickForImageId}
              showTickForSecondaryImageId={showTickForSecondaryImageId}
              onShowSecondaryTick={setShowTickForSecondaryImageId}
              onNavigateToShot={(shot) => {
                navigateToShot(shot, { scrollToTop: true });
              }}
              adjacentSegments={adjacentSegmentsData}
            />

            {selection.showSelectionBar && selection.selectedIds.length >= 1 && (
              <SelectionActionBar
                selectedCount={selection.selectedIds.length}
                onDeselect={selection.clearSelection}
                onDelete={() => batchOps.handleBatchDelete(selection.selectedIds)}
                onNewShot={
                  onNewShotFromSelection
                    ? async () => {
                        const shotId = await onNewShotFromSelection(selection.selectedIds);
                        return shotId;
                      }
                    : undefined
                }
                onJumpToShot={onShotChange}
              />
            )}

            <DeleteConfirmationDialog
              open={batchOps.confirmOpen}
              onOpenChange={batchOps.setConfirmOpen}
              pendingDeleteIds={batchOps.pendingDeleteIds}
              onConfirm={batchOps.performBatchDelete}
            />
          </DndContext>
        )}
      </BatchDropZone>
    </>
  );
};
