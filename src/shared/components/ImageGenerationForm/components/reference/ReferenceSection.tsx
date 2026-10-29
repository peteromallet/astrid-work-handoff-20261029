import React from "react";
import { ReferenceGrid } from "./ReferenceGrid";
import { ReferencePreview } from "./ReferencePreview";
import { ReferenceModeControls } from "./ReferenceModeControls";
import { LoraGrid } from "./LoraGrid";
import { useFormReferencesContext } from "../../ImageGenerationFormContext";

interface ReferenceSectionProps {
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
}

export const ReferenceSection: React.FC<ReferenceSectionProps> = ({
  isLoadingReferenceData = false,
  referenceCount = 0,
}) => {
  const {
    references,
    styleReferenceImageDisplay: styleReferenceImage,
  } = useFormReferencesContext();

  const hasReferences = referenceCount > 0 || references.length > 0;
  const hasSelectedReference = !!styleReferenceImage;

  return (
    <div className="space-y-4">
      {hasReferences && (
        <>
          {/* Mode selector and strength controls */}
          <ReferenceModeControls
            hasSelectedReference={hasSelectedReference}
          />

          {/* Grid + Preview layout */}
          <div className="flex gap-4 flex-col md:flex-row">
            {/* Left: Thumbnail grid */}
            <div className="flex-[2]">
              <ReferenceGrid
                isLoadingReferenceData={isLoadingReferenceData}
                referenceCount={referenceCount}
              />
            </div>

            {/* Right: Large preview (desktop only) */}
            <div className="flex-1 hidden md:block">
              <ReferencePreview
                isLoadingReferenceData={isLoadingReferenceData}
              />
            </div>
          </div>
        </>
      )}

      <LoraGrid />
    </div>
  );
};
