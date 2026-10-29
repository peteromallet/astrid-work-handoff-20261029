import type { ReactNode } from 'react';
import { PhaseConfig } from '@/shared/types/phaseConfig';

export type MotionMode = 'basic' | 'advanced';
type GenerationTypeMode = 'i2v' | 'vace';

export interface PresetSampleGeneration {
  url: string;
  type: 'video' | 'image';
  alt_text?: string;
}

export interface PresetMetadata {
  name: string;
  description?: string;
  phaseConfig: PhaseConfig;
  generationTypeMode?: GenerationTypeMode;
  sample_generations?: PresetSampleGeneration[];
  is_public?: boolean;
  use_count?: number;
  tags?: string[];
}

export interface BuiltinPreset {
  id: string;
  metadata: PresetMetadata & {
    description: string;
    generationTypeMode: GenerationTypeMode;
  };
}

export interface MotionPresetSelectorProps {
  builtinPreset: BuiltinPreset;
  selectedPhasePresetId: string | null;
  phaseConfig?: PhaseConfig;
  motionMode: MotionMode;
  onPresetSelect: (presetId: string, config: PhaseConfig, metadata?: PresetMetadata) => void;
  onPresetRemove: () => void;
  onModeChange: (mode: MotionMode) => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onRestoreDefaults?: () => void;
  randomSeed?: boolean;
  onRandomSeedChange?: (value: boolean) => void;
  advancedDisabled?: boolean;
  advancedDisabledReason?: string;
  presetTooltip?: string;
  renderBasicModeContent?: () => ReactNode;
  labelSuffix?: ReactNode;
}
