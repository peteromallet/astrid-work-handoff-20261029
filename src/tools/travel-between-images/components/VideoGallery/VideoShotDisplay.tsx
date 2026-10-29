import React, { useState } from 'react';
import type { Shot } from '@/domains/generation/types';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useClickRipple } from '@/shared/hooks/interaction/useClickRipple';
import { isVideoGeneration, isPositioned } from '@/shared/lib/typeGuards';
import { VideoGenerationModal } from '../VideoGenerationModal';
import { ImageGenerationModal } from '@/shared/components/modals/ImageGenerationModal';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useVideoShotDisplayState } from '../hooks/useVideoShotDisplayState';
import { ShotMetadata, ShotControls, ShotPreview } from './VideoShotDisplayParts';
import { useShotAdditionSelectionOptional } from '@/shared/state/selectionStore';
import { usePanesStore } from '@/shared/state/panesStore';

interface VideoShotDisplayProps {
  readOnly?: boolean;
  shot: Shot;
  onSelectShot: () => void;
  isHidden?: boolean;
  onToggleHidden?: (e?: React.MouseEvent) => void;
  shouldLoadImages?: boolean;
  shotIndex?: number;
  isHighlighted?: boolean;
  pendingUploads?: number;
  imagesOverlay?: React.ReactNode;
  dropLoadingState?: 'idle' | 'loading' | 'success';
}

export const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({
  readOnly = false,
  shot,
  onSelectShot,
  isHidden = false,
  onToggleHidden,
  isHighlighted = false,
  pendingUploads = 0,
  imagesOverlay,
  dropLoadingState = 'idle',
}) => {
  const isTempShot = shot.id.startsWith('temp-');

  const { triggerRipple, rippleStyles, isRippleActive } = useClickRipple();

  const handleRippleTrigger = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const isButton = target.closest('button, [role="button"], input');
    if (!isButton) {
      triggerRipple(e);
    }
  };

  const isGenerationsPaneLocked = usePanesStore((state) => state.isGenerationsPaneLocked);
  const isMobile = useIsMobile();
  const shotAdditionSelection = useShotAdditionSelectionOptional();
  const {
    isVideoModalOpen,
    isSelectedForAddition,
    setVideoModalOpen,
    setSelectedForAddition,
  } = useVideoShotDisplayState({
    shotId: shot.id,
    selectedShotId: shotAdditionSelection?.selectedShotId,
    isGenerationsPaneLocked,
  });

  const [isImageGenModalOpen, setIsImageGenModalOpen] = useState(false);

  const handleSelectShotForAddition = (e: React.MouseEvent) => {
    e.stopPropagation();
    shotAdditionSelection?.selectShotForAddition(shot.id);
    setSelectedForAddition(true);
  };

  const displayImages = (shot.images || [])
    .filter(img => !isVideoGeneration(img) && isPositioned(img))
    .sort((a, b) => {
      const fa = a.timeline_frame ?? 0;
      const fb = b.timeline_frame ?? 0;
      return fa - fb;
    });

  const handleClick = () => {
    if (isTempShot) return;
    onSelectShot();
  };

  return (
    <>
      <div
        key={shot.id}
        className={cn(
          'click-ripple group p-4 border rounded-lg bg-card/50 dark:bg-card/70 dark:border-border transition-all duration-700 relative flex flex-col',
          isRippleActive && 'ripple-active',
          isHighlighted && 'ring-4 ring-blue-500 ring-opacity-75 shadow-[0_0_30px_rgba(59,130,246,0.6)] scale-105 animate-pulse',
          isHidden && 'opacity-50',
          isTempShot
            ? 'opacity-70 cursor-wait animate-pulse'
            : 'hover:bg-card/80 hover:shadow-wes-hover hover:border-primary/30 hover:scale-105 cursor-pointer',
        )}
        style={rippleStyles}
        onPointerDown={isTempShot ? undefined : handleRippleTrigger}
        onClick={handleClick}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ShotMetadata
              displayName={shot.name}
              generationMode={(shot.settings as Record<string, unknown>)?.generationMode as string | undefined}
            />
            {isHidden && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                Hidden
              </span>
            )}
          </div>
          <ShotControls
            readOnly={readOnly}
            isTempShot={isTempShot}
            displayImagesCount={displayImages.length}
            isHidden={isHidden}
            onVideoClick={() => setVideoModalOpen(true)}
            onToggleHidden={onToggleHidden}
          />
        </div>

        <ShotPreview
          displayImages={displayImages}
          pendingUploads={pendingUploads}
          imagesOverlay={imagesOverlay}
          dropLoadingState={dropLoadingState}
          showMobileSelect={isGenerationsPaneLocked && isMobile}
          isSelectedForAddition={isSelectedForAddition}
          onSelectShotForAddition={handleSelectShotForAddition}
          readOnly={readOnly}
          onGenerate={readOnly ? undefined : () => setIsImageGenModalOpen(true)}
        />
      </div>

      {!readOnly && isVideoModalOpen && (
        <VideoGenerationModal
          isOpen={isVideoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          shot={shot}
          defaultTopOpen={false}
          defaultBottomOpen={true}
        />
      )}

      {!readOnly && isImageGenModalOpen && (
        <ImageGenerationModal
          isOpen={isImageGenModalOpen}
          onClose={() => setIsImageGenModalOpen(false)}
          initialShotId={shot.id}
        />
      )}
    </>
  );
};
