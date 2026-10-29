/**
 * useLoraHandlers - Wraps loraManager with persistence to project settings
 *
 * Handles:
 * - Removing/updating LORAs
 * - Persisting LORA selections to per-category project storage
 * - Marking form as interacted for save tracking
 */

import { useCallback } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { SettingsScope } from '@/shared/hooks/settings/useToolSettings';
import {
  GenerationSource,
  TextToImageModel,
  LoraCategory,
  getLoraCategoryForModel,
  ProjectImageSettings,
} from '../types';

// ============================================================================
// Types
// ============================================================================

interface UseLoraHandlersProps {
  // LORA manager from useLoraManager
  loraManager: {
    selectedLoras: ActiveLora[];
    handleRemoveLora: (id: string) => void;
    handleLoraStrengthChange: (id: string, strength: number) => void;
    handleLoadProjectLoras?: () => Promise<void>;
  };

  // Form interaction tracking
  markAsInteracted: () => void;

  // Model/source for category determination
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;

  // Project settings for persistence
  projectImageSettings: ProjectImageSettings | null;
  updateProjectImageSettings: ((scope: SettingsScope, updates: Partial<ProjectImageSettings>) => Promise<void>) | null;
}

interface UseLoraHandlersReturn {
  handleRemoveLora: (id: string) => void;
  handleLoraStrengthChange: (id: string, strength: number) => void;
  handleLoadProjectLoras: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useLoraHandlers(props: UseLoraHandlersProps): UseLoraHandlersReturn {
  const {
    loraManager,
    markAsInteracted,
    generationSource,
    selectedTextModel,
    projectImageSettings,
    updateProjectImageSettings,
  } = props;

  // ============================================================================
  // Persistence Helper
  // ============================================================================

  // Persist LORAs to per-category storage
  // Categories: 'qwen' (all Qwen models + by-reference) and 'z-image'
  const persistLorasToCategory = useCallback(async (loras: ActiveLora[]) => {
    if (!updateProjectImageSettings) return;

    // Determine current category based on generation source and model
    const category: LoraCategory = generationSource === 'by-reference'
      ? 'qwen'
      : getLoraCategoryForModel(selectedTextModel);

    const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
      'qwen': [],
      'z-image': [],
    };
    const updatedLorasByCategory = {
      ...currentLorasByCategory,
      [category]: loras,
    };

    try {
      await updateProjectImageSettings('project', { selectedLorasByCategory: updatedLorasByCategory });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useLoraHandlers.persistLorasToCategory', showToast: false });
    }
  }, [updateProjectImageSettings, projectImageSettings?.selectedLorasByCategory, selectedTextModel, generationSource]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRemoveLora = useCallback((loraIdToRemove: string) => {
    markAsInteracted();
    loraManager.handleRemoveLora(loraIdToRemove);

    // Persist to per-category storage after removing
    persistLorasToCategory(loraManager.selectedLoras.filter(l => l.id !== loraIdToRemove));
  }, [markAsInteracted, loraManager, persistLorasToCategory]);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    markAsInteracted();
    loraManager.handleLoraStrengthChange(loraId, newStrength);

    // Persist to per-category storage after updating strength
    persistLorasToCategory(loraManager.selectedLoras.map(l =>
      l.id === loraId ? { ...l, strength: newStrength } : l
    ));
  }, [markAsInteracted, loraManager, persistLorasToCategory]);

  const handleLoadProjectLoras = useCallback(async () => {
    await loraManager.handleLoadProjectLoras?.();
    markAsInteracted();
  }, [loraManager, markAsInteracted]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    handleRemoveLora,
    handleLoraStrengthChange,
    handleLoadProjectLoras,
  };
}
