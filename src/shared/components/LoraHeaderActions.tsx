import React, { useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';

interface LoraHeaderActionsProps {
  hasSavedLoras: boolean;
  selectedLorasCount: number;
  isSaving: boolean;
  saveSuccess: boolean;
  saveFlash: boolean;
  onSave: () => void;
  onLoad: () => void;
  /** Pre-formatted tooltip content string. If omitted, computed from `savedLoras`. */
  savedLorasContent?: string;
  /** Raw saved LoRAs array. Used to compute tooltip content when `savedLorasContent` is not provided. */
  savedLoras?: Array<{ id: string; strength: number }>;
}

/**
 * Save/Load buttons for LoRA project persistence.
 * Used by both useLoraManager (shared) and useLoraSync (travel tool).
 */
export const LoraHeaderActions: React.FC<LoraHeaderActionsProps> = ({
  hasSavedLoras,
  selectedLorasCount,
  isSaving,
  saveSuccess,
  saveFlash,
  savedLorasContent,
  savedLoras,
  onSave,
  onLoad,
}) => {
  // Compute tooltip content: prefer pre-formatted string, fall back to computing from array
  const tooltipContent = useMemo(() => {
    if (savedLorasContent) return savedLorasContent;
    if (savedLoras && savedLoras.length > 0) {
      return `Saved LoRAs (${savedLoras.length}):\n` +
        savedLoras.map(lora => `\u2022 ${lora.id} (strength: ${lora.strength})`).join('\n');
    }
    return 'No saved LoRAs available';
  }, [savedLorasContent, savedLoras]);

  return (
    <div className="flex gap-1 ml-2 w-1/2">
      {/* Save LoRAs button with tooltip - 1/4 width */}
      <div className="flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={selectedLorasCount === 0 || isSaving}
              className={`w-full text-xs h-7 flex items-center justify-center transition-all duration-300 ${
                saveFlash
                  ? 'bg-green-500 hover:bg-green-600 border-green-500 text-white scale-105'
                  : saveSuccess
                  ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white'
                  : ''
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save current LoRAs to project</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Load LoRAs button with tooltip - 3/4 width */}
      <div className="flex-[3]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoad}
              disabled={!hasSavedLoras}
              className={`w-full text-xs h-7 ${
                hasSavedLoras
                  ? ''
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              Load LoRAs
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div style={{ whiteSpace: 'pre-line' }}>
              {tooltipContent}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
