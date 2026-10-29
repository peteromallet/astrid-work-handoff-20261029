import React, { useState } from 'react';
import { Label } from '@/shared/components/ui/primitives/label';
import { Switch } from '@/shared/components/ui/switch';
import { Button } from '@/shared/components/ui/button';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import {
  Loader2,
  Check,
  Film,
  Wand2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { AdvancedSettingsSection } from '@/shared/components/VideoPortionEditor/components/AdvancedSettingsSection';
import { PortionSelectionList } from '@/shared/components/VideoPortionEditor/components/PortionSelectionList';
import { getMaxGapFrames } from '@/shared/components/VideoPortionEditor/lib/videoPortionEditorUtils';
import type { VideoPortionEditorProps } from '@/shared/components/VideoPortionEditor/types';
import { getQuantizedGap } from '@/shared/components/JoinClipsSettingsForm/utils';

export const VideoPortionEditor: React.FC<VideoPortionEditorProps> = ({
  settings,
  selections: selectionProps,
  lora,
  motion,
  actions,
  stateOverrides,
}) => {
  const {
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    maxContextFrames,
    negativePrompt,
    setNegativePrompt,
    enhancePrompt,
    setEnhancePrompt,
  } = settings;
  const {
    selections = [],
    onUpdateSelectionSettings,
    onRemoveSelection,
    onAddSelection,
    videoUrl,
    fps,
  } = selectionProps ?? {};
  const {
    onGenerate,
    isGenerating,
    generateSuccess,
    isGenerateDisabled = false,
    validationErrors = [],
  } = actions;
  const { hideHeader = false } = stateOverrides ?? {};
  const enhancePromptValue = enhancePrompt ?? false;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleContextFramesChange = (value: number) => {
    const newContextFrames = Math.max(4, value);
    setContextFrames(newContextFrames);

    const maxGap = getMaxGapFrames(newContextFrames);
    const quantizedGap = getQuantizedGap(Math.min(gapFrames, maxGap), newContextFrames);
    if (quantizedGap !== gapFrames) {
      setGapFrames(quantizedGap);
    }

    selections.forEach((selection) => {
      const selectionGap = selection.gapFrameCount ?? gapFrames;
      if (selectionGap > maxGap) {
        const newQuantizedGap = getQuantizedGap(
          Math.min(selectionGap, maxGap),
          newContextFrames
        );
        onUpdateSelectionSettings?.(selection.id, { gapFrameCount: newQuantizedGap });
      }
    });
  };

  return (
    <TooltipProvider>
      <div className="w-full">
        <div className="p-4 space-y-4">
          {!hideHeader && (
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" />
                {selections.length > 1 ? 'Replace Portions' : 'Replace Portion'}
              </h3>
            </div>
          )}

          {selections.length > 0 && onUpdateSelectionSettings && (
            <PortionSelectionList
              selections={selections}
              gapFrames={gapFrames}
              contextFrames={contextFrames}
              videoUrl={videoUrl}
              fps={fps}
              onUpdateSelectionSettings={onUpdateSelectionSettings}
              onRemoveSelection={onRemoveSelection}
              onAddSelection={onAddSelection}
            />
          )}

          <div className="flex items-center gap-x-2 p-3 bg-muted/30 rounded-lg border">
            <Switch
              id="edit-video-enhance-prompt"
              checked={enhancePromptValue}
              onCheckedChange={(value) => setEnhancePrompt?.(value)}
            />
            <div className="flex-1">
              <Label htmlFor="edit-video-enhance-prompt" className="font-medium cursor-pointer">
                Enhance/Create Prompts
              </Label>
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced((current) => !current)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Advanced Settings
          </button>

          {showAdvanced && (
            <AdvancedSettingsSection
              contextFrames={contextFrames}
              maxContextFrames={maxContextFrames}
              onContextFramesChange={handleContextFramesChange}
              negativePrompt={negativePrompt}
              setNegativePrompt={setNegativePrompt}
              lora={lora}
              motion={motion}
            />
          )}

          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                <AlertTriangle className="w-4 h-4" />
                Cannot generate
              </div>
              <ul className="text-xs text-destructive/80 space-y-0.5 pl-6">
                {validationErrors.map((error, index) => (
                  <li key={index} className="list-disc">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={isGenerateDisabled || isGenerating || generateSuccess}
            className={cn('w-full gap-2', generateSuccess && 'bg-green-600 hover:bg-green-600')}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : generateSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            <span>
              {generateSuccess
                ? 'Task Created'
                : `Replace ${selections.length} segment${selections.length > 1 ? 's' : ''}`}
            </span>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
};
