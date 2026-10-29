import React from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { TimelineItem } from '../../TimelineItem';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { VariantDropParams } from '@/shared/hooks/dnd/useImageVariantDrop';

interface TimelineItemsLayerProps {
  images: GenerationRow[];
  currentPositions: Map<string, number>;
  framePositions: Map<string, number>;
  drag: {
    isDragging: boolean;
    activeId: string | null;
    dragOffset: { x: number; y: number } | null;
    currentDragFrame: number | null;
    swapTargetId: string | null;
  };
  layout: {
    containerWidth: number;
    fullMin: number;
    fullRange: number;
  };
  interaction: {
    readOnly: boolean;
    isMobile: boolean;
    isTablet: boolean;
    containerRef: React.RefObject<HTMLDivElement>;
    handleMouseDown: (e: React.MouseEvent, id: string, containerRef: React.RefObject<HTMLDivElement>) => void;
    handleDesktopDoubleClick: (idx: number) => void;
    handleMobileTap: (idx: number) => void;
    prefetchTaskData: (generationId: string) => void;
  };
  actions: {
    onImageDelete: (imageId: string) => void;
    onVariantDrop?: (params: VariantDropParams) => Promise<void>;
    onVariantDropTargetChange?: (targetId: string | null) => void;
  };
  selection: {
    isSelected: (id: string) => boolean;
    toggleSelection: (id: string) => void;
    selectedCount: number;
  };
  presentation: {
    projectAspectRatio?: string;
  };
}

export const TimelineItemsLayer: React.FC<TimelineItemsLayerProps> = ({
  images,
  currentPositions,
  framePositions,
  drag,
  layout,
  interaction,
  actions,
  selection,
  presentation,
}) => {
  return (
    <>
      {images.map((image, idx) => {
        const imageKey = image.id;
        const positionFromMap = currentPositions.get(imageKey);
        const framePosition = positionFromMap ?? image.timeline_frame;
        if (framePosition === undefined || framePosition === null) {
          return null;
        }

        const isDragging = drag.isDragging && drag.activeId === imageKey;

        return (
          <TimelineItem
            key={imageKey}
            image={image}
            framePosition={framePosition}
            layout={{
              timelineWidth: layout.containerWidth,
              fullMinFrames: layout.fullMin,
              fullRange: layout.fullRange,
            }}
            interaction={{
              isDragging,
              isSwapTarget: drag.swapTargetId === imageKey,
              dragOffset: isDragging ? drag.dragOffset : null,
              onMouseDown: interaction.readOnly ? undefined : (e) => interaction.handleMouseDown(e, imageKey, interaction.containerRef),
              onDoubleClick: interaction.isMobile && !interaction.isTablet ? undefined : () => interaction.handleDesktopDoubleClick(idx),
              onMobileTap: interaction.isMobile ? () => interaction.handleMobileTap(idx) : undefined,
              currentDragFrame: isDragging ? drag.currentDragFrame : null,
              originalFramePos: framePositions.get(imageKey) ?? 0,
              onPrefetch: !interaction.isMobile ? () => {
                const generationId = getGenerationId(image as {
                  generation_id?: string | null;
                  id?: string | null;
                  metadata?: Record<string, unknown>;
                });
                if (generationId) {
                  interaction.prefetchTaskData(generationId);
                }
              } : undefined,
            }}
            actions={{
              onDelete: actions.onImageDelete,
              onVariantDrop: actions.onVariantDrop,
              onVariantDropTargetChange: actions.onVariantDropTargetChange,
            }}
            selection={{
              isSelected: selection.isSelected(imageKey),
              onSelectionClick: interaction.readOnly ? undefined : () => selection.toggleSelection(imageKey),
              selectedCount: selection.selectedCount,
            }}
            presentation={{
              projectAspectRatio: presentation.projectAspectRatio,
              readOnly: interaction.readOnly,
            }}
          />
        );
      })}
    </>
  );
};
