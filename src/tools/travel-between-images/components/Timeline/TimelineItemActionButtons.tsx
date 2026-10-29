import React, { type MutableRefObject } from 'react';
import { Maximize2, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { VariantBadge } from '@/shared/components/VariantBadge';
import type { GenerationRow } from '@/domains/generation/types';

interface TimelineItemActionButtonsProps {
  image: GenerationRow;
  isDragging: boolean;
  readOnly: boolean;
  isSelected: boolean;
  isTouchDevice: boolean;
  onMobileTap?: () => void;
  onDeleteClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMarkAllVariantsViewed: () => void;
  buttonClickedRef: MutableRefObject<boolean>;
  scheduleButtonClickReset: () => void;
}

export const TimelineItemActionButtons: React.FC<TimelineItemActionButtonsProps> = ({
  image,
  isDragging,
  readOnly,
  isSelected,
  isTouchDevice,
  onMobileTap,
  onDeleteClick,
  onMarkAllVariantsViewed,
  buttonClickedRef,
  scheduleButtonClickReset,
}) => {
  const markButtonInteraction = (e: React.MouseEvent | React.PointerEvent) => {
    buttonClickedRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    scheduleButtonClickReset();
  };

  return (
    <>
      {isSelected && isTouchDevice && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none gap-1">
          <div className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-md">
            Tap timeline to place
          </div>
          {onMobileTap && (
            <Button
              size="icon"
              variant="secondary"
              className="h-7 w-7 rounded-full bg-background/90 hover:bg-background shadow-lg pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                onMobileTap();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
              title="Open lightbox"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {!isDragging && !readOnly && (
        <>
          <VariantBadge
            derivedCount={image.derivedCount}
            unviewedVariantCount={image.unviewedVariantCount}
            hasUnviewedVariants={image.hasUnviewedVariants}
            variant="overlay"
            size="sm"
            zIndex={20}
            onMarkAllViewed={onMarkAllVariantsViewed}
          />

          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onClick={onDeleteClick}
            onMouseDown={markButtonInteraction}
            onPointerDown={markButtonInteraction}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            title="Remove from timeline"
          >
            <Trash2 className="!h-3 !w-3" />
          </Button>
        </>
      )}
    </>
  );
};
