/**
 * PromptSection Component
 *
 * The prompt input area with:
 * - Label with enhanced/default badges and field controls
 * - Textarea with clearable input
 * - Enhance prompt toggle and make-primary variant switch
 */

import React from 'react';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/primitives/label';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ModelToggle } from '@/shared/components/ui/composed/model-toggle';
import { FieldDefaultControls } from './FieldDefaultControls';
import { EnhancedPromptBadge } from './EnhancedPromptBadge';
import type { usePromptFieldState } from '@/shared/hooks/usePromptFieldState';
import type {
  SegmentDefaultFieldProps,
  SegmentSettingsChangeProps,
} from '../types';
import type { SelectedModel } from '@/tools/travel-between-images/settings';

interface PromptSectionProps extends SegmentDefaultFieldProps, SegmentSettingsChangeProps {
  promptField: ReturnType<typeof usePromptFieldState>;
  isRegeneration: boolean;

  // Model selection
  selectedModel?: SelectedModel;
  onSelectedModelChange?: (model: SelectedModel) => void;

  // Enhanced prompt
  basePromptForEnhancement?: string;
  enhancePromptEnabled?: boolean;
  onEnhancePromptChange?: (enabled: boolean) => void;

  // Smooth continuations (shown inline next to Make Primary when available)
  smoothContinuations?: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    maxOutputFrames: number;
  };
}

export const PromptSection: React.FC<PromptSectionProps> = ({
  promptField,
  isRegeneration,
  settings,
  onChange,
  basePromptForEnhancement,
  enhancePromptEnabled,
  onEnhancePromptChange,
  selectedModel,
  onSelectedModelChange,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
  smoothContinuations,
}) => {
  return (
    <div className="space-y-2" data-regeneration={isRegeneration ? 'true' : 'false'}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Prompt:</Label>
          {promptField.badgeType === 'enhanced' && (
            <EnhancedPromptBadge
              onClear={promptField.handleClearEnhanced}
              onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('prompt', promptField.displayValue) : undefined}
              isSaving={savingField === 'prompt'}
              basePrompt={basePromptForEnhancement}
            />
          )}
          {promptField.badgeType === 'default' && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">
              Default
            </span>
          )}
          {promptField.badgeType === null && promptField.userHasSetPrompt && (
            <FieldDefaultControls
              isUsingDefault={false}
              onUseDefault={promptField.handleClearAll}
              onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('prompt', promptField.displayValue) : undefined}
              isSaving={savingField === 'prompt'}
            />
          )}
        </div>
        <Textarea
          value={promptField.displayValue}
          onChange={(e) => promptField.handleChange(e.target.value)}
          className="h-20 text-sm resize-none"
          placeholder="Describe this segment..."
          clearable
          onClear={promptField.handleClearAll}
        />
      </div>

      {/* Toggle Grid */}
      <div className="grid grid-cols-2 gap-2">
        {onSelectedModelChange && selectedModel && (
          <ModelToggle
            selectedModel={selectedModel}
            onSelectedModelChange={onSelectedModelChange}
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-x-2 p-2 bg-muted/30 rounded-lg border">
              <Switch
                id="make-primary-segment"
                checked={settings.makePrimaryVariant}
                onCheckedChange={(value) => onChange({ makePrimaryVariant: value })}
              />
              <Label htmlFor="make-primary-segment" className="text-xs cursor-pointer flex-1">
                Make Primary
              </Label>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Make this the primary variant for this segment</p>
          </TooltipContent>
        </Tooltip>
        {onEnhancePromptChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-x-2 p-2 bg-muted/30 rounded-lg border">
                <Switch
                  id="enhance-prompt-segment"
                  checked={enhancePromptEnabled ?? false}
                  onCheckedChange={onEnhancePromptChange}
                />
                <Label htmlFor="enhance-prompt-segment" className="text-xs cursor-pointer flex-1">
                  Enhance Prompt
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>AI will generate a prompt for this segment based on the images</p>
            </TooltipContent>
          </Tooltip>
        )}
        {smoothContinuations && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-x-2 p-2 bg-muted/30 rounded-lg border">
                <Switch
                  id="smooth-continuations-segment"
                  checked={smoothContinuations.enabled}
                  onCheckedChange={smoothContinuations.onChange}
                />
                <Label htmlFor="smooth-continuations-segment" className="text-xs cursor-pointer flex-1">
                  Continue
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Continue from the previous variant for smoother transitions</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
