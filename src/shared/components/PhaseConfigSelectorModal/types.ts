import type { PhaseConfig, PhaseSettings } from '@/shared/types/phaseConfig';

export interface PhaseConfigVerticalProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  onRestoreDefaults?: () => void;
}

export interface PhaseGlobalSettingsProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
}

export interface PerPhaseCardProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  phaseIdx: number;
  phase: PhaseSettings;
  label: string;
  focusedLoraInput: string | null;
  onFocusLoraInput: (id: string | null) => void;
  onBlurSave?: () => void;
}
