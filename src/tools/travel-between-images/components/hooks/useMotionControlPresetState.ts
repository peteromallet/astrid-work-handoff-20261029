import { useCallback, useMemo } from 'react';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import type { PhaseConfig } from '../../settings';
import { usePresetAutoSelect } from '../../hooks/settings/usePresetAutoSelect';
import {
  BUILTIN_DEFAULT_I2V_ID,
  BUILTIN_DEFAULT_VACE_ID,
  BUILTIN_I2V_PRESET,
  BUILTIN_VACE_PRESET,
} from '../MotionControl.constants';
import type {
  GenerationTypeMode,
  MotionPresetOption,
  PhasePresetSelection,
} from '../MotionControl.types';

interface UseMotionControlPresetStateParams {
  generationTypeMode: GenerationTypeMode;
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  motionMode: 'basic' | 'advanced';
  settingsLoading?: boolean;
  autoSelectDefaultPreset?: boolean;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
}

function resolvePresetConfig(preset: PhasePresetSelection): PhaseConfig | null {
  const metadata = preset.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const phaseConfig = metadata.phaseConfig ?? metadata.phase_config;
  if (!phaseConfig || typeof phaseConfig !== 'object' || Array.isArray(phaseConfig)) {
    return null;
  }

  return phaseConfig;
}

export function useMotionControlPresetState({
  generationTypeMode,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  motionMode,
  settingsLoading,
  autoSelectDefaultPreset = true,
  onMotionModeChange,
}: UseMotionControlPresetStateParams) {
  const builtinDefaultPreset = useMemo(
    () => (generationTypeMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET),
    [generationTypeMode],
  );

  const builtinDefaultId = useMemo(
    () => (generationTypeMode === 'vace' ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID),
    [generationTypeMode],
  );

  const displaySelectedPhasePresetId = selectedPhasePresetId
    ?? (autoSelectDefaultPreset === false && motionMode === 'basic' ? builtinDefaultPreset.id : null);
  const isCustomConfig = !displaySelectedPhasePresetId;

  const allPresets = useMemo<MotionPresetOption[]>(() => [builtinDefaultPreset], [builtinDefaultPreset]);

  usePresetAutoSelect({
    builtinDefaultPreset,
    selectedPhasePresetId,
    onPhasePresetSelect,
    settingsLoading,
    motionMode,
    enabled: autoSelectDefaultPreset,
  });

  const handleCustomClick = useCallback(() => {
    onPhasePresetRemove();
    onMotionModeChange('advanced');
  }, [onPhasePresetRemove, onMotionModeChange]);

  const handlePresetSelect = useCallback(
    (preset: PhasePresetSelection) => {
      const selectedConfig = resolvePresetConfig(preset);
      if (selectedConfig) {
        onPhasePresetSelect(preset.id, selectedConfig, (preset.metadata ?? undefined) as PresetMetadata);
      }
    },
    [onPhasePresetSelect],
  );

  return {
    allPresets,
    builtinDefaultId,
    isCustomConfig,
    displaySelectedPhasePresetId,
    handleCustomClick,
    handlePresetSelect,
  };
}
