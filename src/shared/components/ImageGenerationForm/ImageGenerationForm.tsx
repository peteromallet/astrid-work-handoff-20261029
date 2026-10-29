import React, { Suspense } from "react";
import { createPortal } from "react-dom";
import type { BatchImageGenerationTaskParams } from "@/shared/types/imageGeneration";

import { PromptsSection } from "./components/PromptsSection";
import { ShotSelector } from "./components/ShotSelector";
import { ModelSection } from "./components/ModelSection";
import { GenerateControls } from "./components/GenerateControls";
import { GenerationSettingsSection } from "./components/GenerationSettingsSection";
import { ChunkLoadErrorBoundary } from "@/shared/runtime/ChunkLoadErrorBoundary";
import { ImageGenerationFormProvider } from "./ImageGenerationFormContext";
import { useImageGenForm } from "./hooks/useImageGenForm";

// Lazy load modals to improve initial bundle size and performance
const LazyPromptEditorModal = React.lazy(() =>
  import("../PromptEditorModal").then(module => ({
    default: module.PromptEditorModal
  }))
);

interface ImageGenerationFormProps {
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[] | void> | string[] | void;
  /**
   * Called when the associated shot selection changes in the form
   */
  onShotChange?: (shotId: string | null) => void;
  /**
   * When true, the generate controls will be rendered with sticky positioning
   * at the bottom of the scroll container (for modal contexts)
   */
  stickyFooter?: boolean;
  /**
   * When provided with stickyFooter, the footer will be portaled to this element
   * (by ID) so it renders outside the scroll container
   */
  footerPortalId?: string;
  /**
   * Pre-select a specific shot when the form mounts. This takes precedence over
   * persisted settings on initial render only.
   */
  initialShotId?: string | null;
}

export const ImageGenerationForm: React.FC<ImageGenerationFormProps> = ({
  onGenerate,
  onShotChange,
  stickyFooter = false,
  footerPortalId,
  initialShotId,
}) => {
  const form = useImageGenForm({ onGenerate, onShotChange, initialShotId });

  return (
    <ImageGenerationFormProvider value={form.contextValue}>
      <form id="image-generation-form" onSubmit={form.handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex gap-6 flex-col md:flex-row pb-4">
          {/* Left Column - Prompts and Shot Selector */}
          <div className="flex-1 space-y-6">
            <PromptsSection />

            <ShotSelector
              shots={form.shots}
              associatedShotId={form.associatedShotId}
              isGenerating={form.automatedSubmitButton.isSubmitting}
              onChangeShot={form.handleShotChange}
              onClearShot={() => {
                form.markAsInteracted();
                form.setAssociatedShotId(null);
              }}
              onJumpToShot={form.navigateToShot}
            />
          </div>

          {/* Right Column - Reference Image and Settings */}
          <ModelSection
            // Props not in context
            generationSource={form.generationSource}
            onGenerationSourceChange={form.handleGenerationSourceChange}
            selectedTextModel={form.selectedTextModel}
            onTextModelChange={form.handleTextModelChange}
            isLoadingReferenceData={form.isReferenceDataLoading}
            referenceCount={form.referenceCount}
          />
        </div>

        {/* Generation Settings (dimensions always, phase config for local only) */}
        <div className="md:col-span-2 mt-2">
          <GenerationSettingsSection
            hiresFixConfig={form.hiresFixConfig}
            onHiresFixConfigChange={form.setHiresFixConfig}
            projectResolution={form.projectResolution}
            projectAspectRatio={form.projectAspectRatio}
            disabled={form.automatedSubmitButton.isSubmitting}
            isLocalGeneration={form.isLocalGenerationEnabled}
          />
        </div>

        {/* Spacer to ensure content can scroll above sticky footer (only when not using portal) */}
        {stickyFooter && !footerPortalId && <div className="h-4" />}

        {/* Footer: portaled when footerPortalId provided, sticky when stickyFooter without portal, inline otherwise */}
        {(() => {
          const footerContent = (
            <div className={
              stickyFooter
                ? footerPortalId
                  ? "px-6 py-3 bg-background border-t border-zinc-700" // Portaled footer
                  : "sticky bottom-0 z-50 !mt-0 -mx-6 px-6 py-3 bg-background border-t border-zinc-700" // Sticky footer
                : "border-t border-border pt-6 mt-2" // Inline footer (tool page)
            }>
              <GenerateControls
                imagesPerPrompt={form.imagesPerPrompt}
                onChangeImagesPerPrompt={form.handleSliderChange(form.setImagesPerPrompt)}
                actionablePromptsCount={form.actionablePromptsCount}
                isGenerating={form.automatedSubmitButton.isSubmitting}
                justQueued={form.automatedSubmitButton.isSuccess}
              />
            </div>
          );

          // Portal footer outside scroll container when footerPortalId is provided
          if (stickyFooter && footerPortalId) {
            const portalTarget = document.getElementById(footerPortalId);
            return portalTarget ? createPortal(footerContent, portalTarget) : footerContent;
          }
          return footerContent;
        })()}
      </form>

      <ChunkLoadErrorBoundary>
        <Suspense fallback={<div className="sr-only">Loading...</div>}>
          <LazyPromptEditorModal
            isOpen={form.uiState.isPromptModalOpen}
            onClose={() => form.uiActions.closePromptModal()}
            prompts={form.prompts}
            onSave={form.handleSavePromptsFromModal}
            generatePromptId={form.generatePromptId}
          />
        </Suspense>
      </ChunkLoadErrorBoundary>
    </ImageGenerationFormProvider>
  );
};
