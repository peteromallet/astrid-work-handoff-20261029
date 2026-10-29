/**
 * EditPanelLayout Component
 *
 * Shared layout for edit panels (images and videos).
 * Provides consistent header, mode selector, scrollable content area, and variants section.
 */

import React, { useRef } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { VariantSelector } from '@/shared/components/VariantSelector';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { useCopyToClipboard } from '@/shared/hooks/clipboard/useCopyToClipboard';
import { PanelCloseButton, PanelHeaderMeta } from './PanelHeaderControls';

const NOOP = () => {};

interface EditPanelLayoutProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  /** Handler to close the lightbox */
  onClose: () => void;

  /** Handler to exit edit mode (switch to info view) */
  onExitEditMode: () => void;

  /** Whether to hide the Info/Edit toggle */
  hideInfoEditToggle?: boolean;

  /**
   * Simplified header mode for page views (edit-images, edit-video tools).
   * When true, shows only [ModeSelector | X button] in header.
   * When false (default), shows full header with id copy, variants link, pending badge, etc.
   */
  simplifiedHeader?: boolean;

  /** Mode selector content (the toggle buttons) */
  modeSelector: React.ReactNode;

  /** Main content below the mode selector */
  children: React.ReactNode;

  /** Task ID for copy functionality */
  taskId?: string | null;

  /** Variants props */
  variants?: GenerationVariant[];
  activeVariantId?: string | null;
  onVariantSelect?: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  isLoadingVariants?: boolean;

  pendingTaskCount?: number;
  unviewedVariantCount?: number;
  onMarkAllViewed?: () => void;

  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;

  /** Handler to delete a variant */
  onDeleteVariant?: (variantId: string) => Promise<void>;

}

export const EditPanelLayout: React.FC<EditPanelLayoutProps> = ({
  variant,
  onClose,
  onExitEditMode,
  hideInfoEditToggle = false,
  simplifiedHeader = false,
  modeSelector,
  children,
  taskId,
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
  pendingTaskCount = 0,
  unviewedVariantCount = 0,
  onMarkAllViewed = NOOP,
  onLoadVariantSettings,
  onDeleteVariant,
}) => {
  const isMobile = variant === 'mobile';
  const hasVariants = variants && variants.length >= 1 && onVariantSelect;
  const padding = isMobile ? 'p-3' : 'p-6';
  const spacing = isMobile ? 'space-y-2' : 'space-y-4';
  const { copied: idCopied, handleCopy: handleCopyId } = useCopyToClipboard(taskId ?? undefined);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Header - simplified or full based on prop */}
      {simplifiedHeader ? (
        /* Simplified header for page views: just [ModeSelector | X] */
        <div className={cn(
          "flex items-center justify-between border-b border-border bg-background flex-shrink-0",
          isMobile ? "px-3 py-2 gap-2" : "p-4 gap-3"
        )}>
          {/* Mode selector takes available space */}
          <div className="flex-1">
            {modeSelector}
          </div>

          {/* Close button */}
          <PanelCloseButton
            isMobile={isMobile}
            onClose={onClose}
            stopPropagation
            className="flex-shrink-0"
          />
        </div>
      ) : (
        /* Full header for MediaLightbox: ID copy, variants link, pending badge, Info/Edit toggle, close */
        <div className={cn(
          "flex items-center justify-between border-b border-border bg-background flex-shrink-0",
          isMobile ? "px-3 py-2 gap-2" : "p-4 gap-3"
        )}>
          <PanelHeaderMeta
            taskId={taskId}
            idCopied={idCopied}
            onCopyId={handleCopyId}
            hasVariants={Boolean(hasVariants)}
            variants={variants ?? []}
            pendingTaskCount={pendingTaskCount}
            unviewedVariantCount={unviewedVariantCount}
            onMarkAllViewed={onMarkAllViewed}
            variantsSectionRef={variantsSectionRef}
          />

          {/* Right side - toggles and close button */}
          <div className="flex items-center gap-3">
            {!hideInfoEditToggle && (
              <SegmentedControl
                value="edit"
                onValueChange={(value) => {
                  if (value === 'info') {
                    onExitEditMode();
                  }
                }}
              >
                <SegmentedControlItem value="info">Info</SegmentedControlItem>
                <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
              </SegmentedControl>
            )}
            <PanelCloseButton
              isMobile={isMobile}
              onClose={onClose}
              stopPropagation
            />
          </div>
        </div>
      )}

      {/* Scrollable content area */}
      {/* On a phone the floating lock/gallery toolbar covers the bottom of the panel: pb-24 lets the last line scroll clear of it. */}
      <div className={cn("flex-1 overflow-y-auto min-h-0 overscroll-none", isMobile && "pb-24")}>
        {/* Mode selector section - only shown when NOT using simplified header */}
        {!simplifiedHeader && (
          <div className={cn("border-b border-border", isMobile ? "p-2" : "px-6 py-3")}>
            {modeSelector}
          </div>
        )}

        {/* Main content */}
        <div className={cn(padding, spacing)}>
          {children}
        </div>

        {/* Variants section - inside scroll area */}
        {hasVariants && (
          <div
            ref={variantsSectionRef}
            className={cn("border-t border-border", isMobile ? "pt-2 mt-2 px-3 pb-2" : "pt-4 mt-4 p-4")}
          >
            <VariantSelector
              variants={variants}
              activeVariantId={activeVariantId || null}
              onVariantSelect={onVariantSelect}
              onMakePrimary={onMakePrimary}
              isLoading={isLoadingVariants}
              onLoadVariantSettings={onLoadVariantSettings}
              onDeleteVariant={onDeleteVariant}
            />
          </div>
        )}
      </div>
    </div>
  );
};
