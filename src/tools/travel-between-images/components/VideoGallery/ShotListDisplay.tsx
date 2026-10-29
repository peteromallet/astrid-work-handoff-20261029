import React from 'react';
import { Shot } from '@/domains/generation/types';
import { ShotListItem, type DropOptions } from './ShotListItem';
import { type GenerationDropData } from '@/shared/lib/dnd/dragDrop';
import {
  NewShotDropZoneCard,
  PendingSkeletonShotCard,
  ShotListEmptyState,
  ShotListErrorState,
  ShotListLoadingState,
} from './components/ShotListDisplayStates';
import { useShotListDisplayController } from './hooks/useShotListDisplayController';

interface ShotListDisplayProps {
  readOnly?: boolean;
  onSelectShot: (shot: Shot) => void;
  onCreateNewShot?: () => void;
  shots?: Shot[];
  isHidden?: (shot: Shot) => boolean;
  onToggleHidden?: (shot: Shot) => void;
  sortMode?: 'ordered' | 'newest' | 'oldest';
  highlightedShotId?: string | null;
  onGenerationDropOnShot?: (shotId: string, data: GenerationDropData, options?: DropOptions) => Promise<void>;
  onGenerationDropForNewShot?: (data: GenerationDropData) => Promise<void>;
  onFilesDropForNewShot?: (files: File[]) => Promise<void>;
  onFilesDropOnShot?: (shotId: string, files: File[], options?: DropOptions) => Promise<void>;
  onSkeletonSetupReady?: (setup: (imageCount: number) => void, clear: () => void) => void;
}

export const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  readOnly = false,
  onSelectShot,
  onCreateNewShot,
  shots: propShots,
  isHidden,
  onToggleHidden,
  sortMode = 'ordered',
  highlightedShotId,
  onGenerationDropOnShot,
  onGenerationDropForNewShot,
  onFilesDropForNewShot,
  onFilesDropOnShot,
  onSkeletonSetupReady,
}) => {
  const {
    shotsLoading,
    shotsError,
    shots,
    pendingNewShot,
  } = useShotListDisplayController({
    shots: propShots,
    sortMode,
    onGenerationDropForNewShot,
    onFilesDropForNewShot,
    onSkeletonSetupReady,
  });

  if (shotsLoading || shots === undefined) {
    return <ShotListLoadingState />;
  }

  if (shotsError) {
    return <ShotListErrorState errorMessage={shotsError.message} onCreateNewShot={onCreateNewShot} />;
  }

  if (!shots || shots.length === 0) {
    return <ShotListEmptyState onCreateNewShot={onCreateNewShot} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2">
      {(onGenerationDropForNewShot || onFilesDropForNewShot) && (
        <NewShotDropZoneCard
          isNewShotProcessing={pendingNewShot.isNewShotProcessing}
          isNewShotDropTarget={pendingNewShot.isNewShotDropTarget}
          newShotDropType={pendingNewShot.newShotDropType}
          onDragEnter={pendingNewShot.handleNewShotDragEnter}
          onDragOver={pendingNewShot.handleNewShotDragOver}
          onDragLeave={pendingNewShot.handleNewShotDragLeave}
          onDrop={pendingNewShot.handleNewShotDrop}
          onClick={pendingNewShot.isNewShotProcessing ? undefined : onCreateNewShot}
        />
      )}

      {pendingNewShot.pendingSkeletonShot && (
        <PendingSkeletonShotCard pendingSkeletonShot={pendingNewShot.pendingSkeletonShot} />
      )}

      {shots.map((shot, index) => {
        return (
          <ShotListItem
            key={shot.id}
            shot={shot}
            onSelectShot={() => onSelectShot(shot)}
            isHidden={isHidden?.(shot) ?? false}
            onToggleHidden={onToggleHidden ? () => onToggleHidden(shot) : undefined}
            shouldLoadImages={true}
            shotIndex={index}
            isHighlighted={highlightedShotId === shot.id}
            onGenerationDrop={readOnly ? undefined : onGenerationDropOnShot}
            onFilesDrop={readOnly ? undefined : onFilesDropOnShot}
            readOnly={readOnly}
            initialPendingUploads={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.newlyCreatedShotExpectedImages : 0}
            initialPendingBaselineNonVideoCount={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.newlyCreatedShotBaselineNonVideoCount : undefined}
            onInitialPendingUploadsConsumed={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.clearNewlyCreatedShot : undefined}
          />
        );
      })}
    </div>
  );
};
