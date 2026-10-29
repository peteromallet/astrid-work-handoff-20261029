/**
 * useSegmentSettings - Local editing state for segment settings
 *
 * Manages segment settings for video regeneration with:
 * - Local editing (nothing is persisted; edits live for the open form)
 * - Settings merging (segment edits > shot defaults)
 * - Override tracking
 *
 * @example
 * ```tsx
 * const { settings, updateSettings, isDirty } = useSegmentSettings({
 *   pairShotGenerationId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 * ```
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { SegmentSettings } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import type {
  SegmentOverrideFlags,
  SegmentShotDefaults,
} from '@/shared/components/SegmentSettingsForm/types';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import type { SelectedModel } from '@/tools/travel-between-images/settings';

// =============================================================================
// TYPES
// =============================================================================

/** Form state keeps the structured SegmentSettings contract while satisfying
 * the object-state boundary of the local edit state. */
type SegmentFormSettings = SegmentSettings & Record<string, unknown>;

export interface UseSegmentSettingsOptions {
  /** Shot generation ID for the pair; switching it discards local edits */
  pairShotGenerationId?: string | null;
  /** Default values (hardcoded fallbacks) */
  defaults: {
    prompt: string;
    negativePrompt: string;
    /** Frame count from timeline positions (source of truth) */
    numFrames?: number;
    /** Whether new generations should become primary variant */
    makePrimaryVariant?: boolean;
  };
  /** Structure video defaults for this segment */
  structureVideoDefaults?: {
    mode?: TravelGuidanceMode;
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
    cannyIntensity?: number;
    depthContrast?: number;
  } | null;
  structureVideoDefaultsByModel?: Partial<Record<SelectedModel, NonNullable<UseSegmentSettingsOptions['structureVideoDefaults']>>>;
}

/** Tracks which fields have pair-level overrides */
type FieldOverrides = SegmentOverrideFlags;

/** Shot-level default values (for showing as placeholder) */
type ShotDefaults = SegmentShotDefaults;

