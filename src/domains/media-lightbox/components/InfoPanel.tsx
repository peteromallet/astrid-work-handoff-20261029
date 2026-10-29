/**
 * InfoPanel Component
 *
 * Unified info panel for both desktop and mobile layouts.
 * Shows task details and variants.
 *
 * Uses context hooks for viewer state and variants.
 * Receives only layout-specific and deeply-nested props.
 */

import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';

import { TaskDetailsPanelWrapper } from './TaskDetailsPanelWrapper';
import { VariantSelector } from '@/shared/components/VariantSelector';
import { PanelCloseButton, PanelHeaderMeta } from './PanelHeaderControls';
import {
  useLightboxCoreSafe,
  useLightboxVariantsSafe,
} from '../contexts/LightboxStateContext';
import type { TaskDetailsData } from '../types';
import { useCopyToClipboard } from '@/shared/hooks/clipboard/useCopyToClipboard';

interface InfoPanelTaskPanelModel {
  taskDetailsData: TaskDetailsData | undefined;
}

interface InfoPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  // TaskDetailsPanelWrapper model (deeply nested data)
  taskPanel: InfoPanelTaskPanelModel;

  /** Task ID for copy functionality (fallback when not in taskDetailsData) */
  taskId?: string | null;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  variant,
  // TaskDetails model
  taskPanel,
  // Task ID fallback
  taskId: taskIdProp,
}) => {
  const {
    taskDetailsData,
  } = taskPanel;
  const isMobile = variant === 'mobile';

  // ========================================
  // CONTEXT STATE
  // ========================================
  const { onClose, readOnly } = useLightboxCoreSafe();
  const {
    variants,
    activeVariant,
    handleVariantSelect: onVariantSelect,
    handleMakePrimary: onMakePrimary,
    isLoadingVariants,
    variantsSectionRef,
    pendingTaskCount,
    unviewedVariantCount,
    onMarkAllViewed,
    handleDeleteVariant: onDeleteVariant,
  } = useLightboxVariantsSafe();

  const hasVariants = variants && variants.length >= 1;

  // Get task ID for copy functionality - use prop as fallback for videos
  const taskId = taskDetailsData?.taskId || taskIdProp;
  const { copied: idCopied, handleCopy: handleCopyId } = useCopyToClipboard(taskId ?? undefined);

  // Render the header - consistent single row layout for both mobile and desktop
  const renderHeader = () => (
    <div className={cn(
      "flex-shrink-0 border-b border-border bg-background",
      isMobile ? "sticky top-0 z-[80] px-3 py-2" : "p-4"
    )}>
      {/* Single row: ID + variants on left, close on right */}
      <div className={cn(
        "flex items-center justify-between",
        isMobile ? "gap-2" : "gap-3"
      )}>
        <PanelHeaderMeta
          taskId={taskId}
          idCopied={idCopied}
          onCopyId={handleCopyId}
          hasVariants={hasVariants}
          variants={variants}
          pendingTaskCount={pendingTaskCount}
          unviewedVariantCount={unviewedVariantCount}
          onMarkAllViewed={onMarkAllViewed}
          variantsSectionRef={variantsSectionRef}
        />

        {/* Right side - close button */}
        <div className="flex items-center gap-3">
          <PanelCloseButton
            isMobile={isMobile}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );

  // Render task details wrapper
  const renderTaskDetails = () => (
    <TaskDetailsPanelWrapper
      taskDetailsData={taskDetailsData}
    />
  );

  // Render variants section - matches EditPanelLayout styling
  const renderVariants = () => {
    if (!hasVariants) return null;

    // Match EditPanelLayout: border-t, consistent padding
    const variantPadding = isMobile ? 'pt-2 mt-2 px-3 pb-2' : 'pt-4 mt-4 p-6';

    return (
      <div
        ref={variantsSectionRef}
        className={cn("border-t border-border", variantPadding)}
      >
        <VariantSelector
          variants={variants}
          activeVariantId={activeVariant?.id || null}
          onVariantSelect={onVariantSelect}
          onMakePrimary={onMakePrimary}
          isLoading={isLoadingVariants}
          onDeleteVariant={onDeleteVariant}
          readOnly={readOnly}
        />
      </div>
    );
  };

  // Both desktop and mobile: variants inside scroll area (matches EditPanelLayout)
  return (
    <div className={cn("w-full flex flex-col", !isMobile && "h-full")}>
      {renderHeader()}

      {/* Scrollable content area - contains both task details and variants */}
      <div className="flex-1 overflow-y-auto min-h-0 overscroll-none">
        {renderTaskDetails()}
        {renderVariants()}
      </div>
    </div>
  );
};
