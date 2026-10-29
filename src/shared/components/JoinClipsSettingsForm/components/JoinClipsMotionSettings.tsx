import { LoraManager } from '@/domains/lora/components';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import type { PresetMetadata } from '@/shared/components/MotionPresetSelector/types';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components/SectionHeader';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { BUILTIN_JOIN_CLIPS_PRESET } from '../constants';

interface JoinClipsMotionSettingsProps {
  projectId: string | null;
  loraPersistenceKey: string;
  loraManager?: LoraManagerState;
  motionMode: 'basic' | 'advanced';
  onMotionModeChange?: (mode: 'basic' | 'advanced') => void;
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange?: (config: PhaseConfig) => void;
  randomSeed: boolean;
  onRandomSeedChange?: (val: boolean) => void;
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (
    presetId: string,
    config: PhaseConfig,
    presetMetadata?: PresetMetadata,
  ) => void;
  onPhasePresetRemove?: () => void;
}

export function JoinClipsMotionSettings({
  projectId,
  loraPersistenceKey,
  loraManager,
  motionMode,
  onMotionModeChange,
  phaseConfig,
  onPhaseConfigChange,
  randomSeed,
  onRandomSeedChange,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
}: JoinClipsMotionSettingsProps) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Motion" theme="orange" />
      <MotionPresetSelector
        builtinPreset={BUILTIN_JOIN_CLIPS_PRESET}
        selectedPhasePresetId={selectedPhasePresetId ?? null}
        phaseConfig={phaseConfig}
        motionMode={motionMode}
        onPresetSelect={onPhasePresetSelect || (() => {})}
        onPresetRemove={onPhasePresetRemove || (() => {})}
        onModeChange={onMotionModeChange || (() => {})}
        onPhaseConfigChange={onPhaseConfigChange || (() => {})}
        randomSeed={randomSeed}
        onRandomSeedChange={onRandomSeedChange}
        renderBasicModeContent={() => (
          <LoraManager
            projectId={projectId || undefined}
            persistenceScope="project"
            enableProjectPersistence={true}
            persistenceKey={loraPersistenceKey}
            externalLoraManager={loraManager}
            title="Additional LoRA Models (Optional)"
          />
        )}
      />
    </div>
  );
}
