import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, PlusCircle, ArrowRight } from 'lucide-react';
import { ShotSelectorWithAdd } from '@/shared/components/selectors/ShotSelectorWithAdd';
import type { ShotOption } from '@/domains/generation/types';
import { useShotAssociationControls } from './hooks/useShotAssociationControls';

export interface ShotSelectorControlsProps {
  // Media info
  mediaId: string;
  imageUrl?: string;
  thumbUrl?: string;

  // Shot selection
  allShots: ShotOption[];
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;

  // Shot positioning
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;

  // Shot actions
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;

  // Optimistic updates
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;

  // UI state
  setIsSelectOpen?: (isOpen: boolean) => void;
  contentRef: React.RefObject<HTMLDivElement>;

  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;

  // Close lightbox
  onClose?: () => void;

  // Loading states
  isAdding?: boolean;
  isAddingWithoutPosition?: boolean;
}

/**
 * ShotSelectorControls Component
 * Consolidates the shot selector dropdown with add-to-shot buttons
 * Uses ShotSelectorWithAdd for the main selector + add button,
 * and adds an optional "add without position" button
 */
export const ShotSelectorControls: React.FC<ShotSelectorControlsProps> = ({
  mediaId,
  imageUrl,
  thumbUrl,
  allShots,
  selectedShotId,
  onShotChange,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  showTickForImageId,
  showTickForSecondaryImageId,
  onAddToShot,
  onAddToShotWithoutPosition,
  onShowTick,
  onOptimisticPositioned,
  onShowSecondaryTick,
  onOptimisticUnpositioned,
  contentRef,
  onNavigateToShot,
  onClose,
  isAdding = false,
  isAddingWithoutPosition = false,
}) => {
  const {
    selectedShot,
    isAddedWithoutPosition,
    handleAddWithoutPosition,
    handleJumpToSelectedShot,
  } = useShotAssociationControls({
    mediaId,
    imageUrl,
    thumbUrl,
    allShots,
    selectedShotId,
    isAlreadyAssociatedWithoutPosition,
    showTickForSecondaryImageId,
    onAddToShotWithoutPosition,
    onShowSecondaryTick,
    onOptimisticUnpositioned,
    onNavigateToShot,
    errorContext: 'ShotSelectorControls',
  });

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Top row: selector and buttons */}
      <div className="flex items-center gap-0.5">
        <ShotSelectorWithAdd
          imageId={mediaId}
          imageUrl={imageUrl}
          thumbUrl={thumbUrl}
          shots={allShots}
          selectedShotId={selectedShotId || ''}
          onShotChange={onShotChange || (() => {})}
          onAddToShot={onAddToShot}
          isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
          showTick={showTickForImageId === mediaId}
          isAdding={isAdding}
          onShowTick={onShowTick}
          onOptimisticPositioned={onOptimisticPositioned}
          onClose={onClose}
          layout="horizontal"
          container={contentRef.current}
          selectorClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
          buttonClassName="h-8 w-8"
        />

      {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (() => {
        const isShowingTick = isAddedWithoutPosition;
        const isDisabled = !selectedShotId || isAddingWithoutPosition;
        
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddWithoutPosition}
                disabled={isDisabled}
                className={`h-8 w-8 ml-1.5 text-white ${
                  isShowingTick
                    ? 'bg-green-600/80 hover:bg-green-600'
                    : 'bg-purple-600/80 hover:bg-purple-600'
                }`}
              >
                {isAddingWithoutPosition ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                ) : isShowingTick ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <PlusCircle className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isShowingTick
                ? 'Added without position. Jump to shot.'
                : 'Add to shot without position'}
            </TooltipContent>
          </Tooltip>
        );
      })()}
      </div>

      {/* Jump to shot link - below the buttons */}
      {selectedShot && onNavigateToShot && (
        <button
          onClick={handleJumpToSelectedShot}
          className="flex items-center gap-1.5 px-2.5 py-1 mt-1 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors whitespace-nowrap"
        >
          <span>{selectedShot.name.length > 12 ? `${selectedShot.name.substring(0, 12)}…` : selectedShot.name}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
