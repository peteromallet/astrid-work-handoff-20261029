import { useMemo, useState } from 'react';
import {
  BUILTIN_I2V_PRESET,
  BUILTIN_VACE_PRESET,
  detectGenerationMode,
} from '../segmentSettingsUtils';
import type { SegmentSettings, SegmentSettingsFormProps } from '../types';

interface UseAdvancedSettingsStateParams {
  modelName?: string;
  settings: SegmentSettings;
  shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
}

export function useAdvancedSettingsState({
  modelName,
  settings,
  shotDefaults,
}: UseAdvancedSettingsStateParams) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generationMode = useMemo(
    () => detectGenerationMode(modelName),
    [modelName]
  );
  const builtinPreset = useMemo(
    () => (generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET),
    [generationMode]
  );
  const effectiveLoras = useMemo(
    () =>
      settings.loras !== undefined ? settings.loras : (shotDefaults?.loras ?? []),
    [settings.loras, shotDefaults?.loras]
  );

  const isUsingMotionModeDefault =
    settings.motionMode === undefined && !!shotDefaults?.motionMode;
  const isUsingPhaseConfigDefault =
    settings.phaseConfig === undefined && !!shotDefaults?.phaseConfig;
  const isUsingLorasDefault =
    settings.loras === undefined && (shotDefaults?.loras?.length ?? 0) > 0;

  return {
    showAdvanced,
    setShowAdvanced,
    builtinPreset,
    effectiveLoras,
    isUsingMotionDefaults: isUsingMotionModeDefault && isUsingPhaseConfigDefault,
    isUsingLorasDefault,
  };
}
