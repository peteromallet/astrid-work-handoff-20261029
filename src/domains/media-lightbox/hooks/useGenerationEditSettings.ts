import { useCallback, useRef } from 'react';
import { useAutoSaveSettings } from '@/shared/settings/hooks/useAutoSaveSettings';

// Import canonical types from single source of truth
import {
  type EditMode,
  type LoraMode,
  type QwenEditModel,
  type EditAdvancedSettings,
  type VideoEnhanceSettings,
  type GenerationEditSettings,
  type EditSettingsSetterMethods,
  type SyncedEditSettings,
  DEFAULT_EDIT_SETTINGS
} from '../model/editSettingsTypes';

// Re-export types for backwards compatibility
export type { EditMode, QwenEditModel, EditAdvancedSettings, VideoEnhanceSettings };
// Defaults are internal-only - import from editSettingsTypes directly if needed

/**
 * Result type for convertToHiresFixApiParams - includes num_inference_steps for single-pass mode.
 */
interface EditApiParams {
  num_inference_steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
}

type AutoSaveGenerationEditSettings = GenerationEditSettings & Record<string, unknown>;

/**
 * Converts EditAdvancedSettings to API params for task creation.
 * Returns hires params if two-pass is enabled, or just num_inference_steps if disabled.
 */
export function convertToHiresFixApiParams(settings: EditAdvancedSettings | undefined): EditApiParams | undefined {
  if (!settings) {
    return undefined;
  }

  if (!settings.enabled) {
    // Two-pass disabled: just return num_inference_steps for single-pass generation
    return {
      num_inference_steps: settings.num_inference_steps,
    };
  }

  // Two-pass enabled: return hires params (base_steps is used as num_inference_steps for phase 1)
  return {
    num_inference_steps: settings.base_steps,
    hires_scale: settings.hires_scale,
    hires_steps: settings.hires_steps,
    hires_denoise: settings.hires_denoise,
    lightning_lora_strength_phase_1: settings.lightning_lora_strength_phase_1,
    lightning_lora_strength_phase_2: settings.lightning_lora_strength_phase_2,
  };
}

interface UseGenerationEditSettingsReturn extends EditSettingsSetterMethods {
  // Current settings
  settings: GenerationEditSettings;

  // Bulk update
  updateSettings: (updates: Partial<GenerationEditSettings>) => void;
  flushTextFields: () => Promise<void>;

  // State
  isLoading: boolean;
  hasPersistedSettings: boolean;

  // For initialization from "last used"
  initializeFromLastUsed: (lastUsed: SyncedEditSettings & { editMode: EditMode }) => void;
}

interface UseGenerationEditSettingsProps {
  generationId: string | null;
  enabled?: boolean;
  bootstrapSettings?: (SyncedEditSettings & { editMode: EditMode }) | null;
}

/**
 * Hook for managing per-generation edit settings.
 *
 * Uses useAutoSaveSettings (custom entity mode without load or save), so each
 * generation keeps its edit settings in memory for the session, starting from
 * the bootstrap ("last used") values. Nothing is written to a backend.
 */
export function useGenerationEditSettings({
  generationId,
  enabled = true,
  bootstrapSettings = null,
}: UseGenerationEditSettingsProps): UseGenerationEditSettingsReturn {
  const bootstrapData = bootstrapSettings
    ? {
        ...DEFAULT_EDIT_SETTINGS,
        ...bootstrapSettings,
        prompt: '',
        img2imgPrompt: '',
        img2imgPromptHasBeenSet: false,
      }
    : null;

  // Use the base persistent state hook (customLoadSave mode)
  const {
    settings,
    status,
    hasPersistedData: hasPersistedSettings,
    updateField,
    updateFields,
    updateTextField,
    updateTextFields,
    save,
    initializeFrom,
  } = useAutoSaveSettings<AutoSaveGenerationEditSettings>({
    defaults: DEFAULT_EDIT_SETTINGS as AutoSaveGenerationEditSettings,
    debounceMs: 500,
    enabled,
    bootstrapData: bootstrapData as AutoSaveGenerationEditSettings | null,
    debugTag: '[useGenerationEditSettings]',
    customLoadSave: {
      entityId: generationId,
      domainKey: 'generation-edit-settings',
    },
  });
  const advancedSettingsRef = useRef(settings.advancedSettings);
  advancedSettingsRef.current = settings.advancedSettings;
  const enhanceSettingsRef = useRef(settings.enhanceSettings);
  enhanceSettingsRef.current = settings.enhanceSettings;

  // Individual setters that delegate to updateField
  const setEditMode = useCallback((mode: EditMode) => {
    updateField('editMode', mode);
  }, [updateField]);

  const setLoraMode = useCallback((mode: LoraMode) => {
    updateField('loraMode', mode);
  }, [updateField]);

  const setCustomLoraUrl = useCallback((url: string) => {
    updateTextField('customLoraUrl', url);
  }, [updateTextField]);

  const setNumGenerations = useCallback((num: number) => {
    updateField('numGenerations', num);
  }, [updateField]);

  const setPrompt = useCallback((prompt: string) => {
    updateTextField('prompt', prompt);
  }, [updateTextField]);

  const setQwenEditModel = useCallback((model: QwenEditModel) => {
    updateField('qwenEditModel', model);
  }, [updateField]);

  const setImg2imgPrompt = useCallback((prompt: string) => {
    updateTextFields({ img2imgPrompt: prompt, img2imgPromptHasBeenSet: true });
  }, [updateTextFields]);

  const setImg2imgStrength = useCallback((strength: number) => {
    updateField('img2imgStrength', strength);
  }, [updateField]);

  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    updateField('img2imgEnablePromptExpansion', enabled);
  }, [updateField]);

  // Advanced settings setter (merges with existing)
  const setAdvancedSettings = useCallback((updates: Partial<EditAdvancedSettings>) => {
    updateFields({
      advancedSettings: { ...advancedSettingsRef.current, ...updates },
    });
  }, [updateFields]);

  // Video enhance settings setter (merges with existing)
  const setEnhanceSettings = useCallback((updates: Partial<VideoEnhanceSettings>) => {
    updateFields({
      enhanceSettings: { ...enhanceSettingsRef.current, ...updates },
    });
  }, [updateFields]);

  const setCreateAsGeneration = useCallback((value: boolean) => {
    updateField('createAsGeneration', value);
  }, [updateField]);

  // Bulk update
  const updateSettings = useCallback((updates: Partial<GenerationEditSettings>) => {
    updateFields(updates);
  }, [updateFields]);

  const flushTextFields = useCallback(async () => {
    await save();
  }, [save]);

  // Initialize from "last used" - wraps initializeFrom with prompt exclusion
  const initializeFromLastUsed = useCallback((lastUsed: SyncedEditSettings & { editMode: EditMode }) => {
    // Apply last used but never inherit prompts
    initializeFrom({
      ...lastUsed,
      prompt: '',
      img2imgPrompt: '',
      img2imgPromptHasBeenSet: false,
    });
  }, [initializeFrom]);

  return {
    settings,
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    setQwenEditModel,
    setImg2imgPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    setAdvancedSettings,
    setEnhanceSettings,
    setCreateAsGeneration,
    updateSettings,
    flushTextFields,
    isLoading: status === 'loading' || status === 'idle',
    hasPersistedSettings,
    initializeFromLastUsed,
  };
}
