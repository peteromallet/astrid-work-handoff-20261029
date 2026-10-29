import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { EditAdvancedSettings, QwenEditModel } from './useGenerationEditSettings';
import { DEFAULT_ADVANCED_SETTINGS } from '../model/editSettingsTypes';
import { isKleinModel } from '../model/editSettingsTypes';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { BrushStroke } from './inpainting/types';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { createBoundedImageEditTask } from '@/shared/lib/tasks/imageEditing/imageInpaint';

interface UseMagicEditModeParams {
  media: GenerationRow;
  selectedProjectId: string | null;
  isInpaintMode: boolean;
  setIsInpaintMode: (value: boolean) => void;
  handleEnterInpaintMode: () => void;
  handleGenerateInpaint: () => Promise<void>;
  brushStrokes: BrushStroke[];
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  editModeLoras: Array<{ url: string; strength: number }> | undefined;
  sourceUrlForTasks: string;
  imageDimensions: { width: number; height: number } | null;
  toolTypeOverride?: string;
  // Variant tracking - when editing from a non-primary variant
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Model selection for cloud mode
  qwenEditModel?: QwenEditModel;
  /** Start with isMagicEditMode=true (skips the "select an option" step) */
  initialActive?: boolean;
}

interface UseMagicEditModeReturn {
  isMagicEditMode: boolean;
  setIsMagicEditMode: (value: boolean) => void;
  magicEditPrompt: string;
  setMagicEditPrompt: (value: string) => void;
  magicEditNumImages: number;
  setMagicEditNumImages: (value: number) => void;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
  toolPanelPosition: 'top' | 'bottom';
  setToolPanelPosition: (value: 'top' | 'bottom') => void;
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;
  handleUnifiedGenerate: () => Promise<void>;
  isSpecialEditMode: boolean;
}

/**
 * Hook to manage Magic Edit mode state and unified generate handler
 * Handles auto-enter, prompt persistence, and routing between inpaint/magic edit
 */
export const useMagicEditMode = ({
  media,
  selectedProjectId,
  isInpaintMode,
  setIsInpaintMode,
  handleEnterInpaintMode,
  handleGenerateInpaint,
  brushStrokes,
  inpaintPrompt,
  inpaintNumGenerations,
  editModeLoras,
  sourceUrlForTasks,
  imageDimensions,
  toolTypeOverride,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  initialActive = false,
}: UseMagicEditModeParams): UseMagicEditModeReturn => {
  // Magic Edit mode state
  const [isMagicEditMode, setIsMagicEditMode] = useState(initialActive);
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [isCreatingMagicEditTasks, setIsCreatingMagicEditTasks] = useState(false);
  const [magicEditTasksCreated, setMagicEditTasksCreated] = useState(false);
  const [toolPanelPosition, setToolPanelPosition] = useState<'top' | 'bottom'>('bottom');

  const run = useTaskPlaceholder();

  // Guard against double-entry during async state updates
  const isEnteringEditModeRef = useRef(false);

  // Reset flags when media changes
  useEffect(() => {
    isEnteringEditModeRef.current = false;
  }, [media.id]);

  const handleEnterMagicEditMode = useCallback(() => {
    // Prevent double-entry while state is updating
    if (isEnteringEditModeRef.current) {
      return;
    }
    isEnteringEditModeRef.current = true;

    setIsMagicEditMode(true);
    handleEnterInpaintMode();
  }, [handleEnterInpaintMode]);

  const handleExitMagicEditMode = useCallback(() => {
    setIsMagicEditMode(false);
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  // Unified edit mode - merging inpaint and magic edit
  const isSpecialEditMode = isInpaintMode || isMagicEditMode;

  // Unified generate handler - routes based on brush strokes
  const handleUnifiedGenerate = useCallback(async () => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }
    
    const prompt = inpaintPrompt.trim();
    if (!prompt) {
      toast.error('Please enter a prompt');
      return;
    }
    
    // Route based on whether there are brush strokes. Klein has a verified
    // source-only edit endpoint, so brush strokes still use the mask profile
    // only for Qwen; Klein continues through the typed prompt-edit profile.
    const useKleinPath = qwenEditModel && isKleinModel(qwenEditModel);
    if (brushStrokes.length > 0 && !useKleinPath) {
      // Has brush strokes -> inpaint (Qwen models only)
      await handleGenerateInpaint();
    } else {
      const unsupportedReasons = [
        editModeLoras?.length ? 'LoRA controls' : null,
        advancedSettings && Object.keys(DEFAULT_ADVANCED_SETTINGS).some(
          (key) => advancedSettings[key as keyof EditAdvancedSettings] !== DEFAULT_ADVANCED_SETTINGS[key as keyof EditAdvancedSettings],
        ) ? 'advanced settings' : null,
        createAsGeneration ? 'create-as-generation routing' : null,
        toolTypeOverride && toolTypeOverride !== 'edit-images' ? 'unsupported tool routing' : null,
        imageDimensions && (imageDimensions.width !== 1024 || imageDimensions.height !== 1024)
          ? 'non-1024x1024 output dimensions'
          : null,
      ].filter((reason): reason is string => reason !== null);
      if (unsupportedReasons.length > 0) {
        toast.error(
          `Astrid bounded edit does not support ${unsupportedReasons.join(', ')}; adjust the selection before submitting`,
        );
        return;
      }

      // No brush strokes -> typed source edit (Qwen or Klein).
      setIsCreatingMagicEditTasks(true);
      setMagicEditTasksCreated(false);

      try {
        const useKlein = qwenEditModel && isKleinModel(qwenEditModel);
        await run({
          taskType: useKlein ? 'flux_klein_edit' : 'qwen_image_edit',
          label: prompt || 'Magic edit...',
          context: 'useMagicEditMode',
          toastTitle: 'Failed to create magic edit tasks',
          create: () => {
            // Use active variant's location if viewing a non-primary variant
            const effectiveImageUrl = activeVariantLocation || sourceUrlForTasks;

            // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
            // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
            const actualGenerationId = getGenerationId(media);

            return createBoundedImageEditTask(selectedProjectId, {
              sourceUrl: effectiveImageUrl,
              prompt,
              count: inpaintNumGenerations,
              qwenEditModel: qwenEditModel || '',
              basedOn: actualGenerationId ?? undefined,
              sourceVariantId: activeVariantId,
            });
          },
          onSuccess: async () => {
            setMagicEditTasksCreated(true);
            setTimeout(() => setMagicEditTasksCreated(false), 1500);
          },
        });
      } finally {
        setIsCreatingMagicEditTasks(false);
      }
    }
  }, [
    selectedProjectId,
    inpaintPrompt,
    brushStrokes.length,
    handleGenerateInpaint,
    sourceUrlForTasks,
    editModeLoras,
    imageDimensions,
    toolTypeOverride,
    createAsGeneration,
    advancedSettings,
    inpaintNumGenerations,
    media,
    qwenEditModel,
    activeVariantId,
    activeVariantLocation,
    run,
  ]);

  return {
    isMagicEditMode,
    setIsMagicEditMode,
    magicEditPrompt,
    setMagicEditPrompt,
    magicEditNumImages,
    setMagicEditNumImages,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    toolPanelPosition,
    setToolPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode
  };
};
