/**
 * ShotBatchItemDesktop - Desktop batch view image item with drag-and-drop
 *
 * Uses dnd-kit for drag-and-drop reordering support.
 * Uses shared utilities for aspect ratio and progressive loading.
 */

import React, { useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GenerationRow } from '@/domains/generation/types';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useBatchImageLoading } from '@/shared/hooks/ui-image/useBatchImageLoading';
import { getImageAspectRatioStyle } from '@/shared/lib/media/imageAspectRatio';
import { framesToSeconds } from '@/shared/lib/media/videoUtils';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { useMarkVariantViewed } from '@/shared/hooks/variants/useMarkVariantViewed';
import { VariantDropOverlay } from '@/shared/components/VariantDropOverlay';
import { useImageVariantDrop, type VariantDropParams } from '@/shared/hooks/dnd/useImageVariantDrop';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

interface ShotBatchItemModel {
  image: GenerationRow;
  selection: {
    isSelected: boolean;
    isDragDisabled?: boolean;
  };
  timing: {
    timelineFrame?: number;
    displayTimeSeconds?: number;
  };
  duplication: {
    duplicatingImageId?: string | null;
    duplicateSuccessImageId?: string | null;
  };
  loading: {
    shouldLoad?: boolean;
    projectAspectRatio?: string;
  };
}

interface ShotBatchItemDesktopActions {
  onDelete: (shotImageEntryId: string) => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onVariantDrop?: (params: VariantDropParams) => Promise<void>;
  onVariantDropTargetChange?: (targetId: string | null) => void;
  onClick: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  onOpenLightbox: () => void;
  onMobileTap?: () => void;
}

interface ShotBatchItemDesktopProps {
  item: ShotBatchItemModel;
  actions: ShotBatchItemDesktopActions;
}

