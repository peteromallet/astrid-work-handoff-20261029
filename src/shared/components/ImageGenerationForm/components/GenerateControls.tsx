import React from "react";
import { Button } from "@/shared/components/ui/button";
import { SliderWithValue } from "@/shared/components/ui/composed/slider-with-value";
import { composeDisabledReason } from "@/shared/components/RuntimeConnection/copy.ts";

interface GenerateControlsProps {
  imagesPerPrompt: number;
  onChangeImagesPerPrompt: (value: number) => void;
  actionablePromptsCount: number;
  isGenerating: boolean;
  justQueued: boolean;
}

export const GenerateControls: React.FC<GenerateControlsProps> = ({
  imagesPerPrompt,
  onChangeImagesPerPrompt,
  actionablePromptsCount,
  isGenerating,
  justQueued,
}) => {
  // The hosted build cannot compose images: the submit button is disabled and says why.
  const disabledReason = composeDisabledReason();

  const imageCount = imagesPerPrompt * actionablePromptsCount;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-md">
        <SliderWithValue
          label="Images per prompt"
          value={imagesPerPrompt}
          onChange={onChangeImagesPerPrompt}
          min={1}
          max={32}
          step={1}
          disabled={isGenerating}
        />
      </div>

      <Button
        type="submit"
        form="image-generation-form"
        className="w-full max-w-md transition-none disabled:opacity-100 disabled:saturate-100 disabled:brightness-100"
        variant={justQueued ? "success" : "retro"}
        size="retro-default"
        disabled={disabledReason !== null || isGenerating || actionablePromptsCount === 0}
      >
        {justQueued
          ? "Creating tasks!"
          : isGenerating
            ? "Submitting..."
            : `Generate ${imageCount} New ${imageCount === 1 ? 'Image' : 'Images'}`}
      </Button>

      {disabledReason && (
        <p role="note" className="w-full max-w-md text-center text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
};
