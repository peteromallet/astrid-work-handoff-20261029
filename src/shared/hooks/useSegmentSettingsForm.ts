/**
 * useSegmentSettingsForm - Combines useSegmentSettings with form-ready props
 *
 * This hook wraps useSegmentSettings and returns props that can be spread
 * directly onto SegmentSettingsForm, reducing duplication across the 3+
 * components that render segment settings forms.
 *
 * Usage:
 * ```tsx
 * const { formProps, getSettingsForTaskCreation } = useSegmentSettingsForm({
 *   pairShotGenerationId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 *
 * const handleSubmit = async () => {
 *   const settings = getSettingsForTaskCreation();
 *   const taskParams = buildTaskParams(settings, context);
 *   await createTask(taskParams);
 * };
 *
 * return <SegmentSettingsForm {...formProps} onSubmit={handleSubmit} />;
 * ```
 */

import { useMemo, useRef, useCallback, useState } from 'react';
import { useSegmentSettings, UseSegmentSettingsOptions } from './segments';
import type { SegmentSettingsFormProps } from '@/shared/components/SegmentSettingsForm/types';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import type { SelectedModel } from '@/tools/travel-between-images/modelCapabilities';

interface StructureVideoDefaultsValue {
  mode?: TravelGuidanceMode;
  motionStrength: number;
  treatment: 'adjust' | 'clip';
  uni3cEndPercent: number;
  cannyIntensity?: number;
  depthContrast?: number;
}

interface UseSegmentSettingsFormOptions extends UseSegmentSettingsOptions {
  // These are passed through to the form
  segmentIndex?: number;
  startImageUrl?: string;
  endImageUrl?: string;
  modelName?: string;
  resolution?: string;
  isRegeneration?: boolean;
  buttonLabel?: string;
  showHeader?: boolean;
  maxFrames?: number;
  // Structure video context
  structureVideoType?: TravelGuidanceMode | null;
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  structureVideoDefaultsByModel?: Partial<Record<SelectedModel, StructureVideoDefaultsValue>>;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (structure video can be removed) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;

  // Navigation to constituent images
  /** Generation ID for the start image (for variant picking) */
  startImageGenerationId?: string;
  /** Generation ID for the end image (for variant picking) */
  endImageGenerationId?: string;
  /** Shot generation ID for the start image (for navigation) */
  startImageShotGenerationId?: string;
  /** Shot generation ID for the end image (for navigation) */
  endImageShotGenerationId?: string;
  /** Callback to navigate to a constituent image by shot_generation.id */
  onNavigateToImage?: (shotGenerationId: string) => void;
}

interface UseSegmentSettingsFormReturn {
  /**
   * Props to spread onto SegmentSettingsForm.
   * Includes: settings, onChange, hasOverride, shotDefaults,
   * onRestoreDefaults, and display props.
   *
   * Does NOT include: onSubmit, isSubmitting, onFrameCountChange
   * (these are context-specific and must be provided by the parent)
   */
  formProps: Omit<SegmentSettingsFormProps, 'onSubmit' | 'isSubmitting' | 'onFrameCountChange'>;

  /**
   * Get effective settings for task creation (merged with shot defaults).
   * Call this when building task params.
   */
  getSettingsForTaskCreation: ReturnType<typeof useSegmentSettings>['getSettingsForTaskCreation'];

  /**
   * Update settings (for external triggers like loading variant params).
   */
  updateSettings: ReturnType<typeof useSegmentSettings>['updateSettings'];

  /**
   * Current settings (for reading values outside the form).
   */
  settings: ReturnType<typeof useSegmentSettings>['settings'];

  /**
   * Whether settings have been modified.
   */
  isDirty: boolean;

  /**
   * Whether the enhance prompt toggle is on. Use this for display. For submit
   * handlers, use enhancePromptRef.current to avoid stale closure issues.
   */
  effectiveEnhanceEnabled: boolean;

  /**
   * Ref for synchronous access to enhance prompt state in submit handlers.
   * Avoids stale closure when user toggles and immediately submits.
   */
  enhancePromptRef: React.MutableRefObject<boolean>;