interface UseSegmentSettingsReturn {
  /** Current settings (defaults + user edits) */
  settings: SegmentSettings;
  /** Update settings (local state only) */
  updateSettings: (updates: Partial<SegmentSettings>) => void;
  /** Reset to defaults (discards local edits) */
  resetSettings: () => void;
  /** Get effective settings for task creation (settings merged with shot defaults) */
  getSettingsForTaskCreation: () => SegmentSettings;
  /** Whether user has made local edits */
  isDirty: boolean;
  /** Which fields the user has overridden locally */
  hasOverride: FieldOverrides;
  /** Shot-level default values (for showing as placeholder) */
  shotDefaults: ShotDefaults;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const DEFAULT_SELECTED_MODEL: SelectedModel = 'wan-2.2';

/**
 * Detect which fields the user has overridden in the open form.
 */
function detectOverrides(
  localData: Partial<SegmentSettings> | null,
  editedFields: ReadonlySet<string>,
): FieldOverrides {
  const hasFieldOverride = (field: keyof SegmentSettings): boolean =>
    localData !== null && editedFields.has(field) && localData[field] !== undefined;

  return {
    prompt: hasFieldOverride('prompt'),
    negativePrompt: hasFieldOverride('negativePrompt'),
    textBeforePrompts: hasFieldOverride('textBeforePrompts'),
    textAfterPrompts: hasFieldOverride('textAfterPrompts'),
    motionMode: hasFieldOverride('motionMode'),
    amountOfMotion: hasFieldOverride('amountOfMotion'),
    phaseConfig: hasFieldOverride('phaseConfig'),
    loras: hasFieldOverride('loras'),
    selectedPhasePresetId: hasFieldOverride('selectedPhasePresetId'),
    selectedModel: hasFieldOverride('selectedModel'),
    guidanceScale: hasFieldOverride('guidanceScale'),
    inferenceSteps: hasFieldOverride('inferenceSteps'),
    guidanceMode: hasFieldOverride('guidanceMode'),
    guidanceStrength: hasFieldOverride('guidanceStrength'),
    guidanceTreatment: hasFieldOverride('guidanceTreatment'),
    guidanceUni3cEndPercent: hasFieldOverride('guidanceUni3cEndPercent'),
    guidanceCannyIntensity: hasFieldOverride('guidanceCannyIntensity'),
    guidanceDepthContrast: hasFieldOverride('guidanceDepthContrast'),
    smoothContinuations: hasFieldOverride('smoothContinuations'),
  };
}

/**
 * Build the form's starting settings from the caller's defaults.
 */
function buildInitialSettings(
  defaults: UseSegmentSettingsOptions['defaults']
): SegmentFormSettings {
  return {
    prompt: defaults.prompt,
    negativePrompt: defaults.negativePrompt,
    textBeforePrompts: undefined,
    textAfterPrompts: undefined,
    motionMode: 'basic',
    amountOfMotion: 50,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: defaults.numFrames ?? 25,
    randomSeed: true,
    seed: undefined,
    makePrimaryVariant: defaults.makePrimaryVariant ?? true,
    selectedModel: undefined,
    guidanceScale: undefined,
    inferenceSteps: undefined,
    guidanceMode: undefined,
    guidanceStrength: undefined,
    guidanceTreatment: undefined,
    guidanceUni3cEndPercent: undefined,
    guidanceCannyIntensity: undefined,
    guidanceDepthContrast: undefined,
    smoothContinuations: undefined,
  };
}

/**
 * Build shot defaults object for display.
 */
function buildShotDefaults(
  structureVideoDefaults?: UseSegmentSettingsOptions['structureVideoDefaults'],
): ShotDefaults {
  return {
    prompt: '',
    negativePrompt: '',
    motionMode: 'basic',
    amountOfMotion: 50,
    phaseConfig: undefined,
    loras: [],
    selectedPhasePresetId: null,
    textBeforePrompts: '',
    textAfterPrompts: '',
    selectedModel: DEFAULT_SELECTED_MODEL,
    guidanceScale: undefined,
    inferenceSteps: undefined, // No shot-level default for inference steps
    guidanceMode: structureVideoDefaults?.mode,
    guidanceStrength: structureVideoDefaults?.motionStrength,
    guidanceTreatment: structureVideoDefaults?.treatment,
    guidanceUni3cEndPercent: structureVideoDefaults?.uni3cEndPercent,
    guidanceCannyIntensity: structureVideoDefaults?.cannyIntensity,
    guidanceDepthContrast: structureVideoDefaults?.depthContrast,
    smoothContinuations: false,
    generationTypeMode: 'i2v',
  };
}

/**
 * Enforce: basic mode without a preset = no phase config.
 * When a preset IS selected, its phaseConfig must be preserved.
 */
function validateUpdates(
  updates: Partial<SegmentFormSettings>,
  current: SegmentFormSettings,
): Partial<SegmentFormSettings> {
  if (updates.motionMode === 'basic') {
    const hasPreset = updates.selectedPhasePresetId ?? current.selectedPhasePresetId;
    if (!hasPreset) {
      return { ...updates, phaseConfig: undefined };
    }
  }
  return updates;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useSegmentSettings({
  pairShotGenerationId,
  defaults,
  structureVideoDefaults,
  structureVideoDefaultsByModel,
}: UseSegmentSettingsOptions): UseSegmentSettingsReturn {
  // 1. Local edits. The first edit snapshots the current settings; until then
  // the settings follow the caller's defaults.
  const [localData, setLocalData] = useState<SegmentFormSettings | null>(null);
  const [editedFields, setEditedFields] = useState<ReadonlySet<string>>(() => new Set());
  const contextKey = pairShotGenerationId || undefined;
  const previousContextKeyRef = useRef(contextKey);

  useEffect(() => {
    if (contextKey !== previousContextKeyRef.current) {
      previousContextKeyRef.current = contextKey;
      setLocalData(null);
      setEditedFields(new Set());
    }
  }, [contextKey]);

  const initialSettings = useMemo(() => buildInitialSettings(defaults), [defaults]);
  const settings = localData ?? initialSettings;

  const updateSettings = useCallback((updates: Partial<SegmentSettings>) => {
    setEditedFields((previous) => new Set([...previous, ...Object.keys(updates)]));
    setLocalData((previous) => {
      const current = previous ?? initialSettings;
      return { ...current, ...validateUpdates({ ...updates }, current) };
    });
  }, [initialSettings]);

  const resetSettings = useCallback(() => {
    setLocalData(null);
    setEditedFields(new Set());
  }, []);

  const effectiveModel = localData?.selectedModel ?? DEFAULT_SELECTED_MODEL;
  const effectiveStructureVideoDefaults = useMemo(
    () => structureVideoDefaultsByModel?.[effectiveModel] ?? structureVideoDefaults,
    [effectiveModel, structureVideoDefaults, structureVideoDefaultsByModel],
  );

  // 2. Shot defaults for placeholders
  const shotDefaults = useMemo(
    () => buildShotDefaults(effectiveStructureVideoDefaults),
    [effectiveStructureVideoDefaults]
  );

  // 3. Overrides (the fields the user has edited)
  const hasOverride = useMemo(() => detectOverrides(localData, editedFields), [localData, editedFields]);

  // 4. Get effective settings for task creation (merges with shot defaults)
  const getSettingsForTaskCreation = useCallback((): SegmentSettings => {
    return {
      prompt: settings.prompt ?? shotDefaults.prompt,
      negativePrompt: settings.negativePrompt ?? shotDefaults.negativePrompt,
      textBeforePrompts: settings.textBeforePrompts ?? shotDefaults.textBeforePrompts,
      textAfterPrompts: settings.textAfterPrompts ?? shotDefaults.textAfterPrompts,
      motionMode: settings.motionMode ?? shotDefaults.motionMode,
      amountOfMotion: settings.amountOfMotion ?? shotDefaults.amountOfMotion,
      phaseConfig: settings.phaseConfig ?? shotDefaults.phaseConfig,
      selectedPhasePresetId: settings.selectedPhasePresetId ?? shotDefaults.selectedPhasePresetId,
      loras: settings.loras ?? shotDefaults.loras,
      numFrames: settings.numFrames,
      randomSeed: settings.randomSeed,
      seed: settings.seed,
      makePrimaryVariant: settings.makePrimaryVariant,
      selectedModel: settings.selectedModel ?? shotDefaults.selectedModel,
      guidanceScale: settings.guidanceScale ?? shotDefaults.guidanceScale,
      inferenceSteps: settings.inferenceSteps ?? shotDefaults.inferenceSteps,
      guidanceMode: settings.guidanceMode ?? shotDefaults.guidanceMode,
      guidanceStrength: settings.guidanceStrength ?? shotDefaults.guidanceStrength,
      guidanceTreatment: settings.guidanceTreatment ?? shotDefaults.guidanceTreatment,
      guidanceUni3cEndPercent: settings.guidanceUni3cEndPercent ?? shotDefaults.guidanceUni3cEndPercent,
      guidanceCannyIntensity: settings.guidanceCannyIntensity ?? shotDefaults.guidanceCannyIntensity,
      guidanceDepthContrast: settings.guidanceDepthContrast ?? shotDefaults.guidanceDepthContrast,
      smoothContinuations: settings.smoothContinuations ?? shotDefaults.smoothContinuations,
    };
  }, [settings, shotDefaults]);

  return {
    settings,
    updateSettings,
    resetSettings,
    isDirty: localData !== null,
    hasOverride,
    shotDefaults,
    getSettingsForTaskCreation,
  };
}
