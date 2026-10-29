import { useCallback } from 'react';
import { coerceSelectedModel, getModelSpec, MODEL_DEFAULTS } from '@/tools/travel-between-images/settings';
import type { SelectedModel } from '@/tools/travel-between-images/settings';
import type { SegmentSettings, SegmentSettingsFormProps } from '../types';

/**
 * Handles model switching with proper cleanup of model-dependent settings.
 * Shared between PromptSection (model toggle) and AdvancedSettingsSection (model pills).
 */
export function useModelChange({
  onChange,
  settings,
  shotDefaults,
}: {
  onChange: (updates: Partial<SegmentSettings>) => void;
  settings: SegmentSettings;
  shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
}) {
  const effectiveSelectedModel = coerceSelectedModel(
    settings.selectedModel ?? shotDefaults?.selectedModel,
  );

  const handleModelChange = useCallback(
    (nextModel: SelectedModel) => {
      const currentSpec = getModelSpec(effectiveSelectedModel);
      const nextSpec = getModelSpec(nextModel);
      const nextDefaults = MODEL_DEFAULTS[nextModel];

      const updates: Partial<SegmentSettings> = {
        selectedModel: nextModel,
        inferenceSteps: nextDefaults.steps,
        guidanceScale: nextDefaults.guidanceScale,
      };

      // Clear LoRAs when switching between model families (incompatible weights)
      if (currentSpec.loraFamily !== nextSpec.loraFamily) {
        updates.loras = [];
      }

      // Clear phase config when switching to a model that doesn't support it
      if (currentSpec.supportsPhaseConfig && !nextSpec.supportsPhaseConfig) {
        updates.phaseConfig = undefined;
        updates.selectedPhasePresetId = null;
        updates.motionMode = 'basic';
      }

      onChange(updates);
    },
    [effectiveSelectedModel, onChange],
  );

  return handleModelChange;
}
