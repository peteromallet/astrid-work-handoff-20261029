import { useState, useCallback, useRef } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import { useEditVideoSettings } from '@/shared/settings/hooks/useEditVideoSettings';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import { useVideoEditingSelections } from './useVideoEditingSelections';

export type { UseVideoEditingProps, UseVideoEditingReturn } from './types';
import type { UseVideoEditingProps, UseVideoEditingReturn } from './types';

/**
 * Hook for managing video editing (portion regeneration) functionality.
 * Similar to useInpainting but for video portion selection and regeneration.
 */
export const useVideoEditing = ({
  media,
  selectedProjectId,
  videoDuration,
  videoUrl,
}: UseVideoEditingProps): UseVideoEditingReturn => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isVideoEditMode, setIsVideoEditMode] = useState(false);

  const editSettings = useEditVideoSettings(selectedProjectId);
  const loraManager = useLoraManager({
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Managed explicitly via editSettings.
  });

  const selectionsState = useVideoEditingSelections({
    mediaId: media?.id,
    videoDuration,
    defaultGapFrameCount: editSettings.settings.gapFrameCount,
    contextFrameCount: editSettings.settings.contextFrameCount,
  });

  const handleGenerate = useCallback(async () => {
    if (!selectionsState.validation.isValid) {
      toast.error('Please fix validation errors before generating');
      return;
    }
    if (!selectedProjectId || !videoUrl || !media) return;

    // This lightbox path has the same keeper/gap orchestration semantics as
    // useReplaceMode and has no lossless typed replacement. Reject before
    // placeholder state, payload construction, or Runtime submission.
    toast.error(unsupportedLegacyTaskError('edit_video_orchestrator').message);
  }, [selectionsState.validation.isValid, selectedProjectId, videoUrl, media]);

  const handleEnterVideoEditMode = useCallback(() => {
    setIsVideoEditMode(true);
  }, []);

  const handleExitVideoEditMode = useCallback(() => {
    setIsVideoEditMode(false);
  }, []);

  return {
    isVideoEditMode,
    setIsVideoEditMode,

    videoRef,

    selections: selectionsState.selections,
    activeSelectionId: selectionsState.activeSelectionId,
    handleUpdateSelection: selectionsState.handleUpdateSelection,
    handleAddSelection: selectionsState.handleAddSelection,
    handleRemoveSelection: selectionsState.handleRemoveSelection,
    setActiveSelectionId: selectionsState.setActiveSelectionId,
    handleUpdateSelectionSettings: selectionsState.handleUpdateSelectionSettings,

    isValid: selectionsState.validation.isValid,
    validationErrors: selectionsState.validation.errors,
    maxContextFrames: selectionsState.maxContextFrames,

    editSettings,

    loraManager,

    handleGenerate,
    isGenerating: false,
    generateSuccess: false,

    handleEnterVideoEditMode,
    handleExitVideoEditMode,
  };
};
