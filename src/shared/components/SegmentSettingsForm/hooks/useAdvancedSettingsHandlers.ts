import { useCallback } from 'react';
import { stripModeFromPhaseConfig } from '../segmentSettingsUtils';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { SegmentSettings, SegmentSettingsFormProps } from '../types';
import { useModelChange } from './useModelChange';

interface UseAdvancedSettingsHandlersParams {
  onChange: (updates: Partial<SegmentSettings>) => void;
  settings: SegmentSettings;
  shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
  effectiveLoras: NonNullable<SegmentSettings['loras']>;
}

export function useAdvancedSettingsHandlers({
  onChange,
  settings,
  shotDefaults,
  effectiveLoras,
}: UseAdvancedSettingsHandlersParams) {
  const handleMotionModeChange = useCallback(
    (mode: 'basic' | 'advanced') => {
      onChange({
        motionMode: mode,
        phaseConfig:
          mode === 'basic' && !settings.selectedPhasePresetId
            ? undefined
            : (settings.phaseConfig ?? shotDefaults?.phaseConfig),
      });
    },
    [onChange, settings.phaseConfig, settings.selectedPhasePresetId, shotDefaults?.phaseConfig]
  );

  const handlePhaseConfigChange = useCallback(
    (config: PhaseConfig) => {
      onChange({
        phaseConfig: stripModeFromPhaseConfig(config),
      });
    },
    [onChange]
  );

  const handlePhasePresetSelect = useCallback(
    (presetId: string, config: PhaseConfig) => {
      onChange({
        selectedPhasePresetId: presetId,
        phaseConfig: stripModeFromPhaseConfig(config),
      });
    },
    [onChange]
  );

  const handlePhasePresetRemove = useCallback(() => {
    onChange({
      selectedPhasePresetId: null,
      ...(settings.motionMode !== 'advanced' && { phaseConfig: undefined }),
    });
  }, [onChange, settings.motionMode]);

  const handleRandomSeedChange = useCallback(
    (value: boolean) => {
      onChange({ randomSeed: value });
    },
    [onChange]
  );

  const handleRemoveLora = useCallback(
    (loraId: string) => {
      onChange({
        loras: effectiveLoras.filter(
          (existing) => existing.id !== loraId && existing.path !== loraId
        ),
      });
    },
    [effectiveLoras, onChange]
  );

  const handleLoraStrengthChange = useCallback(
    (loraId: string, strength: number) => {
      onChange({
        loras: effectiveLoras.map((existing) =>
          existing.id === loraId || existing.path === loraId
            ? { ...existing, strength }
            : existing
        ),
      });
    },
    [effectiveLoras, onChange]
  );

  const handleModelChange = useModelChange({ onChange, settings, shotDefaults });

  return {
    handleMotionModeChange,
    handlePhaseConfigChange,
    handlePhasePresetSelect,
    handlePhasePresetRemove,
    handleRandomSeedChange,
    handleRemoveLora,
    handleLoraStrengthChange,
    handleModelChange,
  };
}
