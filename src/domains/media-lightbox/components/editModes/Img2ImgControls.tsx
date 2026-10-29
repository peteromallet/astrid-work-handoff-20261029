/**
 * Img2ImgControls - Img2Img mode form controls
 *
 * Prompt, strength slider, selected LoRAs, and generate button for img2img mode.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, Loader2, Wand2 } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/components/ui/contracts/cn';
import { ActiveLoRAsDisplay } from '@/domains/lora/components';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import { composeDisabledReason } from '@/shared/components/RuntimeConnection/copy.ts';

interface Img2ImgControlsProps {
  isMobile: boolean;
  // Form state
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  flushTextFields: () => Promise<void>;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  // Generation status
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  handleGenerateImg2Img: () => void;
  // LoRA
  img2imgLoraManager?: LoraManagerState;
  // Responsive config
  SectionLabel: React.FC<{ children: React.ReactNode }>;
}

export const Img2ImgControls: React.FC<Img2ImgControlsProps> = ({
  isMobile,
  img2imgPrompt,
  setImg2imgPrompt,
  flushTextFields,
  img2imgStrength,
  setImg2imgStrength,
  isGeneratingImg2Img,
  img2imgGenerateSuccess,
  handleGenerateImg2Img,
  img2imgLoraManager,
  SectionLabel,
}) => {
  const spacing = isMobile ? 'space-y-2' : 'space-y-4';
  const labelSize = isMobile ? 'text-[10px] uppercase tracking-wide text-muted-foreground' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[50px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 2 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm';
  const generationsSpacing = isMobile ? 'space-y-0.5' : 'space-y-2';
  const sliderTextSize = isMobile ? 'text-xs' : 'text-sm';
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  // The hosted build cannot compose images: the button is disabled and the line says why.
  const disabledReason = composeDisabledReason();

  return (
    <>
      <div className={spacing}>
        {/* Prompt (optional for img2img) */}
        <div className={generationsSpacing}>
          <SectionLabel>Prompt</SectionLabel>
          {!isMobile && <label className={`${labelSize} font-medium`}>Prompt (optional):</label>}
          <Textarea
            value={img2imgPrompt}
            onChange={(e) => setImg2imgPrompt(e.target.value)}
            onBlur={() => {
              void flushTextFields();
            }}
            placeholder={isMobile ? "Describe image..." : "Optional: describe what the transformed image should look like..."}
            className={`w-full ${textareaMinHeight} ${textareaPadding} ${textareaTextSize} resize-none`}
            rows={textareaRows}
            clearable
            onClear={() => setImg2imgPrompt('')}
          />
        </div>

        {/* Strength Slider */}
        <div>
          <SectionLabel>Strength</SectionLabel>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className={`${labelSize} font-medium cursor-help`}>Strength:</label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  <p className="text-xs">
                    Lower = closer to original, Higher = more transformed
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-[70%]")}>
              <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Keep</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={img2imgStrength}
                onChange={(e) => setImg2imgStrength(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Change</span>
              <span className={cn(sliderTextSize, "text-foreground font-medium w-8 text-right", isMobile && "text-xs")}>{Math.round(img2imgStrength * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Selected LoRAs */}
        {img2imgLoraManager && img2imgLoraManager.selectedLoras.length > 0 && (
          <div className={generationsSpacing}>
            <SectionLabel>Style LoRAs</SectionLabel>
            <ActiveLoRAsDisplay
              selectedLoras={img2imgLoraManager.selectedLoras}
              onRemoveLora={img2imgLoraManager.handleRemoveLora}
              onLoraStrengthChange={img2imgLoraManager.handleLoraStrengthChange}
              isGenerating={isGeneratingImg2Img}
              className={isMobile ? "mt-1" : "mt-2"}
            />
          </div>
        )}
      </div>

      {/* Generate Button */}
      <Button
        variant="default"
        size={buttonSize as 'sm' | 'default'}
        onClick={handleGenerateImg2Img}
        disabled={disabledReason !== null || isGeneratingImg2Img || img2imgGenerateSuccess}
        className={cn(
          "w-full",
          isMobile && "h-9 text-xs",
          img2imgGenerateSuccess && "bg-green-600 hover:bg-green-600"
        )}
      >
        {isGeneratingImg2Img ? (
          <>
            <Loader2 className={`${iconSize} mr-1.5 animate-spin`} />
            {isMobile ? 'Creating...' : 'Generating...'}
          </>
        ) : img2imgGenerateSuccess ? (
          <>
            <CheckCircle className={`${iconSize} mr-1.5`} />
            {isMobile ? 'Submitted' : 'Submitted, results will appear below'}
          </>
        ) : (
          <>
            <Wand2 className={`${iconSize} mr-1.5`} />
            {isMobile ? 'Transform' : 'Transform Image'}
          </>
        )}
      </Button>
      {disabledReason && (
        <p role="note" className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>{disabledReason}</p>
      )}
    </>
  );
};
