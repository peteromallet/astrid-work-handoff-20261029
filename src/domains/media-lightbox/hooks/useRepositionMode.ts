import { useCallback } from 'react';
import { useImageTransform } from './reposition/useImageTransform';
import { useCanvasTransform } from './reposition/useCanvasTransform';
import { useRepositionDrag } from './reposition/useRepositionDrag';
import { useRepositionTaskCreation } from './reposition/useRepositionTaskCreation';
import type {
  ImageTransform,
  UseRepositionModeProps,
  UseRepositionModeReturn,
} from './reposition/types';

// Re-export types for backward compatibility
export type { ImageTransform, UseRepositionModeProps, UseRepositionModeReturn };

/**
 * Hook for managing image reposition mode.
 * Orchestrates transform state, drag interaction, mask generation, and task creation.
 *
 * This is a composition of focused hooks:
 * - useImageTransform: Transform state with per-variant caching
 * - useCanvasTransform: CSS transform preview and canvas manipulation
 * - useRepositionDrag: Drag-to-move pointer event handling
 * - useRepositionTaskCreation: Inpaint task creation with mask generation
 */
export const useRepositionMode = ({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  imageDimensions,
  imageContainerRef,
  loras,
  inpaintPrompt,
  inpaintNumGenerations,
  createAsGeneration,
  advancedSettings,
  activeVariantLocation,
  activeVariantId,
  activeVariantParams,
  qwenEditModel,
}: UseRepositionModeProps): UseRepositionModeReturn => {
  // Transform state management with per-variant caching
  const transformHook = useImageTransform({
    activeVariantId,
    mediaId: media.id,
    activeVariantParams,
  });

  const {
    transform,
    hasTransformChanges,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
  } = transformHook;

  // Canvas transform for preview and actual transformation
  const { getTransformStyle, createTransformedCanvas } = useCanvasTransform({
    transform,
    imageDimensions,
    media,
    activeVariantLocation,
  });

  // Drag handler for transform updates
  const onTransformChange = useCallback((updates: Partial<ImageTransform>) => {
    if (updates.translateX !== undefined) setTranslateX(updates.translateX);
    if (updates.translateY !== undefined) setTranslateY(updates.translateY);
  }, [setTranslateX, setTranslateY]);

  // Drag-to-move functionality
  const { isDragging, dragHandlers } = useRepositionDrag({
    transform,
    imageDimensions,
    imageContainerRef,
    onTransformChange,
  });

  // Inpaint task creation
  const {
    isGeneratingReposition,
    repositionGenerateSuccess,
    handleGenerateReposition,
  } = useRepositionTaskCreation({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    imageDimensions,
    loras,
    inpaintPrompt,
    inpaintNumGenerations,
    transform,
    hasTransformChanges,
    createAsGeneration,
    advancedSettings,
    activeVariantId,
    qwenEditModel,
    createTransformedCanvas,
  });

  return {
    transform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    getTransformStyle,
    isDragging,
    dragHandlers,
  };
};
