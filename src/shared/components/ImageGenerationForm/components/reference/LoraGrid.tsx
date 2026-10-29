import React from "react";
import { Label } from "@/shared/components/ui/primitives/label";
import { SliderWithValue } from "@/shared/components/ui/composed/slider-with-value";
import { Images, X } from "lucide-react";
import { HoverScrubVideo } from "@/shared/components/media/HoverScrubVideo";
import { getDisplayNameFromUrl } from "@/domains/lora/lib/loraUtils";
import { useFormCoreContext, useFormLorasContext } from "../../ImageGenerationFormContext";

export const LoraGrid: React.FC = () => {
  const { isGenerating } = useFormCoreContext();
  const {
    selectedLoras,
    handleRemoveLora: onRemoveLora,
    handleLoraStrengthChange: onUpdateLoraStrength,
  } = useFormLorasContext();

  if (selectedLoras.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <Label className="text-sm font-medium">
        LoRAs ({selectedLoras.length})
      </Label>

      <div className="grid grid-cols-2 gap-3">
        {selectedLoras.map((lora) => {
          const isVideo =
            lora.previewImageUrl &&
            lora.previewImageUrl.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

          return (
            <div
              key={lora.id}
              className="relative group rounded-lg border bg-muted/30 overflow-hidden"
            >
              <div className="aspect-video relative">
                {lora.previewImageUrl ? (
                  isVideo ? (
                    <HoverScrubVideo
                      src={lora.previewImageUrl}
                      className="w-full h-full object-cover"
                      videoClassName="object-cover"
                      autoplayOnHover
                      loop
                      muted
                    />
                  ) : (
                    <img
                      src={lora.previewImageUrl}
                      alt={lora.name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Images className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onRemoveLora(lora.id)}
                  disabled={isGenerating}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <div className="p-2 space-y-2">
                <p
                  className="text-xs font-medium truncate"
                  title={getDisplayNameFromUrl(lora.path, lora.name)}
                >
                  {getDisplayNameFromUrl(lora.path, lora.name)}
                </p>
                <SliderWithValue
                  label="Strength"
                  value={lora.strength}
                  onChange={(value) => onUpdateLoraStrength(lora.id, value)}
                  min={0}
                  max={2}
                  step={0.05}
                  disabled={isGenerating}
                  hideLabel
                  numberInputClassName="w-14"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
