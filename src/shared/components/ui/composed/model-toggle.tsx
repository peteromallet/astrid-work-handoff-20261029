/**
 * ModelToggle - Segmented toggle for switching between WAN 2.2 and LTX 2.3 models.
 *
 * Visually distinct from Switch-based toggles: uses a two-segment pill
 * with left/right labels and a different accent color.
 */

import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import type { SelectedModel } from '@/tools/travel-between-images/settings';

interface ModelToggleProps {
  selectedModel: SelectedModel;
  onSelectedModelChange: (model: SelectedModel) => void;
}

export const ModelToggle: React.FC<ModelToggleProps> = ({
  selectedModel,
  onSelectedModelChange,
}) => {
  const isLtx = selectedModel === 'ltx-2.3' || selectedModel === 'ltx-2.3-fast';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex rounded-lg border border-border overflow-hidden h-full min-h-[36px]">
          <button
            type="button"
            onClick={() => onSelectedModelChange('wan-2.2')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
              !isLtx
                ? 'bg-muted text-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            WAN 2.2
          </button>
          <button
            type="button"
            onClick={() => onSelectedModelChange('ltx-2.3-fast')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
              isLtx
                ? 'bg-muted text-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            LTX 2.3
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Switch between WAN 2.2 and LTX 2.3 models</p>
      </TooltipContent>
    </Tooltip>
  );
};