const ShotBatchItemDesktopComponent: React.FC<ShotBatchItemDesktopProps> = ({
  item,
  actions,
}) => {
  const { image, selection, timing, duplication, loading } = item;
  const isUploadedReference = image.type === 'uploaded-reference';
  const { isSelected, isDragDisabled = false } = selection;
  const { timelineFrame, displayTimeSeconds } = timing;
  const { duplicatingImageId, duplicateSuccessImageId } = duplication;
  const { shouldLoad = true, projectAspectRatio } = loading;
  const {
    onDelete,
    onDuplicate,
    onVariantDrop,
    onVariantDropTargetChange,
    onMobileTap,
    onClick,
    onPointerDown,
    onOpenLightbox,
  } = actions;

  // Hook for marking variants as viewed
  const { markAllViewed } = useMarkVariantViewed();

  // Callback to mark all variants for this generation as viewed
  const handleMarkAllVariantsViewed = useCallback(() => {
    if (image.generation_id) {
      markAllViewed(image.generation_id);
    }
  }, [image.generation_id, markAllViewed]);

  const fullImageUrl = image.imageUrl ?? image.location ?? image.thumbUrl ?? '';
  const fallbackImageUrl = image.thumbUrl ?? image.location ?? fullImageUrl;

  // Progressive loading for batch item
  const { displayImageUrl, progressiveRef, isThumbShowing, isFullLoaded } = useBatchImageLoading({
    thumbUrl: image.thumbUrl ?? image.location ?? undefined,
    imageUrl: fullImageUrl,
    shouldLoad,
  });

  // Calculate aspect ratio for consistent sizing with skeletons
  // getImageAspectRatioStyle expects ImageWithMetadata which is a subset of GenerationRow
  const aspectRatioStyle = getImageAspectRatioStyle(image as { metadata?: { width?: number; height?: number; originalParams?: { orchestrator_details?: { resolution?: string } } } }, projectAspectRatio);

  // Use image.id (shot_generations.id) - unique per entry
  const sortableId = image.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: isDragDisabled,
  });
  const isMobile = useIsMobile();

  // Track touch position to detect scrolling vs tapping
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMobileTap || !touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    // Only trigger tap if movement is minimal (< 10px in any direction)
    // This prevents accidental selection during scrolling
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      onMobileTap();
    }

    touchStartRef.current = null;
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: isDragDisabled ? 'auto' : 'none',
    ...aspectRatioStyle, // Apply aspect ratio to maintain consistent dimensions
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Use id (shot_generations.id) - unique per entry
    onDelete(image.id);
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDuplicate && timelineFrame !== undefined) {
      // Use id (shot_generations.id) - unique per entry
      onDuplicate(image.id, timelineFrame);
    }
  };

  const generationId = getGenerationId(image as {
    generation_id?: string | null;
    id?: string | null;
    metadata?: Record<string, unknown>;
  });
  const { isVariantDropTarget, activeRegion, dragHandlers } = useImageVariantDrop({
    generationId,
    onVariantDrop: onVariantDrop ?? (async () => {}),
    disabled: !onVariantDrop,
    onTargetStateChange: (isActive) => {
      onVariantDropTargetChange?.(isActive ? image.id : null);
    },
  });

  const finalClassName = cn(
    "group relative border rounded-lg overflow-hidden cursor-pointer bg-card hover:ring-2 hover:ring-primary/50 transition-colors",
    isUploadedReference && "border-emerald-400/80 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]",
    isSelected && "ring-4 ring-orange-500 ring-offset-2 ring-offset-background bg-orange-500/15 border-orange-500",
    isDragDisabled && "cursor-default"
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={finalClassName}
      data-selected={isSelected}
      data-image-id={image.id?.substring(0, 8)}
      {...(!isDragDisabled ? attributes : {})}
      {...dragHandlers}
      onClick={(e) => {
        // Check if the click originated from a button or its children
        const target = e.target as HTMLElement;
        const isButtonClick = target.closest('button') !== null;

        // Don't trigger onClick if the click came from a button
        if (!isButtonClick) {
          onClick(e);
        }
      }}
      onPointerDown={(e) => {
        // Check if the pointer down originated from a button or its children
        const target = e.target as HTMLElement;
        const isButtonClick = target.closest('button') !== null;

        // Don't trigger onPointerDown if the click came from a button
        if (!isButtonClick) {
          onPointerDown?.(e);
        }
      }}
      onDoubleClick={isMobile ? undefined : onOpenLightbox}
    >
      <VariantDropOverlay
        isVisible={isVariantDropTarget}
        activeRegion={activeRegion}
      />

      {isUploadedReference && (
        <div className="absolute left-1 top-1 z-10 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white pointer-events-none">
          Reference
        </div>
      )}

      {/* Progressive image display */}
      <img
        ref={progressiveRef}
        src={shouldLoad ? displayImageUrl : '/placeholder.svg'}
        crossOrigin={mediaCrossOrigin(shouldLoad ? displayImageUrl : '/placeholder.svg')}
        alt={`Generated image ${Math.floor((timelineFrame ?? 0) / 50) + 1}`}
        className={cn(
          "w-full h-full object-cover transition-all duration-200",
          // Progressive loading visual states
          isThumbShowing && "opacity-95",
          isFullLoaded && "opacity-100"
        )}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        loading="lazy"
        draggable={false}
        {...(!isDragDisabled ? listeners : {})}
        onError={(e) => {
          // Fallback to original URL if display URL fails
          const target = e.target as HTMLImageElement;
          if (target.src !== fallbackImageUrl) {
            target.src = fallbackImageUrl;
          }
        }}
      />

      {/* Time overlay - bottom (showing position-based time in seconds) */}
      {(displayTimeSeconds !== undefined || timelineFrame !== undefined) && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
          <span className="inline-block">
            {displayTimeSeconds !== undefined
              ? `${displayTimeSeconds.toFixed(2)}s`
              : framesToSeconds(timelineFrame!)}
          </span>
        </div>
      )}

      {(!isMobile || !isDragDisabled) && (
        <>
          {/* Variant Count + NEW badge - bottom, above time */}
          <VariantBadge
            derivedCount={image.derivedCount}
            unviewedVariantCount={image.unviewedVariantCount}
            hasUnviewedVariants={image.hasUnviewedVariants}
            variant="overlay"
            size="md"
            position="bottom-5 left-1/2 -translate-x-1/2"
            onMarkAllViewed={handleMarkAllVariantsViewed}
          />

          {/* Action buttons - top center, side by side */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {onDuplicate && timelineFrame !== undefined && (
              <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6 p-0 rounded-full"
                onClick={handleDuplicateClick}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                disabled={duplicatingImageId === image.id || image.id?.startsWith('temp-')}
                title={image.id?.startsWith('temp-') ? "Please wait..." : "Duplicate image"}
              >
                {duplicatingImageId === image.id ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                ) : duplicateSuccessImageId === image.id ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              variant="destructive"
              size="icon"
              className="h-6 w-6 p-0 rounded-full"
              onClick={handleDeleteClick}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              disabled={image.id?.startsWith('temp-')}
              title={image.id?.startsWith('temp-') ? "Please wait..." : "Remove from timeline"}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// Only re-render when these specific props change
export const ShotBatchItemDesktop = React.memo(
  ShotBatchItemDesktopComponent,
  (prevProps, nextProps) => {
    const previousItem = prevProps.item;
    const nextItem = nextProps.item;

    return (
      previousItem.image.id === nextItem.image.id &&
      previousItem.selection.isSelected === nextItem.selection.isSelected &&
      previousItem.selection.isDragDisabled === nextItem.selection.isDragDisabled &&
      previousItem.timing.timelineFrame === nextItem.timing.timelineFrame &&
      previousItem.timing.displayTimeSeconds === nextItem.timing.displayTimeSeconds &&
      previousItem.duplication.duplicatingImageId === nextItem.duplication.duplicatingImageId &&
      previousItem.duplication.duplicateSuccessImageId === nextItem.duplication.duplicateSuccessImageId &&
      previousItem.loading.shouldLoad === nextItem.loading.shouldLoad &&
      previousItem.loading.projectAspectRatio === nextItem.loading.projectAspectRatio &&
      previousItem.image.type === nextItem.image.type &&
      previousItem.image.thumbUrl === nextItem.image.thumbUrl &&
      previousItem.image.imageUrl === nextItem.image.imageUrl
    );
  }
);
