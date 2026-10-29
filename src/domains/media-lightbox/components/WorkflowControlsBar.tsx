import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { FilmIcon, Check } from 'lucide-react';
import { ShotSelectorControls } from './ShotSelectorControls';
import type { ShotSelectorControlsProps } from './ShotSelectorControls';

export interface WorkflowControlsBarProps {
  core: {
    isVideo: boolean;
    onAddToVideoEditor?: () => void;
    addToVideoEditorPhase?: 'idle' | 'staged';
  };
  shotSelector?: ShotSelectorControlsProps;
}

/**
 * WorkflowControlsBar Component
 * The bottom bar containing shot selector and timeline controls
 * Used across all layout variants (Desktop Side Panel, Mobile Stacked, Regular)
 */
export const WorkflowControlsBar: React.FC<WorkflowControlsBarProps> = ({
  core,
  shotSelector,
}) => {
  if (!(shotSelector || core.onAddToVideoEditor)) {
    return null;
  }

  const isStaged = core.addToVideoEditorPhase === 'staged';
  const hasBottomBar = Boolean(
    shotSelector && shotSelector.allShots.length > 0 && !core.isVideo,
  );

  return (
    <>
      {core.onAddToVideoEditor && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 flex items-center z-[70]">
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-1.5 py-1 flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={isStaged ? 'Jump to video editor' : 'Add to video editor timeline'}
                  onClick={core.onAddToVideoEditor}
                  className={
                    isStaged
                      ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white h-8 px-3'
                      : 'bg-blue-600/80 hover:bg-blue-600 text-white h-8 px-3'
                  }
                >
                  {isStaged ? <Check className="h-4 w-4" /> : <FilmIcon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isStaged ? 'Click to jump to video editor' : 'Add to video editor timeline'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {hasBottomBar && (
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-x-2 z-[60]">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-1.5 py-1 flex items-center gap-x-2">
          {/* Shot Selection and Add to Shot */}
          {shotSelector && shotSelector.allShots.length > 0 && !core.isVideo && (
            <ShotSelectorControls {...shotSelector} />
          )}

        </div>
      </div>
      )}
    </>
  );
};