  /**
   * Handle enhance prompt toggle. Updates the ref synchronously.
   */
  handleEnhancePromptChange: (enabled: boolean) => void;
}

interface SegmentSettingsFormPropsInput {
  settings: ReturnType<typeof useSegmentSettings>['settings'];
  updateSettings: ReturnType<typeof useSegmentSettings>['updateSettings'];
  hasOverride: ReturnType<typeof useSegmentSettings>['hasOverride'];
  shotDefaults: ReturnType<typeof useSegmentSettings>['shotDefaults'];
  isDirty: ReturnType<typeof useSegmentSettings>['isDirty'];
  resetSettings: ReturnType<typeof useSegmentSettings>['resetSettings'];
  effectiveEnhanceEnabled: boolean;
  handleEnhancePromptChange: (enabled: boolean) => void;
  options: UseSegmentSettingsFormOptions;
}

function useEnhancePromptToggle(): {
  effectiveEnhanceEnabled: boolean;
  enhancePromptRef: React.MutableRefObject<boolean>;
  handleEnhancePromptChange: (enabled: boolean) => void;
} {
  // Always start with enhance prompt disabled; the choice does not outlive the open form.
  const [localEnabled, setLocalEnabled] = useState(false);
  const enhancePromptRef = useRef(false);
  enhancePromptRef.current = localEnabled;

  const handleEnhancePromptChange = useCallback((enabled: boolean) => {
    enhancePromptRef.current = enabled;
    setLocalEnabled(enabled);
  }, []);

  return {
    effectiveEnhanceEnabled: localEnabled,
    enhancePromptRef,
    handleEnhancePromptChange,
  };
}

function useBuiltSegmentSettingsFormProps(input: SegmentSettingsFormPropsInput) {
  const {
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    resetSettings,
    effectiveEnhanceEnabled,
    handleEnhancePromptChange,
    options,
  } = input;

  const {
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration = false,
    buttonLabel,
    showHeader = false,
    maxFrames,
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,
    isTimelineMode,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    startImageGenerationId,
    endImageGenerationId,
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  } = options;

  return useMemo(() => ({
    settings,
    onChange: updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    onRestoreDefaults: resetSettings,
    enhancePromptEnabled: effectiveEnhanceEnabled,
    onEnhancePromptChange: handleEnhancePromptChange,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    maxFrames,
    structureVideoType,
    structureVideoDefaults: structureVideoDefaults ?? undefined,
    structureVideoUrl,
    structureVideoFrameRange,
    isTimelineMode,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    startImageGenerationId,
    endImageGenerationId,
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  }), [
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    resetSettings,
    effectiveEnhanceEnabled,
    handleEnhancePromptChange,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    maxFrames,
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,
    isTimelineMode,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    startImageGenerationId,
    endImageGenerationId,
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  ]);
}

export function useSegmentSettingsForm(
  options: UseSegmentSettingsFormOptions
): UseSegmentSettingsFormReturn {
  const {
    pairShotGenerationId,
    defaults,
    structureVideoDefaults,
    structureVideoDefaultsByModel,
  } = options;

  const {
    settings,
    updateSettings,
    resetSettings,
    getSettingsForTaskCreation,
    isDirty,
    hasOverride,
    shotDefaults,
  } = useSegmentSettings({
    pairShotGenerationId,
    defaults,
    structureVideoDefaults,
    structureVideoDefaultsByModel,
  });

  const {
    effectiveEnhanceEnabled,
    enhancePromptRef,
    handleEnhancePromptChange,
  } = useEnhancePromptToggle();

  const formProps = useBuiltSegmentSettingsFormProps({
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    resetSettings,
    effectiveEnhanceEnabled,
    handleEnhancePromptChange,
    options,
  });

  return {
    formProps,
    getSettingsForTaskCreation,
    updateSettings,
    settings,
    isDirty,
    // Enhance prompt consolidated API
    effectiveEnhanceEnabled,
    enhancePromptRef,
    handleEnhancePromptChange,
  };
}
