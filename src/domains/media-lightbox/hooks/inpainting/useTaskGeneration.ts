/**
 * Handles task generation for inpainting and annotated edits.
 * Exports mask from Konva, uploads to storage, and creates tasks.
 */

import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { GenerationRow } from '@/domains/generation/types';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';
import type { BrushStroke, EditAdvancedSettings, QwenEditModel } from './types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { createInpaintingTaskWorkflow } from './createInpaintingTaskWorkflow';

/**
 * Task type configuration - captures the differences between inpaint and annotate modes
 */
type TaskType = 'inpaint' | 'annotate';

interface TaskTypeConfig {
  emptyStrokesError: string;
  overlayNotReadyError: string;
  taskCreationError: string;
}

const TASK_CONFIGS: Record<TaskType, TaskTypeConfig> = {
  inpaint: {
    emptyStrokesError: 'Please paint on the image first',
    overlayNotReadyError: 'Paint overlay not ready',
    taskCreationError: 'Failed to create inpaint task',
  },
  annotate: {
    emptyStrokesError: 'Please draw an annotation rectangle',
    overlayNotReadyError: 'Annotation overlay not ready',
    taskCreationError: 'Failed to create annotated edit task',
  },
};

interface UseTaskGenerationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  isVideo: boolean;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  // State
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  // Refs
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  // Callbacks
  handleExitInpaintMode: () => void;
  setIsGeneratingInpaint: (isGenerating: boolean) => void;
  setInpaintGenerateSuccess: (success: boolean) => void;
}

export function useTaskGeneration({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  isVideo,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  inpaintStrokes,
  annotationStrokes,
  inpaintPrompt,
  inpaintNumGenerations,
  strokeOverlayRef,
  handleExitInpaintMode,
  setIsGeneratingInpaint,
  setInpaintGenerateSuccess,
}: UseTaskGenerationProps) {
  // Get actual generation ID (may differ from media.id for shot_generations)
  const actualGenerationId = getGenerationId(media);
  const run = useTaskPlaceholder();

  /**
   * Unified task generation function
   * Handles both inpaint and annotate modes with mode-specific configuration
   */
  const handleGenerateTask = useCallback(async (taskType: TaskType) => {
    const config = TASK_CONFIGS[taskType];
    const strokes = taskType === 'inpaint' ? inpaintStrokes : annotationStrokes;

    // Validation
    if (!selectedProjectId || isVideo) {
      toast.error(`Cannot generate ${taskType === 'inpaint' ? 'inpaint' : 'annotated edit'}`);
      return;
    }

    if (strokes.length === 0) {
      toast.error(config.emptyStrokesError);
      return;
    }

    if (!inpaintPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!strokeOverlayRef.current) {
      toast.error(config.overlayNotReadyError);
      return;
    }

    const incomingTaskType = taskType === 'inpaint' ? 'image_inpaint' : 'annotated_image_edit';

    setIsGeneratingInpaint(true);
    try {
      await run({
        taskType: incomingTaskType,
        label: inpaintPrompt.trim() || 'Editing...',
        context: 'useTaskGeneration',
        toastTitle: config.taskCreationError,
        create: async () => {
          if (!actualGenerationId) {
            throw new Error('Missing generation id');
          }

          return createInpaintingTaskWorkflow({
            taskType,
            media,
            selectedProjectId,
            shotId,
            toolTypeOverride,
            loras,
            activeVariantId,
            activeVariantLocation,
            createAsGeneration,
            advancedSettings,
            qwenEditModel,
            inpaintPrompt,
            inpaintNumGenerations,
            actualGenerationId,
            strokeOverlay: strokeOverlayRef.current!,
          });
        },
        onSuccess: () => {
          // Show success state
          setInpaintGenerateSuccess(true);

          // Wait 1 second to show success, then exit
          setTimeout(() => {
            setInpaintGenerateSuccess(false);
            handleExitInpaintMode();
          }, 1000);
        },
      });
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [
    selectedProjectId, isVideo, inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations,
    media, handleExitInpaintMode, shotId, toolTypeOverride, loras,
    activeVariantLocation, activeVariantId, createAsGeneration, advancedSettings,
    qwenEditModel, strokeOverlayRef, actualGenerationId,
    setIsGeneratingInpaint, setInpaintGenerateSuccess, run
  ]);

  // Stable callbacks that preserve the original API
  const handleGenerateInpaint = useCallback(() => {
    return handleGenerateTask('inpaint');
  }, [handleGenerateTask]);

  const handleGenerateAnnotatedEdit = useCallback(() => {
    return handleGenerateTask('annotate');
  }, [handleGenerateTask]);

  return {
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
  };
}
