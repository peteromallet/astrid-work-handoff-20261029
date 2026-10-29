import React, { useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { Button } from '@/shared/components/ui/button';
import { Check, Loader2, Video, ChevronDown, ChevronUp, Sparkles, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface ActionButtonsRowProps {
  readOnly?: boolean;
  isTempShot: boolean;
  displayImagesCount: number;
  isHidden?: boolean;
  onVideoClick: () => void;
  onToggleHidden?: (e?: React.MouseEvent) => void;
}

const ActionButtonsRow: React.FC<ActionButtonsRowProps> = ({
  readOnly = false,
  isTempShot,
  displayImagesCount,
  isHidden = false,
  onVideoClick,
  onToggleHidden,
}) => (
  <div className="flex items-center gap-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
    {isTempShot && (
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Saving...</span>
      </div>
    )}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              if (displayImagesCount > 0 && !isTempShot) {
                onVideoClick();
              }
            }}
            disabled={readOnly || displayImagesCount === 0 || isTempShot}
            className={`h-8 w-8 ${
              displayImagesCount === 0 || isTempShot
                ? 'text-zinc-400 cursor-not-allowed opacity-50'
                : 'text-violet-600 hover:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950'
            }`}
          >
            <Video className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{readOnly ? 'Unavailable for local timeline' : isTempShot ? 'Saving...' : displayImagesCount === 0 ? 'Add images to generate video' : 'Generate Video'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {onToggleHidden && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHidden(e);
              }}
              className="h-8 w-8"
              disabled={readOnly || isTempShot}
              aria-label={isHidden ? 'Unhide shot' : 'Hide shot'}
            >
              {isHidden ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{readOnly ? 'Unavailable for local timeline' : isTempShot ? 'Saving...' : isHidden ? 'Unhide shot' : 'Hide shot'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
  </div>
);

const IMAGES_PER_ROW = 3;

interface ThumbnailMosaicProps {
  readOnly?: boolean;
  displayImages: GenerationRow[];
  pendingUploads: number;
  imagesOverlay?: React.ReactNode;
  dropLoadingState: 'idle' | 'loading' | 'success';
  showMobileSelect: boolean;
  isSelectedForAddition: boolean;
  onSelectShotForAddition: (e: React.MouseEvent) => void;
  onGenerate?: () => void;
}

const ThumbnailMosaic: React.FC<ThumbnailMosaicProps> = ({
  readOnly = false,
  displayImages,
  pendingUploads,
  imagesOverlay,
  dropLoadingState,
  showMobileSelect,
  isSelectedForAddition,
  onSelectShotForAddition,
  onGenerate,
}) => {
  const [isImagesExpanded, setIsImagesExpanded] = useState(false);

  const totalImageCount = displayImages.length + pendingUploads;
  const hasMultipleRows = totalImageCount > IMAGES_PER_ROW;
  const collapsedRealImages = Math.min(displayImages.length, IMAGES_PER_ROW);
  const collapsedSkeletonCount = !isImagesExpanded
    ? Math.min(pendingUploads, IMAGES_PER_ROW - collapsedRealImages)
    : 0;
  const emptyPlaceholderCount = !isImagesExpanded
    ? Math.max(0, IMAGES_PER_ROW - collapsedRealImages - collapsedSkeletonCount)
    : 0;

  return (
    <div className="flex-grow relative">
      {imagesOverlay}

      {dropLoadingState !== 'idle' && displayImages.length > IMAGES_PER_ROW && !isImagesExpanded && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg',
              dropLoadingState === 'loading' && 'bg-primary text-primary-foreground',
              dropLoadingState === 'success' && 'bg-green-600 text-white'
            )}
          >
            {dropLoadingState === 'loading' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            )}
            {dropLoadingState === 'success' && (
              <>
                <Check className="h-4 w-4" />
                Added
              </>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 relative">
        {(isImagesExpanded ? displayImages : displayImages.slice(0, IMAGES_PER_ROW)).map((image, index) => (
          <img
            key={`${image.thumbUrl || image.imageUrl || image.location || 'img'}-${index}`}
            src={getDisplayUrl(image.thumbUrl || image.imageUrl || image.location)}
            crossOrigin={mediaCrossOrigin(getDisplayUrl(image.thumbUrl || image.imageUrl || image.location))}
            alt={`Shot image ${index + 1}`}
            className="w-full aspect-square object-cover rounded border border-border bg-muted shadow-sm"
            title={`Image ${index + 1}`}
          />
        ))}

        {collapsedSkeletonCount > 0 && Array.from({ length: collapsedSkeletonCount }).map((_, index) => (
          <div
            key={`pending-collapsed-${index}`}
            className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
          >
            <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
          </div>
        ))}

        {emptyPlaceholderCount > 0 && Array.from({ length: emptyPlaceholderCount }).map((_, index) => (
          <div
            key={`empty-${index}`}
            className="w-full aspect-square rounded border-2 border-dashed border-border"
          />
        ))}

        {pendingUploads > 0 && isImagesExpanded && Array.from({ length: pendingUploads }).map((_, index) => (
          <div
            key={`pending-${index}`}
            className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
          >
            <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
          </div>
        ))}

        {/* Bottom overlay buttons */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 z-10">
          {onGenerate && !readOnly && (
            <button
              className="text-xs bg-black/60 hover:bg-black/80 text-white p-1 rounded flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                onGenerate();
              }}
            >
              <Sparkles className="w-3 h-3" />
            </button>
          )}

          {hasMultipleRows && !isImagesExpanded && (
            <button
              className="text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsImagesExpanded(true);
              }}
            >
              Show All ({totalImageCount}) <ChevronDown className="w-3 h-3" />
            </button>
          )}

          {isImagesExpanded && hasMultipleRows && (
            <button
              className="text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsImagesExpanded(false);
              }}
            >
              Hide <ChevronUp className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {showMobileSelect && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSelectedForAddition ? 'default' : 'secondary'}
                size="sm"
                onClick={onSelectShotForAddition}
                className={`absolute bottom-1 left-1 h-7 px-2 text-xs shadow-sm z-10 transition-all duration-200 ${
                  isSelectedForAddition
                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                    : 'bg-background/90 hover:bg-background border'
                }`}
              >
                {isSelectedForAddition ? 'Selected' : 'Select'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSelectedForAddition ? 'Images will be added to this shot' : 'Add images to this shot'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

interface ShotMetadataProps {
  displayName: string;
  generationMode?: string;
}

export const ShotMetadata: React.FC<ShotMetadataProps> = ({
  displayName,
  generationMode,
}) => (
  <div className="flex items-center gap-2 flex-grow mr-2 min-w-0">
    <h3 className="text-xl font-light group-hover:text-primary/80 transition-colors duration-300 truncate">
      {displayName}
    </h3>
    {generationMode && (
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
        {generationMode === 'by-pair' ? 'pair' : generationMode}
      </span>
    )}
  </div>
);

interface ShotControlsProps {
  readOnly?: boolean;
  isTempShot: boolean;
  displayImagesCount: number;
  isHidden?: boolean;
  onVideoClick: () => void;
  onToggleHidden?: (e?: React.MouseEvent) => void;
}

export const ShotControls: React.FC<ShotControlsProps> = (props) => (
  <ActionButtonsRow {...props} />
);

interface ShotPreviewProps {
  readOnly?: boolean;
  displayImages: GenerationRow[];
  pendingUploads: number;
  imagesOverlay?: React.ReactNode;
  dropLoadingState: 'idle' | 'loading' | 'success';
  showMobileSelect: boolean;
  isSelectedForAddition: boolean;
  onSelectShotForAddition: (e: React.MouseEvent) => void;
  onGenerate?: () => void;
}

export const ShotPreview: React.FC<ShotPreviewProps> = (props) => (
  <ThumbnailMosaic {...props} />
);
